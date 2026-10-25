// Network-first service worker: always fresh code when online, app shell still opens offline.
const C = 'lawapp-v1';
const FILES = ['./', 'start.html', 'start.css', 'start.js', 'chat.css', 'calls.js', 'logo3d.js', 'chat.html', 'login.html', 'register.html', 'verify.html', 'auth.css', 'theme.js', 'firebase.js', 'crypto.js', 'chat.js', 'app.html', 'app.js', 'rules.html', 'rules.js', 'rulespage.js', 'filter.js', 'manifest.webmanifest' , 'icon-192.png'  , 'icon-512.png' ];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(FILES)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;   // Firebase traffic is never cached
  e.respondWith(fetch(r).then(res => { const cp = res.clone(); caches.open(C).then(c => c.put(r, cp)); return res; }).catch(() => caches.match(r)));
});
