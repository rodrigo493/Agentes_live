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

// Recebe Push Notification e exibe
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'SquadOS', {
      body: data.body ?? '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url ?? '/' },
    })
  );
});

// Clique em notificação — foca/abre a aba correta
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      const found = cs.find((c) => c.url.includes(url) && 'focus' in c);
      if (found) return found.focus();
      return clients.openWindow(url);
    })
  );
});
