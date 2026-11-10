/* Minimal service worker: offline shell + up-to-date data when online. */
const CACHE = 'opic-shell-v1';
const SHELL = ['./', 'index.html', 'assets/js/app.css', 'assets/js/app.js', 'manifest.webmanifest', 'icon.svg', 'data/version.json'];

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

  // network-first for data/docs and navigations; stale-while-revalidate for the shell so
  // that an updated app.js/style.css actually takes effect on the next visit.
  const strategy = (isData || req.mode === 'navigate')
    ? fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match('index.html')))
    : caches.match(req).then((hit) => {
        const fresh = fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch(() => hit);
        return hit || fresh;
      });

  e.respondWith(strategy);
});
