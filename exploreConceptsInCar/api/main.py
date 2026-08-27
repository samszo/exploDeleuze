#!/usr/bin/env python3
"""
API légère devant Meilisearch — la seule chose que l'app (voiture ou
téléphone) appelle. Ne touche jamais à Omeka S ni à MySQL : tout ce qui est
servi ici vient des index construits par scripts/export_meilisearch.py.

Lancer en dev :
    ./.venv/bin/uvicorn api.main:app --reload --port 8000

Découverte interactive des endpoints : http://127.0.0.1:8000/docs
"""
import os
from collections import Counter
from typing import Optional

import meilisearch
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

load_dotenv()

MEILI_URL = os.environ.get("MEILI_URL", "http://127.0.0.1:7700")
MEILI_KEY = os.environ.get("MEILI_KEY") or None
AUDIO_DIR = os.environ["OUT_DIR"]

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
    """Détail d'une séance + la liste ordonnée de ses fragments transcrits."""
    try:
        seance = dict(idx_conferences.get_document(id))
    except Exception:
        raise HTTPException(404, "séance introuvable")
    frags = idx_fragments.search(
        "", {"filter": f"idConf = {id}", "sort": ["start:asc"], "limit": 500}
    )
    seance["fragments"] = [enrich_fragment(h) for h in frags["hits"]]
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


# Le prototype (web/index.html) est servi par ce même serveur, à la racine —
# même origine que /api et /audio, donc pas de CORS à gérer côté client, et
# le téléphone n'a besoin que d'une seule adresse (http://<ip-du-mac>:8000/).
# Monté en dernier : les routes /api/* et /audio/* ci-dessus restent
# prioritaires sur ce catch-all.
WEB_DIR = os.path.join(os.path.dirname(__file__), "..", "web")
app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
