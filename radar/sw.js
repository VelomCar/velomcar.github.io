// Service worker kecil supaya Velom Radar bisa dipasang di HP dan tetap terbuka saat sinyal lemah.
// Hanya berlaku untuk folder /radar/, tidak mengganggu website utama.
var CACHE = 'velom-radar-v1';
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || req.url.indexOf(self.registration.scope) !== 0) return;
  e.respondWith(
    fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true });
    })
  );
});
