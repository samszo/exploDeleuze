# Flux Conceptuel Auto — documentation du projet

Une application embarquée (Android Auto / navigateur mobile) pour explorer, à la voix, les 176 séances de cours de Gilles Deleuze : recherche plein texte dans les transcriptions, lecture audio, et une carte de topologie de concepts calculée à la volée à partir des co-occurrences réelles du corpus.

Ce document couvre l'architecture et le pipeline de données. Pour l'installation en production, voir [DEPLOYMENT.md](DEPLOYMENT.md).

## Sommaire

- [Vision](#vision)
- [Le problème de volume](#le-problème-de-volume)
- [Architecture](#architecture)
- [Arborescence du dépôt](#arborescence-du-dépôt)
- [Le pipeline de données, étape par étape](#le-pipeline-de-données-étape-par-étape)
- [L'API](#lapi)
- [Le client web](#le-client-web)
- [Démarrage local](#démarrage-local)
- [Constats sur la qualité des données](#constats-sur-la-qualité-des-données)

## Vision

Hypothèse de départ : le conducteur ne lit pas, il écoute et il parle — la voix construit la topologie de concepts, l'écran ne fait que confirmer ce qui vient d'être agencé. Le passager, lui, peut manipuler l'interface au doigt.

Direction visuelle : le système *Industry* (Barlow Condensed / Barlow, acier `#5980a6`, cadres au trait avec repères de calage), inversé sur fond nuit pour la conduite ; l'or `#e8c15a` ne sert qu'à une seule chose — le concept vivant, celui qui vient d'être prononcé ou entendu.

## Le problème de volume

Le corpus source (base Omeka S) est trop volumineux pour être consulté directement depuis un téléphone en voiture, sur un réseau mobile variable :

| | Volume |
|---|---|
| Base Omeka S (MySQL/MariaDB) | 53 M lignes · 10 Go |
| Fichiers audio sources (FLAC) | 28 484 fichiers · 88,26 Go |
| Fichiers audio servis (Opus 24 kbps mono) | 27 674 fichiers · **3,7 Go** (≈ 24×) |

Ce dernier chiffre est ce qui rend le projet réalisable : l'ensemble des fragments audio tient sans effort dans un cache, voire en téléchargement complet sur un téléphone.

## Architecture

```
┌─────────────┐    lecture seule     ┌──────────────────┐
│  Omeka S    │ ───────────────────▶ │  Pipeline ETL     │
│  (MySQL)    │   jamais modifiée    │  (scripts/)       │
│  source de  │                      │  - conversion     │
│  vérité     │                      │    audio          │
└─────────────┘                      │  - minage de      │
                                      │    concepts       │
                                      │  - export index   │
                                      └─────────┬─────────┘
                                                │
                        ┌───────────────────────┼───────────────────────┐
                        ▼                       ▼                       ▼
                ┌───────────────┐      ┌────────────────┐      ┌───────────────┐
                │  Meilisearch  │      │  audios/ (Opus) │      │ data/*.json   │
                │  3 index      │      │  fichiers plats │      │  concepts     │
                └───────┬───────┘      └────────┬────────┘      │  composés     │
                        │                        │               └───────────────┘
                        └───────────┬────────────┘
                                    ▼
                          ┌───────────────────┐
                          │  API (FastAPI)     │   /api/*  /audio/*
                          │  api/main.py       │
                          └─────────┬──────────┘
                                    ▼
                          ┌───────────────────┐
                          │  Client web        │   même origine, une
                          │  web/index.html     │   seule adresse à ouvrir
                          └───────────────────┘
```

Principe directeur : **Omeka S n'est jamais interrogée en direct par l'application**. Un pipeline ETL (extraction-transformation-chargement), qui ne fait que lire la base, produit une couche de diffusion légère (index de recherche + fichiers audio compressés + un artefact JSON dérivé) que l'API sert seule. Ça isole la CMS d'archivage des pics de charge d'une app grand public, et ça permet de reconstruire entièrement la couche de diffusion sans jamais risquer d'écrire dans l'archive.

## Arborescence du dépôt

```
exploreConceptsInCar/
├── .env                        identifiants & chemins (jamais commité)
├── requirements.txt             dépendances Python (venv)
├── scripts/
│   ├── export_manifest.sh       liste les fragments Whisper à convertir
│   ├── convert_batch.sh         conversion FLAC → Opus, parallèle, reprenable
│   ├── mine_concept_phrases.py  extraction de concepts composés
│   └── export_meilisearch.py    construit et publie les 3 index Meilisearch
├── audios/                      fichiers .opus (généré, ~3,7 Go, non commité)
│   └── logs/                    succès / échecs / manquants de la conversion
├── data/
│   └── concept_phrases.json     concepts composés minés (généré, non commité)
├── meilisearch/
│   └── data/                    stockage Meilisearch (généré, non commité)
├── api/
│   └── main.py                  API FastAPI (thèmes, recherche, topologie, audio)
├── web/
│   └── index.html                client (Android Auto / navigateur mobile)
└── docs/
    ├── README.md / index.html    ce document
    └── DEPLOYMENT.md / deployment.html   installation sur VPS Debian
```

## Le pipeline de données, étape par étape

Chaque étape est un script séparé, relançable indépendamment et sans effet de bord sur Omeka S.

### 1 — Conversion audio : FLAC → Opus

```bash
./scripts/export_manifest.sh   # interroge transcriptions (agent = WhisperSpeechToText),
                                # écrit audios/manifest.tsv
./scripts/convert_batch.sh     # BITRATE=24k JOBS=16 par défaut
```

- Codec choisi : **Opus 24 kbps mono** (`-application voip`), le meilleur rapport qualité/poids pour de la voix parlée — validé à l'oreille avant le run complet.
- Reprenable : un fichier de sortie déjà présent est sauté ; utile après une interruption ou pour absorber de nouvelles transcriptions.
- Sur 27 803 fragments référencés, **27 674 convertis, 0 échec ffmpeg, 129 sources introuvables sur disque** (des références orphelines — voir [constats qualité](#constats-sur-la-qualité-des-données)).

### 2 — Minage des concepts composés

```bash
./.venv/bin/python3 scripts/mine_concept_phrases.py
```

`timeline_concept` s'est révélé être la transcription mot-à-mot (chaque mot = une ligne, écart quasi toujours nul entre deux mots consécutifs), pas une couche d'annotation sémantique. Un concept comme *« machine de guerre »* n'existe donc nulle part comme entité unique — il faut le reconstruire.

Méthode : extraction de n-grammes (2 à 4 mots) bornés par des mots pleins (un mot vide ne sert que de liaison interne — « de », « d' », « sans »…), comptés sur tout le corpus, retenus s'ils atteignent **8 occurrences dans au moins 5 fragments distincts** — le seuil qui sépare une vraie expression récurrente d'une coïncidence de syntaxe.

Résultat : **4 799 concepts composés** extraits de 3 050 838 tokens (*machine de guerre* ×127, *plan d'immanence* ×114, *puissance du faux* ×128, *pouvoir d'être affecté* ×45…), écrits dans `data/concept_phrases.json`.

### 3 — Construction des index Meilisearch

```bash
./.venv/bin/python3 scripts/export_meilisearch.py
```

Trois index, entièrement reconstruits à chaque exécution (idempotent) :

| Index | Documents | Contenu |
|---|---|---|
| `conferences` | 176 | catalogue des séances — thème, promo, date, sujets BnF |
| `fragments` | 27 674 | une transcription par document, thème/titre dénormalisés, fichier audio résolu, concepts fusionnés (voir étape 2) |
| `concepts` | 50 273 | 45 474 concepts à un mot + 4 799 composés, classés par fréquence après pertinence texte |

Le classement par fréquence (`occurrence_count:desc` en dernière règle de tri) sert la résolution vocale approximative : une commande dictée « machine de gere » doit retomber sur le vrai concept, pas sur un mot rare qui matche par accident.

## L'API

`api/main.py` — FastAPI, ne lit jamais Omeka S ni MySQL au moment de la requête ; tout vient de Meilisearch et du dossier `audios/`.

| Endpoint | Rôle |
|---|---|
| `GET /api/themes` | thèmes de cours avec nombre de séances (facette Meilisearch) |
| `GET /api/themes/{theme}/seances` | séances d'un thème, triées chronologiquement |
| `GET /api/seances/{id}` | détail d'une séance + ses fragments ordonnés |
| `GET /api/fragments/{id}` | un fragment isolé (texte, audio, concepts) |
| `GET /api/search?q=` | recherche plein texte, filtrable par thème/séance |
| `GET /api/concepts/resolve?q=` | résolution floue d'une expression dictée vers un concept |
| `GET /api/topology?concept=` | **graphe de co-occurrence calculé à la volée** — pas de table pré-agrégée |
| `GET /audio/{fichier}` | fichiers `.opus` statiques, requêtes `Range` supportées (scrubbing) |
| `GET /api/health` | vérifie la connexion à Meilisearch |

L'endpoint de topologie interroge `fragments` avec un filtre `concepts = "<label>"`, agrège en Python les autres concepts qui apparaissent dans les mêmes fragments, et retourne les plus fréquents comme voisins pondérés — un calcul en quelques dizaines de millisecondes, jamais stocké.

## Le client web

`web/index.html` — une seule page, sans framework, servie à la même origine que l'API (pas de CORS à gérer). Reprend l'identité visuelle *Industry* inversée nuit.

- **Accueil / Thèmes / Séances / Lecteur** : catalogue et lecture réels, navigation prev/suivant dans les fragments d'une séance.
- **Recherche** : plein texte réel, clic sur un résultat → ouvre le fragment exact.
- **Topologie** : graphe interactif — cliquer un nœud recentre l'exploration dessus.
- **Voix** : Web Speech API du navigateur (si autorisée — généralement HTTPS requis), commandes « ouvre… », « cherche… », « agence X avec Y » (résout X et Y via `/api/concepts/resolve`).
- **Historique** : fragments écoutés et topologies enregistrées, dans `localStorage` — pas de compte utilisateur.
- Mise à l'échelle automatique de l'interface (canevas virtuel 1280×720) pour s'adapter à n'importe quel écran, avec message de rotation en portrait.

## Démarrage local

**Activez le venv** pour la session de terminal — plus besoin de préfixer chaque commande par `./.venv/bin/` ensuite :

```bash
python3 -m venv .venv
source .venv/bin/activate   # le prompt affiche (.venv) ; `deactivate` pour en sortir
pip install -r requirements.txt

# .env : DB_HOST, DB_USER, DB_PASS, DB_NAME, SRC_ROOT, OUT_DIR, MEILI_URL, MEILI_KEY

meilisearch --db-path ./meilisearch/data --http-addr 127.0.0.1:7700 &

./scripts/export_manifest.sh
./scripts/convert_batch.sh
python3 scripts/mine_concept_phrases.py
python3 scripts/export_meilisearch.py

uvicorn api.main:app --host 0.0.0.0 --port 8000
# ouvrir http://<ip-locale>:8000/
```

> **L'activation ne persiste pas** — à refaire (`source .venv/bin/activate`) à chaque nouvelle fenêtre de terminal. Sur Debian/Ubuntu récents, `pip install` **hors venv** échoue avec `externally-managed-environment` (PEP 668, volontaire) : c'est le signe que le venv n'est pas activé (vérifiez le `(.venv)` dans le prompt) — jamais que vous devez ajouter `--break-system-packages`. Sans activer, la même commande fonctionne toujours en préfixant explicitement : `./.venv/bin/pip install -r requirements.txt`.

## Constats sur la qualité des données

Des observations faites en construisant le pipeline, à connaître avant d'itérer dessus :

- **`concepts` / `timeline_concept` est une tokenisation mot-à-mot**, pas une couche d'annotation sémantique — chaque mot du texte y a sa ligne. C'est pour ça que le minage de concepts composés (étape 2) est nécessaire plutôt qu'un simple mapping direct.
- **129 fragments Whisper** référencent un `idConf` introuvable dans `conferences` (contenu retiré de l'archive) — exclus de la conversion audio et des index. Mêmes lignes dans les deux cas.
- **467 fragments n'ont qu'une transcription Google** (pas de Whisper) et référencent eux aussi un `idConf` introuvable dans 100 % des cas — exclus pour la même raison.
- **Doublons ponctuels observés** : au moins une séance a deux transcriptions distinctes toutes deux à `start=0, end=50` (deux fragments concurrents pour le même créneau). Pas corrigé, à traiter si ça devient gênant en usage réel.
- Le champ `sujets` de `conferences` (indexations BnF) est un JSON valide sur 100 % des lignes.
