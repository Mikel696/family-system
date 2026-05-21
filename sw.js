const CACHE   = 'family-system-v7';
const ASSETS  = [
  './',
  './index.html',
  './css/main.css',
  './js/db.js',
  './js/state.js',
  './js/utils.js',
  './js/voice.js',
  './js/app.js',
  './js/auth.js',
  './js/alerts.js',
  './js/drive-sync.js',
  './js/dashboard.js',
  './js/transactions.js',
  './js/savings.js',
  './js/debts.js',
  './js/budget.js',
  './js/notes.js',
  './js/tasks.js',
  './js/calendar.js',
  './js/payments.js',
  './js/reports.js',
  './js/settings.js',
  './icons/icon-72.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './Image/Familia.jpeg'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Google APIs: siempre a la red
  if (e.request.url.includes('googleapis.com') || e.request.url.includes('accounts.google.com')) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
    return;
  }
  // App: NETWORK-FIRST — siempre la última versión si hay internet;
  // la caché solo es respaldo cuando no hay conexión.
  e.respondWith(
    fetch(e.request).then(resp => {
      if (resp && resp.ok && resp.type === 'basic') {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return resp;
    }).catch(() => caches.match(e.request).then(c => c || caches.match('./index.html')))
  );
});

// Push notification handler
self.addEventListener('push', e => {
  const data = e.data?.json() || { title: 'Family System', body: 'Nueva alerta' };
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body:  data.body,
      icon:  './icons/icon-192.png',
      badge: './icons/icon-72.png',
      vibrate: [200, 100, 200]
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('./index.html'));
});
