#!/usr/bin/env python3
"""
Construit et publie dans Meilisearch les trois index qui alimentent l'app :

  - conferences : catalogue des cours (accueil, navigation par thème)
  - fragments   : les transcriptions (recherche plein texte, lecteur)
  - concepts    : le vocabulaire de concepts (résolution des commandes
                  vocales « agence X avec Y », topologie)

Lecture seule sur la base Omeka S — aucune écriture, aucune modification.
Idempotent : chaque exécution reconstruit entièrement les trois index, donc
peut être relancée à volonté (après de nouvelles transcriptions, par ex.)
sans étape de nettoyage préalable.

Périmètre retenu (voir README section « Choix de scope ») :
  - uniquement les transcriptions de l'agent WhisperSpeechToText ;
  - uniquement celles dont idConf pointe vers un cours qui existe encore
    dans `conferences` (exclut 129 fragments orphelins déjà écartés du
    lot de conversion audio — mêmes lignes dans les deux cas) ;
  - les labels de concepts sans aucune lettre (ponctuation seule, ~400
    sur 48 357) sont exclus : ils ne sont ni affichables ni résolvables
    par la voix.

Usage :
    ./.venv/bin/python3 scripts/export_meilisearch.py
"""
import json
import os
import time
from collections import defaultdict

import pymysql
import pymysql.cursors
import meilisearch
from dotenv import load_dotenv

from mine_concept_phrases import is_stopword_or_punct

load_dotenv()

DB_CONFIG = dict(
    host=os.environ["DB_HOST"],
    user=os.environ["DB_USER"],
    password=os.environ["DB_PASS"],
    database=os.environ["DB_NAME"],
    charset="utf8mb4",
    cursorclass=pymysql.cursors.DictCursor,
)
MEILI_URL = os.environ.get("MEILI_URL", "http://127.0.0.1:7700")
MEILI_KEY = os.environ.get("MEILI_KEY") or None

BATCH_SIZE = 2000
AGENT = "WhisperSpeechToText"

# Concepts composés minés par scripts/mine_concept_phrases.py (tokens
# adjacents de timeline_concept regroupés par récurrence dans le corpus,
# ex. "machine de guerre"). Leurs ids sont décalés loin au-dessus du plus
# grand id réel de `concepts` (3 441 783 à ce jour) pour ne jamais entrer
# en collision dans l'index Meilisearch partagé.
PHRASES_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "concept_phrases.json")
PHRASE_ID_BASE = 10_000_000


def connect_db():
    return pymysql.connect(**DB_CONFIG)


def load_phrases():
    if not os.path.exists(PHRASES_PATH):
        print(f"  (pas d'artefact {PHRASES_PATH} — lancez scripts/mine_concept_phrases.py d'abord "
              f"pour avoir des concepts composés ; on continue avec les concepts à un seul mot)")
        return []
    with open(PHRASES_PATH, encoding="utf-8") as f:
        return json.load(f)


def build_phrase_index(phrases):
    """token de départ -> liste des séquences de tokens candidates, les plus
    longues d'abord (pour un plus-long-préfixe-gagne lors de la fusion)."""
    by_first_token = defaultdict(list)
    by_tokens = {}
    for p in phrases:
        tokens = tuple(p["tokens"])
        by_tokens[tokens] = p
        by_first_token[tokens[0]].append(tokens)
    for k in by_first_token:
        by_first_token[k].sort(key=len, reverse=True)
    return by_first_token, by_tokens


def merge_fragment_concepts(ordered, phrase_idx, phrase_by_tokens):
    """ordered : [(concept_id, label, start, end), ...] trié par start pour
    UN fragment. Fusionne, en glissant de gauche à droite, toute séquence
    qui correspond à une phrase minée confirmée (plus longue d'abord),
    et déduplique le résultat par id final. Retourne [(id, label), ...]
    dans l'ordre de première apparition."""
    labels = [o[1] for o in ordered]
    n = len(labels)
    i = 0
    seen = set()
    out = []
    while i < n:
        matched = None
        for cand in phrase_idx.get(labels[i], ()):
            L = len(cand)
            if i + L <= n and tuple(labels[i : i + L]) == cand:
                matched = cand
                break
        if matched:
            phrase = phrase_by_tokens[matched]
            pid = PHRASE_ID_BASE + phrase["phrase_id"]
            if pid not in seen:
                seen.add(pid)
                out.append((pid, phrase["label"]))
            i += len(matched)
        else:
            cid, label = ordered[i][0], ordered[i][1]
            if cid not in seen:
                seen.add(cid)
                out.append((cid, label))
            i += 1
    return out


