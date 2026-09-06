// オフラインでも開けるようにするための最小限の Service Worker
// 方針: まずネットに取りに行き、届いたらキャッシュを更新。ネットが落ちているときだけキャッシュを返す
// （更新したアイコンや名前が古いまま出ないようにするため、キャッシュ優先にはしない）
const CACHE = 'hengen-converter-v2';
const CORE = ['./', './index.html', './heic2any.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
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

  const cacheKey = req.mode === 'navigate' ? './index.html' : req;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(cacheKey, res.clone()));
        return res;
      })
      .catch(() => caches.match(cacheKey))
  );
});
