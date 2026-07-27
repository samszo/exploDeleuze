# Flux Conceptuel

Application mobile (PWA) d'exploration et d'écoute des cours de Gilles Deleuze enregistrés à l'université Paris 8. Elle consomme l'API JSON du module Omeka-S [ChaoticumSeminario](../../../../omk_deleuze/modules/ChaoticumSeminario) hébergé sur le même serveur Apache.

## Présentation

- Parcourir les cours (groupés par thème) et les rechercher par mot-clé, y compris en plein texte dans les transcriptions.
- Écouter un cours fragment par fragment : chaque fragment enchaîne automatiquement sur le suivant, avec le texte complet affiché et surligné mot à mot en synchronisation avec l'audio.
- Copier une référence du fragment en cours (lien BnF + horodatage), ou le partager (lien profond vers l'appli).
- Se connecter avec un compte Omeka-S (email + clé API) pour signaler une correction ou une référence (personne, œuvre, date/période, lieu), ou relancer la transcription d'un fragment avec un autre modèle.

Aucune dépendance externe au runtime (pas de CDN) : D3.js est chargé depuis un CDN pour le rendu de la liste/recherche, tout le reste (police d'icônes FontAwesome, assets) est servi localement et mis en cache par le service worker pour un usage hors-ligne partiel.

## Architecture

```
fluxconceptuel/
├── index.html          # Deux vues : liste des cours / lecteur de fragments
├── manifest.json        # Manifeste PWA
├── sw.js                 # Service worker (cache de l'app shell)
├── icon.svg
├── css/
│   ├── style.css
│   └── fontawesome.min.css
├── webfonts/             # Police FontAwesome (solid uniquement)
├── img/                  # Logos
├── data/
│   └── listconferences.json   # Cache statique de la liste des cours
└── js/
    ├── config.js         # URL de base Omeka-S (OMK_BASE / API_BASE)
    ├── api.js             # Appels à l'API JSON ChaoticumSeminario + Omeka core
    ├── auth.js            # Connexion Omeka-S (email + clé API), stockage localStorage
    ├── player.js          # Lecture audio, alignement texte/concepts, synchronisation
    └── app.js              # Contrôleur principal : vues, recherche, signalements
```

```mermaid
flowchart TB
    subgraph Client["Navigateur (fluxconceptuel)"]
        HTML[index.html]
        APP[js/app.js<br/>contrôleur principal]
        API[js/api.js]
        AUTH[js/auth.js]
        PLAYER[js/player.js]
        CONFIG[js/config.js]
        SW[sw.js<br/>service worker]

        HTML --> APP
        APP --> API
        APP --> AUTH
        APP --> PLAYER
        API --> CONFIG
        AUTH --> CONFIG
        HTML -.enregistre.-> SW
    end

    subgraph Omeka["Serveur Omeka-S (même origine)"]
        SITEAPI["/s/cours-bnf/chaoticum-seminario-api/*<br/>(module ChaoticumSeminario)"]
        CORE["/api/*<br/>API REST Omeka-S core"]
        FILES["/files/original/*<br/>fichiers audio"]
    end

    API -- "listconferences / transcriptions / cherche / relancer / signaler" --> SITEAPI
    AUTH -- "GET /api/users?key_identity=…" --> CORE
    API -. "signaler (create item), via clé API" .-> CORE
    PLAYER -- lecture --> FILES
```

## Modèle de données consommé

Chaque **fragment** (~50 s) renvoyé par l'API contient l'audio propre à ce fragment, le texte complet ponctué (`texte`) et la liste des tokens ASR (`concepts`, un mot ou un signe de ponctuation par entrée avec son `start`/`end` en secondes, relatifs au début du fragment) :

```json
{
  "idTrans": 1271469, "idFrag": 1271145, "idConf": 72556,
  "theme": "Appareils d'État et machines de guerre", "num": 1,
  "start": 0, "end": 50, "source": "files/original/....flac",
  "gallica": "https://gallica.bnf.fr/ark:/12148/....audio",
  "texte": "Cette année, j'ai plusieurs choses à vous proposer…",
  "concepts": [
    { "title": "cette", "start": 0, "end": 1.52, "confidence": 0.68 }
  ]
}
```

`js/player.js` aligne ces tokens bruts sur le texte ponctué (`alignConceptsWithText`) pour surligner le bon mot dans une vraie phrase, plutôt que d'afficher les tokens isolés.

## Flux principaux

### Lecture d'un cours

```mermaid
sequenceDiagram
    participant U as Utilisateur
    participant App as app.js
    participant Api as api.js
    participant Player as player.js
    participant Omk as ApiController (Omeka-S)

    U->>App: tape sur un cours
    App->>Api: fetchTranscriptions(idConf)
    Api->>Omk: GET /transcriptions?idConf=…
    Omk-->>Api: {transcriptions: [fragment, …]}
    App->>Player: player.load(fragments), player.goTo(0)
    Player->>Player: alignConceptsWithText(texte, concepts)
    Player-->>U: audio + texte surligné mot à mot
    loop chaque fragment
        Player->>Player: à la fin de l'audio, goTo(index+1)
    end
```

### Recherche plein texte

```mermaid
sequenceDiagram
    participant U as Utilisateur
    participant App as app.js
    participant Api as api.js
    participant Omk as ApiController

    U->>App: soumet le formulaire de recherche
    App->>Api: fetchSearchResults(trouve)
    Api->>Omk: GET /cherche?trouve=…
    Omk-->>Api: transcriptions correspondantes + score
    App->>App: regroupe par thème puis par cours (D3)
    U->>App: tape sur un extrait
    App->>App: openCourse(cours, {jumpToIdTrans})
```

### Connexion et signalement

```mermaid
sequenceDiagram
    participant U as Utilisateur
    participant App as app.js
    participant Auth as auth.js
    participant Api as api.js
    participant Core as API core Omeka-S
    participant Site as ApiController

    U->>App: saisit email + clé API
    App->>Auth: login(email, identity, credential)
    Auth->>Core: GET /api/users?email=…&key_identity=…&key_credential=…
    Core-->>Auth: utilisateur (ou vide)
    Auth-->>App: identifiants stockés (localStorage)
    Note over App: les 6 boutons de signalement<br/>deviennent visibles

    U->>App: "Référence à une personne" + texte
    App->>Api: signalerFragment({type, texte, timecode, auth})
    Api->>Site: GET /signaler?...&key_identity=…&key_credential=…
    Site->>Site: identity() requis, sinon 401
    Site->>Core: api->create('items', …) via KEYAUTH
    Core-->>Site: item créé (resource_template "Reference transcription")
    Site-->>App: {id}
```

## Déploiement

- Servir le dossier tel quel sous le **même domaine** que l'installation Omeka-S (voir `js/config.js` : `OMK_BASE`) — l'API n'envoie pas d'en-têtes CORS, il faut donc rester same-origin.
- Le service worker (`sw.js`) précharge l'app shell ; sa constante `CACHE` doit être incrémentée à chaque déploiement pour invalider le cache des navigateurs déjà installés en PWA.