def push(client, index, docs, primary_key="id"):
    """Envoie les documents par lots et attend chaque lot avant le suivant
    (plus lent, mais donne une progression lisible et évite de saturer la
    file de tâches de Meilisearch sur un run de dizaines de milliers de docs)."""
    for i in range(0, len(docs), BATCH_SIZE):
        batch = docs[i : i + BATCH_SIZE]
        task = index.add_documents(batch, primary_key=primary_key)
        client.wait_for_task(task.task_uid)
        print(f"    {min(i + BATCH_SIZE, len(docs))}/{len(docs)}", end="\r")
    print()


def export_conferences(conn, client):
    print("→ conferences")
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT c.id, c.titre, c.theme, c.promo, c.num, c.created AS date,
                   c.source, c.ref, c.sujets,
                   (SELECT COUNT(*) FROM transcriptions t
                     WHERE t.idConf = c.id AND t.agent = %s) AS frag_count
            FROM conferences c
            """,
            (AGENT,),
        )
        rows = cur.fetchall()

    docs = []
    for r in rows:
        try:
            sujets = [s["label"] for s in json.loads(r["sujets"] or "[]")]
        except (ValueError, TypeError):
            sujets = []
        docs.append(
            {
                "id": r["id"],
                "titre": r["titre"],
                "theme": r["theme"],
                "promo": r["promo"],
                "num": r["num"],
                "date": r["date"].isoformat() if r["date"] else None,
                "source": r["source"],
                "ref": r["ref"],
                "sujets": sujets,
                "frag_count": r["frag_count"],
            }
        )

    index = client.index("conferences")
    index.update_settings(
        {
            "searchableAttributes": ["titre", "theme", "sujets"],
            "filterableAttributes": ["theme", "promo"],
            "sortableAttributes": ["date", "num", "frag_count"],
        }
    )
    push(client, index, docs)
    print(f"  {len(docs)} cours indexés")


def export_concepts(conn, client, phrases):
    print("→ concepts")
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT c.id, c.label,
                   COUNT(*) AS occurrence_count,
                   COUNT(DISTINCT tc.idTrans) AS fragment_count
            FROM concepts c
            JOIN timeline_concept tc ON tc.idConcept = c.id
            WHERE c.label REGEXP '[[:alpha:]]'
            GROUP BY c.id, c.label
            """
        )
        rows = cur.fetchall()

    # Un mot vide ("la", "que", "est"...) n'est pas un concept exploitable en
    # tant que tel (ni affiché seul, ni ciblable en voix) — même lexique que
    # scripts/mine_concept_phrases.py, pour rester cohérent avec ce qui a été
    # accepté comme borne de concept composé.
    docs = [
        {
            "id": r["id"],
            "label": r["label"],
            "kind": "token",
            "n": 1,
            "occurrence_count": r["occurrence_count"],
            "fragment_count": r["fragment_count"],
        }
        for r in rows
        if not is_stopword_or_punct(r["label"])
    ]
    n_tokens = len(docs)

    # concepts composés (voir scripts/mine_concept_phrases.py) : mêmes champs,
    # id décalé au-dessus de tout id réel de `concepts` pour ne pas collisionner.
    for p in phrases:
        docs.append(
            {
                "id": PHRASE_ID_BASE + p["phrase_id"],
                "label": p["label"],
                "kind": "phrase",
                "n": p["n"],
                "occurrence_count": p["occurrence_count"],
                "fragment_count": p["fragment_count"],
            }
        )

    index = client.index("concepts")
    index.update_settings(
        {
            "searchableAttributes": ["label"],
            "filterableAttributes": ["kind", "n"],
            "sortableAttributes": ["occurrence_count", "fragment_count"],
            # après pertinence texte, on préfère les concepts qui reviennent
            # souvent : utile pour désambiguïser une commande vocale dictée
            # de façon approximative.
            "rankingRules": [
                "words",
                "typo",
                "proximity",
                "attribute",
                "exactness",
                "occurrence_count:desc",
            ],
        }
    )
    push(client, index, docs)
    print(f"  {n_tokens} concepts à un mot + {len(phrases)} concepts composés indexés")


