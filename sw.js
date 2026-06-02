const CACHE = 'inspection-report-v11';
const ASSETS = ['/', '/index.html', '/app.jsx', '/generate-ppt.js', '/google-config.js', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('googleapis.com') ||
      e.request.url.includes('accounts.google.com') ||
      e.request.url.includes('unpkg.com') ||
      e.request.url.includes('fonts.')) {
    return; // 외부 API는 캐시 안함
  }
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
