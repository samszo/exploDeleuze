# Flux Conceptuel — PWA hors-ligne

Application web installable (Android / navigateur) qui permet de **télécharger
une séance de cours entière** — métadonnées, transcriptions et fichiers audio
Opus — pour l'**écouter et la fouiller sans connexion**.

C'est un complément du client web embarqué (`web/index.html` — une page
paysage pour le téléphone posé au tableau de bord, **pas** une app Android
Auto native), pas un remplacement : même API, même identité visuelle, mais
orientée *stockage local* plutôt que *voix en voiture*.

## Ce qu'elle fait

| Écran | Rôle |
|---|---|
| **Catalogue** | thèmes → séances (via l'API) ; pastille « hors-ligne » sur les séances déjà téléchargées. L'icône maison de la barre du haut (ou le titre) ramène ici depuis n'importe où |
| **Hors-ligne** | les séances stockées sur l'appareil, avec leur poids |
| **Recherche** | plein texte, insensible aux accents, extraits surlignés — sur les séances téléchargées (hors-ligne) ou sur tout le corpus (en ligne, `/api/search`) |
| **Espace** | quota du navigateur, poids par séance, suppression, stockage persistant |
| **Lecteur** | lecture continue des fragments, enchaînement auto, ±10 s, contrôles écran verrouillé (Media Session) |
| **Compte** | connexion via un fournisseur tiers (Google) — icône compte dans la barre du haut |
| **Signalements** | connecté, 5 boutons dans le lecteur : corriger la transcription, signaler une référence à une personne / œuvre / date / lieu, à l'instant courant du fragment |
| **Export Zotero** | « Enregistrer dans Zotero » dans le lecteur : crée un item `audioRecording` pour la séance (dédupliqué sur le lien BnF) + un item pour le fragment courant, avec le texte transcrit et le fichier `.opus` en pièce jointe |

## Comment ça marche

- **Aucune dépendance, aucun build.** Fichiers statiques : `index.html`,
  `app.css`, `app.js`, `sw.js`, `manifest.webmanifest`, `icon.svg` +
  `icon-192.png` / `icon-512.png` / `icon-maskable-512.png` (générés depuis
  `icon.svg` avec `rsvg-convert` — Chrome exige des PNG 192 et 512 pour rendre
  l'app installable).
- **Téléchargement d'une séance** : `GET /api/seances/{id}` puis chaque
  `/audio/{fichier}.opus`. Tout est écrit dans **IndexedDB** (base `flux-offline`,
  stores `seances` / `fragments` / `audio` / `meta`) — les blobs audio compris.
  Téléchargement repris là où il s'est arrêté (un `.opus` déjà stocké est sauté),
  annulable.
- **Lecture hors-ligne** : chaque fragment est joué depuis son blob
  (`URL.createObjectURL`), ce qui autorise le *seek*. Si la séance n'est pas
  téléchargée mais qu'il y a du réseau, lecture en streaming depuis `/audio/`.
- **Recherche hors-ligne** : balayage des fragments d'IndexedDB, repli d'accents
  caractère par caractère (index 1:1 avec le texte, pour un surlignage aligné).
- **Connexion tierce** : flux OAuth2 *implicit* dans une popup vers le
  fournisseur (aucun SDK externe). On récupère l'`id_token` du fragment de
  redirection, on garde `{provider, sub, email, name}` + le jeton dans
  IndexedDB. L'API re-vérifie le jeton à chaque signalement
  (`POST /api/signalements`) auprès du fournisseur.
- **Signalements** : `POST /api/signalements` avec le jeton + `{idConf, idTrans,
  idFrag, type, texte / remplacer+par, surTout, timecode, lien}`. L'API écrit un
  fichier JSON par signalement (voir `docs/deployment.html` §B.4). Rien n'est
  envoyé à Omeka S depuis la PWA.
- **Service worker** (`sw.js`) : met en cache la coquille (HTML/CSS/JS/icônes)
  pour un démarrage sans réseau. **Il ne touche jamais** `/api/` ni `/audio/` —
  ces données vivent dans IndexedDB, gérées par l'app.
- **Cible** : l'API de la même origine que la page (`API = ''` en tête de
  `app.js`). L'app vit dans `web/app/` et `web/` est le DocumentRoot du VPS,
  donc `/api/…` et `/audio/…` sont relatifs et il n'y a pas de CORS.

## Où on y accède

- **VPS** : `https://<domaine>/app/` — Apache sert `web/` en statique, donc
  `web/app/` est disponible tel quel. Un seul ajout côté serveur, le type MIME
  du manifeste (voir `docs/deployment.html` §B).
- **Local (Mac / dev)** : `http://localhost:8000/app/` — l'API monte `web/` à la
  racine (`api/main.py`), donc la PWA est servie sans configuration.

> Le service worker exige un contexte sécurisé : HTTPS, ou `http://localhost`.
> Sur `http://<ip-locale>:8000/` il ne s'enregistre pas (l'app fonctionne quand
> même en ligne, mais pas le démarrage hors-ligne).

## Installer sur Android

Ouvrir `/app/` dans Chrome → menu → « Ajouter à l'écran d'accueil ».
L'app s'ouvre alors en plein écran, avec son icône.

## Export Zotero

Porté de `mobilapp/fluxconceptuel/js/{zotero,md5}.js`, intégré dans `app.js`
(`ZoteroAuth`, `md5ArrayBuffer`, module `Zotero`). L'API Zotero
(`api.zotero.org`) gère le CORS → appels directs depuis le navigateur.

- Identifiants (`userId` + clé API **avec droit d'écriture**) saisis une fois,
  stockés dans IndexedDB (`meta` clé `zotero`).
- L'audio exporté est le **fragment courant entier** (fichier `.opus` déjà en
  IndexedDB si la séance est téléchargée, sinon récupéré en ligne) — pas de
  découpe côté client contrairement à l'app de référence.
- Protocole d'upload de fichier Zotero en 4 étapes (création de l'attachment,
  autorisation, envoi S3, confirmation) ; MD5 requis, d'où `md5ArrayBuffer`.

## Limites connues

- La **topologie de concepts** reste en ligne uniquement (calcul serveur sur
  tout le corpus) — hors périmètre de cette app.
- Pas de synchronisation multi-appareils : IndexedDB est propre au navigateur.
- Le quota de stockage dépend du navigateur ; « stockage persistant » (bouton
  dans l'écran Espace) réduit le risque d'éviction automatique.
