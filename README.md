# Explo Deleuze

Application web d'exploration des cours de Gilles Deleuze à la BNF, développée par [Samuel Szoniecky](https://samszo.univ-paris8.fr/) au [Laboratoire Paragraphe](https://www.univ-paris8.fr/EA-349-Laboratoire-Paragraphe) (Université Paris 8).

## Présentation

**Explo Deleuze** est une interface d'exploration et d'analyse des séminaires de Gilles Deleuze. Elle permet de naviguer dans les transcriptions, d'identifier les concepts clés, de rechercher des termes et d'interroger un assistant IA (AnythingLLM) sur le contenu des cours.

## Fonctionnalités principales

| Fonctionnalité | Description |
|---|---|
| Navigation par séminaires | Parcourir les cours organisés par thème et promotion via un accordéon |
| Nuage de concepts | Visualisation des concepts clés sous forme de nuage de mots (tagcloud D3.js) |
| Transcriptions | Affichage des fragments de transcription avec lecture audio/vidéo synchronisée |
| Recherche globale | Recherche textuelle dans l'ensemble des cours |
| Assistant IA | Intégration AnythingLLM pour interroger les cours en langage naturel |
| Authentification | Connexion à une instance Omeka-S avec gestion des utilisateurs |
| Liens URL | Navigation directe vers une transcription, conférence ou note via paramètres URL |

## Architecture

```
exploDeleuze/
├── index.html              # Point d'entrée de l'application
├── main.js                 # Contrôleur principal (ES module)
├── modules/                # Modules JavaScript
│   ├── auth.js             # Authentification (Omeka-S + GitHub)
│   ├── authParams.js       # Paramètres de connexion (non versionné)
│   ├── omk.js              # Client API Omeka-S
│   ├── tagcloud.js         # Nuage de mots (D3.js)
│   ├── transcription.js    # Affichage des fragments transcrits
│   ├── anythingLLM.js      # Intégration assistant IA local
│   ├── tree.js             # Visualisation arborescente (D3.js)
│   ├── appUrl.js           # Gestion des paramètres d'URL
│   ├── modal.js            # Composant modal Bootstrap
│   ├── loader.js           # Indicateur de chargement
│   ├── slider.js           # Composant curseur (noUiSlider)
│   ├── bnf.js              # Intégration BNF
│   ├── timeline.js         # Visualisation temporelle
│   └── streamWords.js      # Flux de mots
├── assets/
│   ├── js/                 # Bibliothèques tierces (D3.js, Bootstrap, Handsontable…)
│   ├── css/                # Feuilles de style
│   ├── img/                # Logos et images
│   └── data/               # Données statiques (getConferences.json…)
└── projet/                 # Documents de projet
```

## Dépendances

### Bibliothèques front-end

| Bibliothèque | Usage |
|---|---|
| [D3.js v7](https://d3js.org/) | Visualisations (tagcloud, tree, timeline) |
| [Bootstrap 5.3](https://getbootstrap.com/) | Interface et composants UI |
| [Handsontable](https://handsontable.com/) | Tableau de données interactif |
| [Video.js](https://videojs.com/) | Lecteur vidéo |
| [Howler.js](https://howlerjs.com/) | Lecture audio |
| [noUiSlider](https://refreshless.com/nouislider/) | Curseur de navigation |
| [autoComplete.js](https://tarekraafat.github.io/autoComplete.js/) | Autocomplétion de recherche |
| [Font Awesome](https://fontawesome.com/) | Icônes |
| [d3.layout.cloud](https://github.com/jasondavies/d3-cloud) | Algorithme de nuage de mots |

### Backend

- **[Omeka-S](https://omeka.org/s/)** — CMS sémantique hébergeant les données des cours (items, médias, transcriptions)
- **[AnythingLLM](https://anythingllm.com/)** — LLM local pour les questions/réponses sur les cours

## Données

Les données des conférences sont chargées depuis :
- **`assets/data/getConferences.json`** (cache local) — liste des cours avec métadonnées (thème, promotion, nombre de fragments, concepts)
- **API Omeka-S** (`/s/cours-bnf/page/ajax?json=1&helper=sql&action=...`) — données dynamiques (timeline, concepts, transcriptions)

### Actions API utilisées

| Action | Description |
|---|---|
| `getConferences` | Liste de tous les cours |
| `timelineConceptAnnexe` | Timeline des concepts d'une conférence ou d'une recherche |
| `getTransNote` | Transcription associée à une note |
| `statConcept` | Statistiques sur les concepts |

## Paramètres d'URL

L'application supporte les paramètres d'URL suivants pour la navigation directe :

| Paramètre | Description |
|---|---|
| `idTrans` | Affiche directement une transcription par son identifiant |
| `idConf` | Affiche directement un séminaire par son identifiant |
| `idNote` | Affiche directement une note par son identifiant |

Exemple : `index.html?idConf=42`

## Modules principaux

### `auth.js`
Gère l'authentification utilisateur avec Omeka-S. Affiche le bouton de connexion dans la navbar, gère la session et expose l'objet `omk` (client API).

### `omk.js`
Client de l'API REST Omeka-S. Fournit les méthodes pour récupérer items, médias, ressources, propriétés et classes RDF. Utilise les vocabulaires : `dcterms`, `ma`, `oa`, `jdc`, `bibo`, `skos`, `foaf`, `bio`.

### `tagcloud.js`
Nuage de mots interactif basé sur D3.js et `d3.layout.cloud`. Filtre les mots vides (français et anglais). Événements : `clickTag` (sélection d'un concept), `drawEnd` (fin du rendu).

### `transcription.js`
Affiche les fragments de transcription avec :
- Lecture audio/vidéo synchronisée (Video.js, Howler.js)
- Mise en évidence des concepts sélectionnés
- Annotation et gestion des notes
- Références bibliographiques (personnes, lieux, époques, livres, films, musiques, liens, concepts)

### `anythingLLM.js`
Interface avec un serveur AnythingLLM local ou distant. Permet de créer des fils de discussion et d'interroger les cours en langage naturel. La configuration (clé API, workspace, URL) est stockée dans le profil utilisateur Omeka-S.

### `authParams.js`
Fichier de configuration des paramètres de connexion (non versionné). Contient les paramètres `apiOmk`, `mail`, `ident`, `key` pour l'authentification automatique.

## Mise en place

1. Cloner le dépôt
2. Configurer `modules/authParams.js` avec les identifiants Omeka-S
3. Déployer sur un serveur HTTP (pas d'exécution locale possible — appels API cross-origin)
4. Optionnel : installer et configurer AnythingLLM pour l'assistant IA

## Liens

- [Dépôt GitHub](https://github.com/samszo/exploDeleuze)
- [Laboratoire Paragraphe](https://www.univ-paris8.fr/EA-349-Laboratoire-Paragraphe)
- [Samuel Szoniecky](https://samszo.univ-paris8.fr/)
