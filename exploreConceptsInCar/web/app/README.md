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
| **Écoutes** | historique d'écoute : la position atteinte dans chaque séance est mémorisée (IndexedDB) ; touche une entrée pour reprendre exactement où on s'était arrêté, ou la retire de l'historique |
| **Espace** | quota du navigateur, poids par séance, suppression, stockage persistant |
| **Lecteur** | lecture continue des fragments, enchaînement auto, ±10 s, contrôles écran verrouillé (Media Session), signalements existants sur le fragment affiché |
| **Compte** | connexion via un fournisseur tiers (Google) — icône compte dans la barre du haut, avec accès à « Mes annotations » une fois connecté |
| **Paramètres** | icône engrenage à côté de l'icône compte : numéro de version (commit GitHub courant), lien vers le code source, lien vers la documentation, bouton « Vérifier les mises à jour » |
| **Signalements** | connecté, 5 boutons dans le lecteur : corriger la transcription, signaler une référence à une personne / œuvre / date / lieu, à l'instant courant du fragment — la création exige de sélectionner d'abord le passage concerné (premier mot puis dernier mot du texte affiché) |
| **Mes annotations** | tous les signalements créés par l'utilisateur connecté, lus directement depuis les fichiers JSON de signalements ; touche une entrée pour rouvrir la séance correspondante |
| **Export Zotero** | « Enregistrer dans Zotero » dans le lecteur : sélectionner le premier et le dernier mot du passage à extraire, découper l'audio sur cet intervalle (Web Audio API, côté client), puis l'enregistrer — item `audioRecording` pour la séance (dédupliqué sur le lien BnF) + un item pour l'extrait, avec le texte sélectionné comme `Label` et la fenêtre temporelle réelle comme `Running time` |

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
- **Lecture continue résiliente** : la lecture ne s'arrête jamais en silence —
  seule une pause explicite de l'utilisateur l'interrompt. Une erreur audio
  (fichier introuvable, décodage impossible) passe automatiquement au
  fragment suivant ; un fragment non téléchargé sans réseau est retenté
  automatiquement dès le retour de la connexion (évènement `online`), sans
  action de l'utilisateur. Un compteur d'échecs consécutifs (5) évite une
  boucle infinie si rien ne peut se charger durablement.
- **Historique d'écoute** : une entrée par séance dans `meta` (clé `history`),
  `{fragId, time, at, titre, theme, num, date}` — le titre/thème/date de la
  séance sont dupliqués dans l'entrée (pas seulement l'id) pour que l'écran
  « Écoutes » s'affiche sans réseau ni requête supplémentaire, même pour une
  séance qui n'a été qu'écoutée en streaming. `Player.start(seanceId)` sans
  fragment explicite consulte automatiquement cet historique pour reprendre où
  la lecture s'était arrêtée ; un fragment explicite (lien de recherche, entrée
  d'historique, annotation) le contourne.
- **Recherche hors-ligne** : balayage des fragments d'IndexedDB, repli d'accents
  caractère par caractère (index 1:1 avec le texte, pour un surlignage aligné).
- **Connexion tierce** : flux OAuth2 *implicit* dans une popup vers le
  fournisseur (aucun SDK externe). On récupère l'`id_token` du fragment de
  redirection, on garde `{provider, sub, email, name}` + le jeton dans
  IndexedDB. L'API re-vérifie le jeton à chaque signalement
  (`POST /api/signalements`) auprès du fournisseur.
- **Sélection d'une séquence de mots** : le texte du fragment affiché devient
  tapotable dès qu'un signalement ou un export Zotero est amorcé — premier mot
  touché, puis dernier (ou le même mot deux fois pour un seul mot). Le
  mécanisme (tokenisation du texte, surlignage, reconstruction de la
  sous-chaîne) est partagé entre les deux usages via un callback générique
  (`selectionCallback`), pour ne pas dupliquer la logique.
