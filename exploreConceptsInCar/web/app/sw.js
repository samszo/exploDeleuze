/* Service worker — met en cache la coquille de l'app (HTML/CSS/JS/icônes)
 * pour un démarrage 100% hors-ligne. Les données de séances (JSON + audio)
 * ne passent PAS par ici : l'app les stocke elle-même dans IndexedDB via
 * l'écran de téléchargement. On ne touche donc jamais à /api/ ni /audio/.
 */
const CACHE = 'flux-shell-v2';
const SHELL = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // Navigation → coquille en cache d'abord (offline-first), réseau en secours.
  if (request.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html').then((cached) => cached || fetch(request).catch(() => caches.match('./index.html')))
    );
    return;
  }

  // Assets de l'app (web/app/…) → cache-first, avec remplissage paresseux.
  if (sameOrigin && url.pathname.includes('/app/')) {
    e.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(request, copy)); }
        return res;
      }).catch(() => cached))
    );
    return;
  }

  // Tout le reste (/api, /audio, polices…) : réseau direct, non mis en cache ici.
});
