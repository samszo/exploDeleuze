/* Service worker — met en cache la coquille de l'app (HTML/CSS/JS/icônes)
 * pour un démarrage hors-ligne. Les données de séances (JSON + audio) ne
 * passent PAS par ici : l'app les stocke dans IndexedDB via l'écran de
 * téléchargement. On n'intercepte jamais /api/ ni /audio/.
 *
 * Stratégie : RÉSEAU D'ABORD pour la coquille (petits fichiers, l'app est en
 * général en ligne au premier lancement), cache en secours. Ça évite qu'un
 * déploiement reste invisible derrière un vieux cache.
 */
const CACHE = 'flux-shell-v4';
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
  e.waitUntil(
    caches.open(CACHE)
      // `cache: 'reload'` : on court-circuite le cache HTTP du navigateur,
      // sinon l'install peut re-mettre en cache d'anciens fichiers.
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
    // Un client déjà ouvert tourne encore avec l'ancienne coquille (ancien
    // app.js, sans logique de mise à jour) : on le recharge nous-mêmes pour
    // qu'il reparte sur les fichiers frais.
    const wins = await self.clients.matchAll({ type: 'window' });
    for (const w of wins) { try { await w.navigate(w.url); } catch (_) { /* ignore */ } }
  })());
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;                 // Google, CDN éventuels : laisser passer
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/audio/')) return;

  const isNav = request.mode === 'navigate';
  const inApp = url.pathname.startsWith('/app/') || url.pathname === '/app';
  if (!isNav && !inApp) return;

  e.respondWith(
    fetch(request)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(isNav ? './index.html' : request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request).then((c) => c || caches.match('./index.html')))
  );
});
