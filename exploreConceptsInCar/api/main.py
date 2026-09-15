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
import base64
import hashlib
import hmac
import json
import os
import secrets
import subprocess
import sys
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

# --- comptes gérés par l'API elle-même (alternative à la connexion Google) ---
# Un seul fichier JSON {email: {name, salt, hash, created_at}} — mots de passe
# stockés en PBKDF2-HMAC-SHA256 salé, jamais en clair. AUTH_SECRET signe les
# jetons de session (HMAC) ; sans lui, une clé aléatoire est générée au
# démarrage : les comptes fonctionnent quand même, mais toute session est
# invalidée au redémarrage du service — à définir dans .env pour la prod.
ACCOUNTS_FILE = Path(os.environ.get("ACCOUNTS_FILE", "accounts.json"))
AUTH_SECRET = os.environ.get("AUTH_SECRET")
if not AUTH_SECRET:
    AUTH_SECRET = secrets.token_hex(32)
    print(
        "AVERTISSEMENT: AUTH_SECRET absent du .env — jetons de session signés avec "
        "une clé aléatoire générée au démarrage (sessions invalidées à chaque "
        "redémarrage). Définissez AUTH_SECRET pour des sessions persistantes.",
        file=sys.stderr,
    )
TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30  # 30 jours

GITHUB_REPO = "https://github.com/samszo/exploDeleuze"


def _current_commit() -> Optional[str]:
    """Hash court du commit courant (dépôt monorepo exploDeleuze) — calculé une
    fois au démarrage du process : un redémarrage (`systemctl restart flux-api`)
    est de toute façon nécessaire pour qu'un déploiement soit pris en compte
    (voir docs/DEPLOYMENT.md §9), donc pas besoin de le revérifier à chaque requête."""
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=os.path.dirname(__file__), stderr=subprocess.DEVNULL, timeout=3,
        ).decode().strip() or None
    except Exception:
        return None


CURRENT_COMMIT = _current_commit()

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


@app.get("/api/version")
def version():
    """Version courante de l'app — écran Paramètres de la PWA (web/app/)."""
    return {
        "commit": CURRENT_COMMIT,
        "commit_url": f"{GITHUB_REPO}/commit/{CURRENT_COMMIT}" if CURRENT_COMMIT else None,
        "repo_url": f"{GITHUB_REPO}/tree/main/exploreConceptsInCar",
        "docs_url": f"{GITHUB_REPO}/blob/main/exploreConceptsInCar/docs/README.md",
    }


# ---------- signalements collaboratifs ----------
#
# La PWA (web/app/) laisse un utilisateur connecté (auth tierce, Google pour
# l'instant) signaler une correction de transcription ou une référence
# (personne, œuvre, date, lieu) à un instant d'un fragment. On ne touche pas
# Omeka S ici : chaque signalement est écrit tel quel en JSON dans SIGNAL_DIR,
# pour un import ultérieur. L'identité (provider + sub + email + name) est
# conservée pour rattacher/créer le compte Omeka au moment de cet import.


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def create_local_token(email: str, name: str) -> tuple[str, int]:
    """Jeton de session pour un compte géré par l'API : payload JSON signé par
    HMAC-SHA256 (AUTH_SECRET), pas de dépendance JWT externe — on est à la fois
    émetteur et unique vérificateur, un format maison suffit."""
    exp = int(time.time()) + TOKEN_TTL_SECONDS
    payload_b64 = _b64url_encode(json.dumps({"sub": email, "name": name, "exp": exp}, ensure_ascii=False).encode())
    sig = hmac.new(AUTH_SECRET.encode(), payload_b64.encode(), hashlib.sha256).digest()
    return f"{payload_b64}.{_b64url_encode(sig)}", exp


def verify_local_token(token: str) -> dict:
    try:
        payload_b64, sig_b64 = token.split(".", 1)
    except ValueError:
        raise HTTPException(401, "jeton invalide")
    expected_sig = hmac.new(AUTH_SECRET.encode(), payload_b64.encode(), hashlib.sha256).digest()
    if not hmac.compare_digest(_b64url_encode(expected_sig), sig_b64):
        raise HTTPException(401, "jeton invalide")
    try:
        payload = json.loads(_b64url_decode(payload_b64))
    except Exception:
        raise HTTPException(401, "jeton invalide")
    if payload.get("exp", 0) < time.time():
        raise HTTPException(401, "jeton expiré")
    return payload


