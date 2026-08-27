#!/usr/bin/env python3
"""
Regroupe les tokens adjacents de `timeline_concept` en concepts composés
(« machine de guerre », « corps sans organes »...), plutôt que de garder
un mapping un-token = un-concept.

Constat qui motive ce script (voir conversation) : `concepts`/`timeline_concept`
n'est pas une couche d'annotation sémantique — c'est la transcription mot à
mot, chaque mot devenant une ligne de `timeline_concept` avec un écart quasi
toujours nul (0.0 s) entre deux mots consécutifs (vérifié empiriquement :
p90 des écarts = 0.0 s). Le temps ne distingue donc rien ; le signal qui
distingue une vraie expression figée d'une suite de mots ordinaire, c'est
la RÉCURRENCE à travers tout le corpus — exactement le problème classique
d'extraction de collocations (même principe que l'algorithme « Phrases »
de word2vec/gensim), appliqué ici sur la séquence de tokens de
`timeline_concept` plutôt que sur le texte brut, ce qui a un avantage :
on récupère le timecode exact de chaque occurrence de la phrase composée.

Méthode :
  1. Pour chaque fragment, reconstruire la séquence ordonnée de tokens
     (avec leur timecode), coupée aux tokens de ponctuation pure.
  2. Dans chaque segment, générer les n-grammes (n=2..4) dont le PREMIER
     et le DERNIER token sont des mots pleins (ni mot vide, ni ponctuation)
     — un mot vide ne peut être que liaison interne ("de", "sans", "d'").
  3. Compter chaque n-gramme (par séquence exacte de labels) sur tout le
     corpus, garder ceux qui atteignent MIN_COUNT occurrences dans au
     moins MIN_FRAGMENTS fragments distincts — un one-off n'est qu'une
     coïncidence de syntaxe, une expression qui revient des dizaines de
     fois à travers des dizaines de cours est un concept récurrent.
  4. Désambiguïser les recouvrements (4-gramme vs 3-gramme vs 2-gramme
     qui partagent des tokens) par plus-long-préfixe-gagne.

Sortie : data/concept_phrases.json — un artefact dérivé, régénérable à
volonté. Aucune écriture sur la base Omeka S (lecture seule de bout en bout).

Usage :
    ./.venv/bin/python3 scripts/mine_concept_phrases.py
    ./.venv/bin/python3 scripts/mine_concept_phrases.py --min-count 5 --top 40
"""
import argparse
import json
import os
import re
from collections import Counter, defaultdict

import pymysql
import pymysql.cursors
from dotenv import load_dotenv

load_dotenv()

AGENT = "WhisperSpeechToText"
MAX_N = 4
OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "concept_phrases.json")

# Mots vides du français : liaison interne autorisée dans un n-gramme, mais
# jamais en première ou dernière position (une expression commence et finit
# sur un mot plein). Liste volontairement large (mieux vaut sur-filtrer le
# bruit grammatical que sous-filtrer).
STOPWORDS = set(
    """
le la les l' un une des du de d' au aux à
je j' tu il elle on nous vous ils elles ce c' ça cela ceci
qui que qu' quoi dont où lequel laquelle lesquels lesquelles
dans en sur sous avec sans pour par chez vers entre depuis pendant
malgré selon jusque jusqu' hors hormis via
et ou mais donc or ni car si comme quand lorsque lorsqu' puisque
alors ainsi aussi bien très plus moins encore déjà toujours jamais
ici là y ne n' pas non
se s' me m' te t' lui leur
son sa ses mon ma mes ton ta tes notre nos votre vos leurs
tout tous toute toutes autre autres même mêmes
cette cet ces celui celle ceux celles
être avoir suis es est sommes êtes sont étais était étions étiez étaient
fus fut fûmes fûtes furent serai seras sera serons serez seront
ai as a avons avez ont avais avait avions aviez avaient
eus eut eûmes eûtes eurent aurai auras aura aurons aurez auront
soit soient fût
voilà voici
quel quelle quels quelles quelque quelques chaque plusieurs aucun aucune
c'est c'était c'étaient n'est n'était n'a n'ai n'avait s'est s'était
qu'il qu'elle qu'on qu'ils qu'elles l'on j'ai j'étais m'a m'avait t'a
d'un d'une n'y s'il s'ils quelqu'un
qu ait aies ayons ayez aient aujourd hui
dire veut veux peut peux va fait faire voir vois voit voyez rien
pouvait pouvaient allons allez vont vais vas
""".split()
)

# Débris de tokenisation observés empiriquement : Whisper découpe les mots
# composés à trait d'union et les inversions sujet-verbe ("c'est-à-dire",
# "peut-être", "qu'est-ce que") en plusieurs tokens, dont certains gardent
# le trait d'union ("-à", "-dire", "-ce"). Ce ne sont jamais des bornes de
# concept valables — seul un token SANS trait d'union peut ouvrir ou fermer
# un n-gramme. Autre débris : une hésitation transcrite laisse une ellipsis
# collée au mot ("de..."), normalisée ici avant comparaison au lexique.
PUNCT_RE = re.compile(r"^[^\w]+$", re.UNICODE)
STRIP_CHARS = ".,;:!?…«»\"“”—–"


def is_stopword_or_punct(label):
    low = label.strip(STRIP_CHARS).lower()
    if "-" in low:
        return True
    return low in STOPWORDS or bool(PUNCT_RE.match(label)) or len(low) <= 1


