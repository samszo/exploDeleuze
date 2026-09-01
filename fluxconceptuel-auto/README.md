# Flux Conceptuel — app média Android Auto

Application Android **native de type média** qui expose le catalogue Flux
Conceptuel (cours de Gilles Deleuze) sur l'écran d'Android Auto / Android
Automotive OS, et sur le téléphone.

Elle consomme la même API que le reste du projet
(`../exploreConceptsInCar/api/main.py`, en prod `https://explodeleuze.humanum-p8.fr`) :
`/api/themes`, `/api/themes/{t}/seances`, `/api/seances/{id}`, `/api/search`,
et les fichiers `/audio/*.opus`. **Aucune modification serveur nécessaire.**

> Pourquoi une app native : Android Auto ne projette jamais de page web ni de
> PWA. Seules les apps média / messagerie / navigation apparaissent sur l'écran
> de la voiture, et leur UI est dessinée par Android Auto à partir d'un arbre
> `MediaItem`. Voir `../exploreConceptsInCar/docs/index.html` §« Le client web
> embarqué ».

## Ce que fait la V1

- **Parcours** : thèmes → séances → (fragments), rendu en liste par Android Auto.
- **Lecture** : une séance = playlist de fragments `.opus` enchaînés (ExoPlayer /
  Media3), dans l'ordre `id` (idTrans) — **pas** `start`, qui repart de 0 à
  chaque disque BnF.
- **Reprendre** : dernière position mémorisée (`onPlaybackResumption`).
- **Recherche vocale** : « Hey Google, joue *machine de guerre* sur Flux
  Conceptuel » → `/api/search` → playlist des fragments trouvés.
- **UI téléphone** minimale (Compose) qui parcourt le même arbre — pour tester
  sans voiture.

Hors périmètre V1 : hors-ligne (téléchargement), topologie, affichage du texte
intégral (Android Auto ne l'autorise pas).

## Prérequis

- Android Studio (Ladybug ou plus récent), JDK 17.
- Un compte développeur Google Play (25 $, une fois) pour la publication.

## Build

```bash
# 1. générer le wrapper Gradle (une fois — ou laisser Android Studio le faire)
cd fluxconceptuel-auto
gradle wrapper --gradle-version 8.11.1     # si `gradle` est installé
#   sinon : ouvrir le dossier dans Android Studio, il propose de le créer

# 2. compiler
./gradlew :app:assembleDebug
# APK → app/build/outputs/apk/debug/app-debug.apk
```

Pour pointer vers une autre API (dev local par ex.) :
`./gradlew :app:assembleDebug -PapiBase=http://10.0.2.2:8000/`

## Tester sur le téléphone

```bash
./gradlew :app:installDebug
```
L'app « Flux Conceptuel » apparaît dans le lanceur — parcours + lecture.

## Tester dans Android Auto (sans voiture) — Desktop Head Unit

1. Téléphone : Paramètres → Applications → Android Auto → (tapoter 10× la
   version pour activer le **mode développeur**) → menu ⋮ → *Démarrer le serveur
   head unit*.
2. PC : `~/Library/Android/sdk/extras/google/auto/desktop-head-unit`
   (installer « Android Auto Desktop Head Unit » via le SDK Manager → SDK Tools).
3. `adb forward tcp:5277 tcp:5277 && ./desktop-head-unit`
4. L'app apparaît dans **Média**. Tester : parcours, lecture, enchaînement,
   « OK Google, joue Spinoza sur Flux Conceptuel ».

Dans une vraie voiture : mode développeur Android Auto → *Paramètres* →
*Sources inconnues*, puis l'APK sideloadé apparaît.

## Publier sur le Play Store

Une app média n'apparaît en Android Auto **pour les autres utilisateurs** que
publiée sur Play et validée par la revue qualité Android Auto. Points de la
checklist déjà respectés dans ce squelette :

| Exigence | Où |
|---|---|
| `automotive_app_desc.xml` avec `<uses name="media"/>` | `app/src/main/res/xml/` |
| Service `exported`, `foregroundServiceType="mediaPlayback"` | `AndroidManifest.xml` |
| Arbre peu profond (3 niveaux max), affichage liste | `Catalog.kt` (content style) |
| Pas de pub, pas de contenu visuel au volant | — |
| Réponses rapides (cache mémoire + HTTP) | `Catalog.kt`, `ApiClient.kt` |
| `onPlaybackResumption` implémenté | `PlaybackService.kt` |

À faire avant soumission :
1. `keystore.properties` à la racine (gitignored) :
   ```
   storeFile=release.jks
   storePassword=…
   keyAlias=…
   keyPassword=…
   ```
2. `./gradlew :app:bundleRelease` → AAB signé.
3. Play Console → nouvelle app → catégorie *Musique et audio* → déclarer la
   prise en charge **Android Auto** → soumettre pour revue (compter quelques
   jours).
4. Fournir des captures « Android Auto » (le DHU permet de les prendre).

## Architecture

```
app/
├── api/           Retrofit + kotlinx.serialization → API de diffusion
│   ├── FluxApi.kt · Models.kt · ApiClient.kt (OkHttp partagé audio + JSON)
├── catalog/
│   └── Catalog.kt        cache mémoire + construction des MediaItem (arbre)
├── playback/
│   ├── PlaybackService.kt  MediaLibraryService : Android Auto s'y connecte
│   │                       - onGetChildren : thèmes/séances/fragments
│   │                       - onSetMediaItems : déplie une séance en playlist,
│   │                         gère la recherche vocale (requestMetadata.searchQuery)
│   │                       - onPlaybackResumption
│   └── ResumeStore.kt      dernière position (SharedPreferences)
└── ui/
    └── MainActivity.kt   UI téléphone (Compose) via un MediaBrowser
```

`PlaybackService` héberge un `ExoPlayer` (Media3). Android Auto, l'Assistant et
la UI téléphone sont tous des *contrôleurs* de la même `MediaLibrarySession`.

### Notes d'implémentation

- **Ordre de lecture** : `Catalog.seance()` retrie `fragments` par `id`. L'API
  le fait déjà (`get_seance`), c'est une ceinture-bretelles.
- **`.opus`** : lu nativement par les extracteurs Ogg/Opus de Media3.
- **Recherche** : si Android Auto ne montre pas la loupe, ajouter un `onConnect`
  dans `LibraryCallback` qui accorde explicitement les commandes de recherche.
- **Ajustements possibles au 1er build** (versions Media3) : si un
  `LibraryResult.ofError(code)` ne compile pas, préciser le type —
  `LibraryResult.ofError<ImmutableList<MediaItem>>(code)`. Les signatures des
  callbacks `MediaLibrarySession.Callback` sont stables depuis 1.2.
- **Auth / signalements / Zotero** : pas dans cette app (conduite). Réservé au
  téléphone (PWA `../exploreConceptsInCar/web/app/`).
