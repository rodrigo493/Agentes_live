const CACHE_NAME = 'squados-v1';
const STATIC_ASSETS = [
  '/icon-192.png',
  '/icon-512.png',
  '/squados-icon.png',
];

// Instala o SW e faz cache dos assets estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Ativa e limpa caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first, fallback para cache (só para assets estáticos)
self.addEventListener('fetch', (event) => {
  if (STATIC_ASSETS.some((asset) => event.request.url.endsWith(asset))) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  }
});

// Clique em notificação — foca/abre a aba correta
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const url = event.notification.data?.url || '/workspace';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(url);
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