def is_content(label):
    return not is_stopword_or_punct(label)


def connect_db():
    return pymysql.connect(
        host=os.environ["DB_HOST"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASS"],
        database=os.environ["DB_NAME"],
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )


def load_fragment_sequences(conn):
    """idTrans -> liste ordonnée de (label, start, end) — un seul aller-retour
    en base, en flux (SSDictCursor) pour ne pas charger les 3,1M lignes d'un
    coup en mémoire avant d'avoir fini de les regrouper par fragment."""
    seqs = defaultdict(list)
    with conn.cursor(pymysql.cursors.SSDictCursor) as cur:
        cur.execute(
            """
            SELECT tc.idTrans, tc.start, tc.end, c.label
            FROM timeline_concept tc
            JOIN concepts c ON c.id = tc.idConcept
            JOIN transcriptions t ON t.id = tc.idTrans
            WHERE t.agent = %s
              AND t.idConf IN (SELECT id FROM conferences)
            ORDER BY tc.idTrans, tc.start
            """,
            (AGENT,),
        )
        for row in cur:
            seqs[row["idTrans"]].append((row["label"], row["start"], row["end"]))
    return seqs


def segments_of(tokens):
    """Découpe une séquence de tokens en segments coupés aux ponctuations
    pures (on ne fait jamais courir une expression au travers d'une virgule
    ou d'un point)."""
    seg = []
    for label, start, end in tokens:
        if PUNCT_RE.match(label):
            if seg:
                yield seg
            seg = []
        else:
            seg.append((label, start, end))
    if seg:
        yield seg


def mine_candidates(seqs):
    """Compte chaque n-gramme (2..4) dont les bornes sont des mots pleins."""
    counts = Counter()
    frag_sets = defaultdict(set)  # ngram -> {idTrans, ...}
    first_span = {}  # ngram -> (idTrans, start, end) de sa 1re occurrence

    for idTrans, tokens in seqs.items():
        for seg in segments_of(tokens):
            n_tok = len(seg)
            for n in range(2, MAX_N + 1):
                for i in range(0, n_tok - n + 1):
                    window = seg[i : i + n]
                    if not is_content(window[0][0]) or not is_content(window[-1][0]):
                        continue
                    key = tuple(w[0] for w in window)
                    counts[key] += 1
                    frag_sets[key].add(idTrans)
                    if key not in first_span:
                        first_span[key] = (idTrans, window[0][1], window[-1][2])
    return counts, frag_sets, first_span


def filter_significant(counts, frag_sets, min_count, min_fragments):
    kept = {
        key: cnt
        for key, cnt in counts.items()
        if cnt >= min_count and len(frag_sets[key]) >= min_fragments
    }
    return kept


def dedupe_nested(kept):
    """Si un 3/4-gramme confirmé contient un 2/3-gramme lui aussi confirmé
    (même position, sous-séquence stricte), il n'a pas besoin d'être listé
    séparément pour l'application (plus-long-préfixe-gagne au moment de la
    reconstruction) — mais on les garde tous les deux dans l'artefact pour
    laisser l'appelant choisir sa granularité. Ici on retire uniquement les
    doublons triviaux (un n-gramme identique compté deux fois n'arrive pas
    par construction du Counter, donc pas d'action nécessaire)."""
    return kept


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-count", type=int, default=8, help="occurrences minimum dans tout le corpus")
    ap.add_argument("--min-fragments", type=int, default=5, help="fragments distincts minimum")
    ap.add_argument("--top", type=int, default=0, help="si >0, affiche les N meilleurs par taille de n-gramme et s'arrête (mode inspection)")
    args = ap.parse_args()

    conn = connect_db()
    print("Chargement des séquences de tokens par fragment...")
    seqs = load_fragment_sequences(conn)
    conn.close()
    print(f"  {len(seqs)} fragments, {sum(len(v) for v in seqs.values())} tokens au total")

    print("Extraction des n-grammes candidats (bornes = mots pleins)...")
    counts, frag_sets, first_span = mine_candidates(seqs)
    print(f"  {len(counts)} n-grammes distincts candidats")

    if args.top:
        by_n = defaultdict(list)
        for key, cnt in counts.items():
            by_n[len(key)].append((cnt, key))
        for n in sorted(by_n):
            print(f"\n--- top {args.top} pour n={n} (avant filtre de seuil) ---")
            for cnt, key in sorted(by_n[n], reverse=True)[: args.top]:
                print(f"  {cnt:5d}  {' '.join(key)}  (fragments distincts: {len(frag_sets[key])})")
        return

    kept = filter_significant(counts, frag_sets, args.min_count, args.min_fragments)
    kept = dedupe_nested(kept)
    print(f"  {len(kept)} n-grammes retenus (>= {args.min_count} occ., >= {args.min_fragments} fragments)")

    phrases = []
    for i, (key, cnt) in enumerate(sorted(kept.items(), key=lambda kv: -kv[1]), start=1):
        idTrans, start, end = first_span[key]
        phrases.append(
            {
                "phrase_id": i,
                "label": " ".join(key),
                "tokens": list(key),
                "n": len(key),
                "occurrence_count": cnt,
                "fragment_count": len(frag_sets[key]),
                "example_fragment": idTrans,
                "example_start": start,
                "example_end": end,
            }
        )

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(phrases, f, ensure_ascii=False, indent=2)
    print(f"Écrit : {OUT_PATH} ({len(phrases)} phrases)")


if __name__ == "__main__":
    main()