def _load_accounts() -> dict:
    if not ACCOUNTS_FILE.exists():
        return {}
    try:
        return json.loads(ACCOUNTS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_accounts(accounts: dict) -> None:
    ACCOUNTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    ACCOUNTS_FILE.write_text(json.dumps(accounts, ensure_ascii=False, indent=2), encoding="utf-8")


def _hash_password(password: str, salt: Optional[bytes] = None) -> tuple[str, str]:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
    return salt.hex(), digest.hex()


class RegisterBody(BaseModel):
    email: str
    password: str
    name: Optional[str] = None


class LoginBody(BaseModel):
    email: str
    password: str


@app.post("/api/auth/register")
def register(body: RegisterBody):
    email = body.email.strip().lower()
    if "@" not in email or len(email) < 5:
        raise HTTPException(400, "adresse e-mail invalide")
    if len(body.password) < 8:
        raise HTTPException(400, "le mot de passe doit faire au moins 8 caractères")
    accounts = _load_accounts()
    if email in accounts:
        raise HTTPException(409, "un compte existe déjà avec cet e-mail")
    salt_hex, hash_hex = _hash_password(body.password)
    name = (body.name or email.split("@")[0]).strip()
    accounts[email] = {
        "name": name,
        "salt": salt_hex,
        "hash": hash_hex,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _save_accounts(accounts)
    token, exp = create_local_token(email, name)
    return {"id_token": token, "provider": "api", "exp": exp, "profile": {"sub": email, "email": email, "name": name}}


@app.post("/api/auth/login")
def login(body: LoginBody):
    email = body.email.strip().lower()
    accounts = _load_accounts()
    account = accounts.get(email)
    # même message que mot de passe incorrect : ne pas révéler si l'e-mail existe
    if not account:
        raise HTTPException(401, "e-mail ou mot de passe incorrect")
    _, hash_hex = _hash_password(body.password, bytes.fromhex(account["salt"]))
    if not hmac.compare_digest(hash_hex, account["hash"]):
        raise HTTPException(401, "e-mail ou mot de passe incorrect")
    token, exp = create_local_token(email, account["name"])
    return {"id_token": token, "provider": "api", "exp": exp, "profile": {"sub": email, "email": email, "name": account["name"]}}


class Signalement(BaseModel):
    id_token: str                       # jeton d'identité du fournisseur (Google : id_token) ou de l'API (provider="api")
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
    selection: Optional[str] = None      # séquence de mots du fragment liée au signalement


async def verify_identity(provider: str, token: str) -> dict:
    """Valide le jeton auprès du fournisseur et renvoie {provider, sub, email, name}.
    Google : appel à l'endpoint tokeninfo (validation complète côté Google).
    "api" : compte géré par cette même API, jeton vérifié localement (HMAC)."""
    if provider == "api":
        payload = verify_local_token(token)
        return {"provider": "api", "sub": payload["sub"], "email": payload["sub"], "name": payload.get("name") or payload["sub"]}
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
    """Fournisseurs d'authentification activés (la PWA n'affiche que ceux-là).
    Renvoie l'ID client public, jamais de secret. "api" (comptes maison) est
    toujours disponible : il ne dépend d'aucune configuration tierce."""
    out = {"api": {"enabled": True}}
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
    if not (s.selection or "").strip():
        raise HTTPException(400, "sélectionnez la séquence de mots concernée dans le texte")

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
        "selection": (s.selection or "").strip() or None,
    }
    SIGNAL_DIR.mkdir(parents=True, exist_ok=True)
    fname = f"{now.strftime('%Y%m%dT%H%M%S')}-{rec['id'][:8]}.json"
    (SIGNAL_DIR / fname).write_text(json.dumps(rec, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"id": rec["id"], "status": "recorded", "file": fname}


@app.get("/api/signalements/fragment/{id_trans}")
def signalements_for_fragment(id_trans: int):
    """Signalements existants pour un fragment — affichés dans le lecteur au
    fil de la lecture, publics (lecture seule, pas de vérification de jeton) :
    contrairement à /mine, on ne renvoie que l'essentiel (jamais l'e-mail ou
    le sub du fournisseur), seul le nom d'affichage pour l'attribution."""
    if not SIGNAL_DIR.exists():
        return []
    out = []
    for f in sorted(SIGNAL_DIR.glob("*.json"), reverse=True):
        try:
            rec = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        if rec.get("idTrans") != id_trans:
            continue
        out.append({
            "type": rec.get("type"),
            "texte": rec.get("texte"),
            "remplacer": rec.get("remplacer"),
            "par": rec.get("par"),
            "selection": rec.get("selection"),
            "timecode": rec.get("timecode"),
            "created_at": rec.get("created_at"),
            "author": (rec.get("user") or {}).get("name"),
        })
    return out


@app.get("/api/signalements/mine")
async def my_signalements(id_token: str = Query(...), provider: str = Query("google")):
    """Signalements créés par l'utilisateur connecté — écran "Mes annotations"
    de la PWA. Le jeton est revérifié auprès du fournisseur (comme à la
    création) : pas de session côté serveur, on ne fait que filtrer les
    fichiers de SIGNAL_DIR sur l'identité (provider, sub) qu'il porte."""
    user = await verify_identity(provider, id_token)
    if not SIGNAL_DIR.exists():
        return []
    out = []
    for f in sorted(SIGNAL_DIR.glob("*.json"), reverse=True):
        try:
            rec = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        u = rec.get("user") or {}
        if u.get("provider") == user["provider"] and u.get("sub") == user["sub"]:
            out.append(rec)
    return out


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