- **Signalements** : `POST /api/signalements` avec le jeton + `{idConf, idTrans,
  idFrag, type, texte / remplacer+par, surTout, timecode, lien, selection}` —
  `selection` (la séquence de mots choisie ci-dessus) est **requis**, rejeté en
  400 sinon. L'API écrit un fichier JSON par signalement (voir
  `docs/deployment.html` §B.4). Rien n'est envoyé à Omeka S depuis la PWA.
- **Lecture des signalements** : `GET /api/signalements/fragment/{idTrans}`
  (public, pas de jeton) renvoie les signalements existants d'un fragment —
  affichés dans le lecteur à chaque chargement, avec la séquence sélectionnée
  et le prénom de l'auteur, jamais son e-mail. `GET /api/signalements/mine`
  (jeton revérifié auprès du fournisseur) renvoie ceux de l'utilisateur
  connecté, pour l'écran « Mes annotations ».
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

## Vérification des mises à jour

Bouton dans l'écran **Espace**. Contrairement à `mobilapp/fluxconceptuel` (qui
attend une confirmation avant d'activer une nouvelle version), le service
worker ici est **réseau d'abord** et active `skipWaiting()` dès l'installation
— une ancienne tentative de rechargement automatique sur `controllerchange`
avait provoqué une boucle après un vidage de cache, et n'a délibérément pas
été réintroduite (voir le commentaire dans `app.js`). Le bouton se contente
donc de forcer une revalidation (`registration.update()`) puis un rechargement
explicite déclenché par ce clic — jamais un rechargement automatique en tâche
de fond.

## Export Zotero

Porté de `mobilapp/fluxconceptuel/js/{zotero,md5,audioExtract}.js`, intégré
dans `app.js` (`ZoteroAuth`, `md5ArrayBuffer`, `extractAudioRange`/
`audioBufferToWav`, module `Zotero`). L'API Zotero (`api.zotero.org`) gère le
CORS → appels directs depuis le navigateur.

- Identifiants (`userId` + clé API **avec droit d'écriture**) saisis une fois,
  stockés dans IndexedDB (`meta` clé `zotero`).
- L'audio exporté est un **extrait découpé** sur la sélection de mots (fichier
  `.opus` déjà en IndexedDB si la séance est téléchargée, sinon récupéré en
  ligne, décodé puis réencodé en WAV via Web Audio API) — pas le fragment
  entier.
- **La fenêtre temporelle de l'extrait est une estimation**, pas une coupe
  exacte au mot près : cette app n'a pas d'horodatage par mot dans ses données
  (contrairement à `mobilapp/fluxconceptuel`, qui a de vrais timestamps par
  concept issus du `word_timestamps` de Whisper). La plage est calculée
  proportionnellement à la position des caractères sélectionnés dans le texte
  du fragment (`estimateWordRangeTime`).
- Protocole d'upload de fichier Zotero en 4 étapes (création de l'attachment,
  autorisation, envoi S3, confirmation) ; MD5 requis, d'où `md5ArrayBuffer`.

## Limites connues

- La **topologie de concepts** reste en ligne uniquement (calcul serveur sur
  tout le corpus) — hors périmètre de cette app.
- Pas de synchronisation multi-appareils : IndexedDB est propre au navigateur,
  y compris l'historique d'écoute et les identifiants Zotero.
- Le quota de stockage dépend du navigateur ; « stockage persistant » (bouton
  dans l'écran Espace) réduit le risque d'éviction automatique.
- La fenêtre temporelle d'un extrait Zotero est estimée (voir ci-dessus), pas
  mesurée au mot près.
- L'écran « Mes annotations » et l'affichage des signalements sur un fragment
  ont besoin du réseau (les fichiers de signalements ne sont pas mis en cache
  hors-ligne) ; ils s'effacent silencieusement plutôt que d'échouer bruyamment
  si l'appareil est hors connexion.
