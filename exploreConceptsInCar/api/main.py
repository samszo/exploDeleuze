#!/usr/bin/env python3
"""
API légère devant Meilisearch — la seule chose que l'app (voiture ou
téléphone) appelle. La lecture ne touche jamais à Omeka S ni à MySQL : tout ce
qui est servi ici vient des index construits par scripts/export_meilisearch.py.

Les signalements collaboratifs de la PWA (web/app/) sont écrits tels quels en
JSON dans SIGNAL_DIR pour un import Omeka ultérieur — on ne fait que vérifier
le jeton d'identité auprès du fournisseur tiers (Google) au passage.

Lancer en dev :
    ./.venv/bin/uvicorn api.main:app --reload --port 8000

Découverte interactive des endpoints : http://127.0.0.1:8000/docs
"""
import json
import os
import time
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import httpx
import meilisearch
from dotenv import load_dotenv
from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv()

MEILI_URL = os.environ.get("MEILI_URL", "http://127.0.0.1:7700")
MEILI_KEY = os.environ.get("MEILI_KEY") or None
AUDIO_DIR = os.environ["OUT_DIR"]

# --- signalements collaboratifs (voir web/app/) ---
# Un fichier JSON par signalement, à réimporter plus tard dans Omeka S.
SIGNAL_DIR = Path(os.environ.get("SIGNAL_DIR", "signalements"))
SIGNAL_EXPORT_KEY = os.environ.get("SIGNAL_EXPORT_KEY") or None
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID") or None
SIGNAL_TYPES = {"personne", "oeuvre", "date", "lieu", "correction"}

client = meilisearch.Client(MEILI_URL, MEILI_KEY)
idx_conferences = client.index("conferences")
idx_fragments = client.index("fragments")
idx_concepts = client.index("concepts")