def export_fragments(conn, client, phrase_idx, phrase_by_tokens):
    print("→ fragments : agrégation des concepts par fragment...")
    # idTrans -> [(concept_id, label, start, end), ...] DANS L'ORDRE (start) —
    # l'ordre est nécessaire pour repasser la fusion de phrases token par token,
    # donc pas de dédoublonnage ici (il a lieu après la fusion, dans merge_fragment_concepts).
    concepts_by_frag = defaultdict(list)
    with conn.cursor(pymysql.cursors.SSDictCursor) as cur:
        cur.execute(
            """
            SELECT tc.idTrans, tc.start, tc.end, c.id AS concept_id, c.label
            FROM timeline_concept tc
            JOIN concepts c ON c.id = tc.idConcept
            JOIN transcriptions t ON t.id = tc.idTrans
            WHERE t.agent = %s
              AND t.idConf IN (SELECT id FROM conferences)
              AND c.label REGEXP '[[:alpha:]]'
            ORDER BY tc.idTrans, tc.start
            """,
            (AGENT,),
        )
        for row in cur:
            concepts_by_frag[row["idTrans"]].append(
                (row["concept_id"], row["label"], row["start"], row["end"])
            )
    print(f"  concepts agrégés pour {len(concepts_by_frag)} fragments")

    print("→ fragments : lecture des transcriptions...")
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT t.id, t.idConf, t.idFrag, t.texte, t.start, t.end, t.file,
                   c.titre AS conf_titre, c.theme AS conf_theme,
                   c.promo AS conf_promo, c.num AS conf_num, c.created AS conf_date
            FROM transcriptions t
            JOIN conferences c ON c.id = t.idConf
            WHERE t.agent = %s
            """,
            (AGENT,),
        )
        rows = cur.fetchall()

    docs = []
    for r in rows:
        ordered = concepts_by_frag.get(r["id"], [])
        merged = merge_fragment_concepts(ordered, phrase_idx, phrase_by_tokens)
        # les entrées "phrase" (id >= PHRASE_ID_BASE) ont déjà passé le filtre
        # de mots vides à la construction de data/concept_phrases.json ; seuls
        # les tokens isolés restants doivent encore être filtrés ici.
        merged = [
            (cid, label)
            for cid, label in merged
            if cid >= PHRASE_ID_BASE or not is_stopword_or_punct(label)
        ]
        stem = os.path.splitext(os.path.basename(r["file"]))[0]
        docs.append(
            {
                "id": r["id"],
                "idConf": r["idConf"],
                "idFrag": r["idFrag"],
                "conf_titre": r["conf_titre"],
                "conf_theme": r["conf_theme"],
                "conf_promo": r["conf_promo"],
                "conf_num": r["conf_num"],
                "conf_date": r["conf_date"].isoformat() if r["conf_date"] else None,
                "texte": r["texte"],
                "start": r["start"],
                "end": r["end"],
                "audio_file": f"{stem}.opus",
                "concept_ids": [cid for cid, _ in merged],
                "concepts": [label for _, label in merged],
            }
        )

    index = client.index("fragments")
    index.update_settings(
        {
            "searchableAttributes": ["texte", "conf_titre", "conf_theme", "concepts"],
            "filterableAttributes": ["idConf", "conf_theme", "conf_promo", "concepts"],
            # `id` (idTrans) : ordre de lecture des fragments d'un cours. Ne PAS
            # trier par `start` — un cours s'étale sur plusieurs disques BnF
            # (172/176 séances) et `start` repart de 0 à chaque disque.
            "sortableAttributes": ["idConf", "id", "idFrag", "start", "conf_date"],
        }
    )
    push(client, index, docs)
    print(f"  {len(docs)} fragments indexés")


def main():
    t0 = time.time()
    client = meilisearch.Client(MEILI_URL, MEILI_KEY)
    phrases = load_phrases()
    phrase_idx, phrase_by_tokens = build_phrase_index(phrases)
    conn = connect_db()
    try:
        export_conferences(conn, client)
        export_concepts(conn, client, phrases)
        export_fragments(conn, client, phrase_idx, phrase_by_tokens)
    finally:
        conn.close()
    print(f"Terminé en {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
