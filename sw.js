/* Renal — a visual companion :: service worker
   Bump VERSION whenever you redeploy. The app will then offer "Update available". */
const VERSION = 'v2';

const SHELL = 'renal-shell-' + VERSION;
const FONTS = 'renal-fonts-v1';           // fonts rarely change; kept across versions
const KEEP = [SHELL, FONTS];

const SHELL_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

// ---- install: precache the shell ----
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL).then((c) =>
      // individual adds so one 404 can't fail the whole install
      Promise.all(SHELL_URLS.map((u) =>
        c.add(new Request(u, { cache: 'reload' })).catch(() => null)
      ))
    )
  );
  // no skipWaiting here — the page asks for it, so updates are never a surprise mid-read
});

// ---- activate: bin old caches ----
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ---- let the page trigger the update ----
self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

// ---- strategies ----
async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    // opaque responses (status 0) are normal for the Google Fonts stylesheet — still worth keeping
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

async function staleWhileRevalidate(req, key, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(key || req);
  const net = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(key || req, res.clone());
      return res;
    })
    .catch(() => null);

  if (hit) return hit;                      // instant, refresh happens behind it
  const res = await net;
  return res || new Response('', { status: 504, statusText: 'Offline' });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }

  // Google Fonts — cache on first (online) load, then serve offline forever
  if (FONT_HOSTS.includes(url.hostname)) {
    e.respondWith(cacheFirst(req, FONTS));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // page loads always resolve to the cached shell
  if (req.mode === 'navigate') {
    e.respondWith(staleWhileRevalidate(req, './index.html', SHELL));
    return;
  }

  e.respondWith(staleWhileRevalidate(req, null, SHELL));
});