app = FastAPI(title="Flux Conceptuel — API", version="0.1.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)
app.mount("/audio", StaticFiles(directory=AUDIO_DIR), name="audio")


def audio_url(filename: str) -> str:
    return f"/audio/{filename}"


def fmt_hms(seconds) -> str:
    seconds = int(seconds or 0)
    h, r = divmod(seconds, 3600)
    m, s = divmod(r, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def enrich_fragment(hit: dict) -> dict:
    hit["audio_url"] = audio_url(hit["audio_file"])
    hit["timecode"] = fmt_hms(hit["start"])
    return hit


# ---------- catalogue ----------

@app.get("/api/themes")
def list_themes():
    """Écran d'accueil : les thèmes de cours, du plus fourni au moins fourni."""
    res = idx_conferences.search("", {"facets": ["theme"], "limit": 0})
    dist = res["facetDistribution"]["theme"]
    return sorted(
        [{"theme": k, "seance_count": v} for k, v in dist.items()],
        key=lambda t: -t["seance_count"],
    )


@app.get("/api/themes/{theme}/seances")
def list_seances(theme: str):
    """Les séances d'un thème (chaque séance = un enregistrement de cours),
    dans l'ordre chronologique."""
    res = idx_conferences.search(
        "", {"filter": f'theme = "{theme}"', "sort": ["num:asc"], "limit": 200}
    )
    if not res["hits"]:
        raise HTTPException(404, "thème introuvable")
    return res["hits"]


@app.get("/api/seances/{id}")
def get_seance(id: int):
    """Détail d'une séance + la liste ordonnée de ses fragments transcrits.

    L'ordre de lecture est donné par `id` (idTrans) croissant, PAS par `start` :
    un cours s'étale sur plusieurs disques BnF (172 des 176 séances), et `start`
    repart de 0 à chaque disque. Trier par `start` entrelacerait les disques.
    `id` (= `idFrag` dans les faits, ordre identique et vérifié sur tout le
    corpus) suit disque → plage → timecode."""
    try:
        seance = dict(idx_conferences.get_document(id))
    except Exception:
        raise HTTPException(404, "séance introuvable")
    frags = idx_fragments.search("", {"filter": f"idConf = {id}", "limit": 1000})
    ordered = sorted(frags["hits"], key=lambda h: h["id"])
    seance["fragments"] = [enrich_fragment(h) for h in ordered]
    return seance


@app.get("/api/fragments/{id}")
def get_fragment(id: int):
    """Un fragment isolé — écran lecteur : texte, audio, concepts détectés."""
    try:
        frag = dict(idx_fragments.get_document(id))
    except Exception:
        raise HTTPException(404, "fragment introuvable")
    return enrich_fragment(frag)


# ---------- recherche ----------

@app.get("/api/search")
def search(
    q: str = "",
    theme: Optional[str] = None,
    idConf: Optional[int] = None,
    limit: int = Query(20, le=100),
    offset: int = 0,
):
    """Recherche plein texte dans les transcriptions (écran Recherche),
    filtrable par thème ou par séance précise."""
    filters = []
    if theme:
        filters.append(f'conf_theme = "{theme}"')
    if idConf is not None:
        filters.append(f"idConf = {idConf}")
    params = {"limit": limit, "offset": offset, "attributesToHighlight": ["texte"]}
    if filters:
        params["filter"] = " AND ".join(filters)
    res = idx_fragments.search(q, params)
    res["hits"] = [enrich_fragment(h) for h in res["hits"]]
    return res


@app.get("/api/concepts/resolve")
def resolve_concept(q: str, limit: int = Query(5, le=20)):
    """Résout une expression dictée (approximative, fautes tolérées) vers
    les concepts les plus probables — sert la commande vocale
    « agence X avec Y » : X et Y passent chacun par ici."""
    res = idx_concepts.search(q, {"limit": limit})
    return res["hits"]


# ---------- topologie ----------

@app.get("/api/topology")
def topology(
    concept: str,
    depth: int = Query(1, ge=1, le=2),
    fanout: int = Query(6, le=15),
    max_fragments: int = Query(300, le=1000),
):
    """Graphe de co-occurrence centré sur `concept` : les autres concepts qui
    apparaissent dans les mêmes fragments, pondérés par le nombre de
    fragments partagés. Calculé à la volée sur l'index — rien n'est
    pré-agrégé ni stocké ; `max_fragments` borne le coût de chaque saut."""

    def neighbors_of(label, exclude):
        res = idx_fragments.search(
            "", {"filter": f'concepts = "{label}"', "limit": max_fragments}
        )
        co = Counter()
        for hit in res["hits"]:
            for c in hit.get("concepts", []):
                if c != label and c not in exclude:
                    co[c] += 1
        return co.most_common(fanout), res["estimatedTotalHits"]

    seen = {concept}
    nodes = [{"id": concept, "label": concept, "hub": True}]
    edges = []
    frontier = [concept]
    total_mentions = 0

    for _ in range(depth):
        next_frontier = []
        for label in frontier:
            top, total = neighbors_of(label, seen)
            if label == concept:
                total_mentions = total
            for other, weight in top:
                if other not in seen:
                    seen.add(other)
                    nodes.append({"id": other, "label": other, "hub": False})
                    next_frontier.append(other)
                edges.append({"source": label, "target": other, "weight": weight})
        frontier = next_frontier
        if not frontier:
            break

    return {
        "concept": concept,
        "mention_count": total_mentions,
        "nodes": nodes,
        "edges": edges,
    }


@app.get("/api/health")
def health():
    return {"status": "ok", "meilisearch": client.health()}


# ---------- signalements collaboratifs ----------
#
# La PWA (web/app/) laisse un utilisateur connecté (auth tierce, Google pour
# l'instant) signaler une correction de transcription ou une référence
# (personne, œuvre, date, lieu) à un instant d'un fragment. On ne touche pas
# Omeka S ici : chaque signalement est écrit tel quel en JSON dans SIGNAL_DIR,
# pour un import ultérieur. L'identité (provider + sub + email + name) est
# conservée pour rattacher/créer le compte Omeka au moment de cet import.


class Signalement(BaseModel):
    id_token: str                       # jeton d'identité du fournisseur (Google : id_token)
    provider: str = "google"
    idConf: int
    idTrans: int
    idFrag: Optional[int] = None
    type: str
    texte: str = ""
    remplacer: Optional[str] = None
    par: Optional[str] = None
    surTout: bool = False
    timecode: Optional[float] = None
    lien: Optional[str] = None


async def verify_identity(provider: str, token: str) -> dict:
    """Valide le jeton auprès du fournisseur et renvoie {provider, sub, email, name}.
    Google : appel à l'endpoint tokeninfo (validation complète côté Google)."""
    if provider != "google":
        raise HTTPException(400, f"fournisseur non géré : {provider}")
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(503, "auth Google non configurée (GOOGLE_CLIENT_ID absent)")
    try:
        async with httpx.AsyncClient(timeout=8) as h:
            r = await h.get("https://oauth2.googleapis.com/tokeninfo", params={"id_token": token})
        data = r.json()
    except Exception:
        raise HTTPException(502, "vérification du jeton impossible")
    if r.status_code != 200 or "sub" not in data:
        raise HTTPException(401, "jeton invalide")
    if data.get("aud") != GOOGLE_CLIENT_ID:
        raise HTTPException(401, "jeton émis pour une autre application")
    if data.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(401, "émetteur inattendu")
    if int(data.get("exp", 0)) < time.time():
        raise HTTPException(401, "jeton expiré")
    return {
        "provider": "google",
        "sub": data["sub"],
        "email": data.get("email"),
        "email_verified": data.get("email_verified") in ("true", True),
        "name": data.get("name") or data.get("email"),
    }


@app.get("/api/auth/providers")
def auth_providers():
    """Fournisseurs d'authentification tierce activés (la PWA n'affiche que
    ceux-là). Renvoie l'ID client public, jamais de secret."""
    out = {}
    if GOOGLE_CLIENT_ID:
        out["google"] = {"client_id": GOOGLE_CLIENT_ID}
    return out


@app.post("/api/signalements")
async def create_signalement(s: Signalement = Body(...)):
    if s.type not in SIGNAL_TYPES:
        raise HTTPException(400, f"type inconnu : {s.type}")
    if s.type == "correction" and not (s.remplacer or "").strip():
        raise HTTPException(400, "correction : 'remplacer' est requis")
    if s.type != "correction" and not s.texte.strip():
        raise HTTPException(400, "texte requis")

    user = await verify_identity(s.provider, s.id_token)

    texte = s.texte.strip()
    if s.type == "correction" and not texte:
        texte = f"Remplacer « {(s.remplacer or '').strip()} » par « {(s.par or '').strip()} »"
        if s.surTout:
            texte += " (toute la séance)"

    now = datetime.now(timezone.utc)
    rec = {
        "id": uuid.uuid4().hex,
        "created_at": now.isoformat(),
        "user": user,
        "idConf": s.idConf,
        "idTrans": s.idTrans,
        "idFrag": s.idFrag,
        "type": s.type,
        "texte": texte,
        "remplacer": (s.remplacer or None),
        "par": (s.par or None),
        "surTout": s.surTout,
        "timecode": s.timecode,
        "lien": s.lien,
    }
    SIGNAL_DIR.mkdir(parents=True, exist_ok=True)
    fname = f"{now.strftime('%Y%m%dT%H%M%S')}-{rec['id'][:8]}.json"
    (SIGNAL_DIR / fname).write_text(json.dumps(rec, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"id": rec["id"], "status": "recorded", "file": fname}


@app.get("/api/signalements/export")
def export_signalements(key: str = Query(...)):
    """Tous les signalements en un seul tableau JSON, pour l'import Omeka S.
    Protégé par SIGNAL_EXPORT_KEY (défini dans le .env)."""
    if not SIGNAL_EXPORT_KEY or key != SIGNAL_EXPORT_KEY:
        raise HTTPException(403, "clé invalide")
    if not SIGNAL_DIR.exists():
        return []
    out = []
    for f in sorted(SIGNAL_DIR.glob("*.json")):
        try:
            out.append(json.loads(f.read_text(encoding="utf-8")))
        except Exception:
            continue
    return out


# Le prototype (web/index.html) est servi par ce même serveur, à la racine —
# même origine que /api et /audio, donc pas de CORS à gérer côté client, et
# le téléphone n'a besoin que d'une seule adresse (http://<ip-du-mac>:8000/).
# Monté en dernier : les routes /api/* et /audio/* ci-dessus restent
# prioritaires sur ce catch-all.
WEB_DIR = os.path.join(os.path.dirname(__file__), "..", "web")
app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
