// Offline cache: aplikace funguje i bez signálu, data se dorovnají po připojení.
const CACHE = 'zivot-v2';
const CORE = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co')) return; // data vždy živě
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const c = r.clone(); caches.open(CACHE).then((ca) => ca.put('/index.html', c)); return r; }).catch(() => caches.match('/index.html')));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') { const c = r.clone(); caches.open(CACHE).then((ca) => ca.put(req, c)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    for (const c of cs) if ('focus' in c) return c.focus();
    return self.clients.openWindow('/#/dnes');
  }));
});
