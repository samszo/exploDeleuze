const CACHE = "flux-conceptuel-v4";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg",
  "./css/style.css",
  "./js/app.js",
  "./js/api.js",
  "./js/auth.js",
  "./js/player.js",
  "./js/config.js",
  "./img/Logo_BNFblanc.svg",
  "./img/logo-paragraphe-blanc.svg",
  "./img/OmekaS.png",
  "./img/logo-github.png",
  "./data/listconferences.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
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
