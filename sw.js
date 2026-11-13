/* Minimal service worker: offline shell + up-to-date data when online. */
const CACHE = 'opic-shell-v3'; /* bump on every asset change: the old cache is deleted in activate */
const SHELL = ['./', 'index.html', 'assets/js/app.css?v=f8f45342', 'assets/js/app.js?v=f8f45342', 'manifest.webmanifest', 'icon.svg', 'data/version.json'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const isData = /\/(data|md)\//.test(url.pathname);

  // Network-first everywhere, cache as the offline fallback. GitHub Pages serves assets with
  // max-age=600, so the revalidation must bypass the HTTP cache (cache: 'reload') — otherwise a
  // fresh deployment keeps serving the previous build for ten minutes.
  const fresh = new Request(req.url, { cache: 'reload', credentials: 'same-origin', mode: 'same-origin' });
  const strategy = fetch(fresh).then((res) => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
    }
    return res;
  }).catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined)));

  e.respondWith(strategy);
});
