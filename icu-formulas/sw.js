/* Offline support: app files are cached on install, fonts as they are fetched.
   Bump VERSION whenever any app file changes so phones pick up the new version. */
const VERSION = 'icu-formulas-v3';
const FILES = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icon.svg',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
  'js/core.js', 'js/engine.js', 'js/figures.js', 'js/guides.js', 'js/ui.js',
  'js/data/vars.js', 'js/data/ventilation.js', 'js/data/effort.js', 'js/data/gas.js',
  'js/data/oxygen.js', 'js/data/hemodynamics.js', 'js/data/fluids.js', 'js/data/perfusion.js',
  'js/data/acidbase.js', 'js/data/electrolytes.js', 'js/data/renal.js', 'js/data/nutrition.js',
  'js/data/drugs.js', 'js/data/liver-blood.js', 'js/data/coag.js', 'js/data/physics.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const url = new URL(e.request.url);
      if ((res.ok || res.type === 'opaque') && /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
      }
      return res;
    })),
  );
});
