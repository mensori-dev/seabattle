/* ============================================================
   Service worker «Морского боя»: офлайн-кэш и мгновенный старт
   ============================================================ */
const VERSION = 'sb-v16';
const CORE = [
  './',
  './index.html',
  './style.css',
  './js/engine.js',
  './js/online.js',
  './js/app.js',
  './manifest.webmanifest',
  './privacy.html',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-512.png',
  './assets/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      // один недоступный файл не должен ломать установку.
      // `?v=` и cache:'reload' обходят HTTP-кэш браузера и кэш CDN:
      // иначе после смены VERSION можно закэшировать прошлую версию файлов.
      Promise.all(CORE.map((url) =>
        fetch(url + '?v=' + VERSION, { cache: 'reload' })
          .then((res) => (res && res.status === 200 ? cache.put(url, res) : null))
          .catch(() => null)
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // шрифты и прочее — мимо

  // навигация: сеть, при офлайне — из кэша
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // остальное: кэш → сеть (и докладываем в кэш)
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
    })
  );
});
