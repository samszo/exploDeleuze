const CACHE = "flux-conceptuel-v19";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg",
  "./css/style.css",
  "./css/fontawesome.min.css",
  "./webfonts/fa-solid-900.woff2",
  "./js/app.js?v=19",
  "./js/api.js?v=19",
  "./js/auth.js?v=19",
  "./js/player.js?v=19",
  "./js/config.js?v=19",
  "./js/zotero.js?v=19",
  "./js/md5.js?v=19",
  "./js/audioExtract.js?v=19",
  "./js/history.js?v=19",
  "./img/Logo_BNFblanc.svg",
  "./img/logo-paragraphe-blanc.svg",
  "./img/OmekaS.png",
  "./img/logo-github.png",
  "./data/listconferences.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  // Pas de skipWaiting() ici : la nouvelle version reste "en attente" tant que
  // l'utilisateur n'a pas confirmé la mise à jour depuis l'application (voir app.js).
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Message envoyé par l'application quand l'utilisateur confirme la mise à jour :
// active immédiatement le service worker en attente (au lieu d'attendre la
// fermeture de tous les onglets).
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// App shell : cache d'abord. API / audio Omeka-S : réseau uniquement (données et
// fichiers volumineux qui changent, pas d'intérêt à les mettre en cache offline).
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
