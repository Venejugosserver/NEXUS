// NEXUS service worker: red primero, copia local solo como respaldo sin conexión.
// Solo atiende archivos del propio portal; no toca GitHub API ni el registro de aceptaciones.
const CACHE = 'nexus-v2';
const BASICOS = [
  './', './index.html', './404.html', './terminos.html', './privacidad.html', './cookies.html',
  './manifest.json', './icon-180.png', './icon-192.png', './icon-512.png',
  './nexus.css', './app.js', './legal.js', './404.js',
  './logo-venejugos.png', './bricolage.woff2', './hanken.woff2'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASICOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
