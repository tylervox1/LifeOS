const CACHE = 'synchrified-v3.1-static-v1';
const SHELL = ['/', '/manifest.webmanifest'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache authenticated, API, OAuth, billing, admin, account, or webhook traffic.
  const sensitive = [
    '/api/', '/admin', '/oauth', '/auth', '/billing', '/account', '/webhook'
  ].some(prefix => url.pathname.startsWith(prefix));
  if (sensitive) return;

  const cacheable =
    url.pathname === '/' ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname.startsWith('/icons/') ||
    /\.(?:css|js|png|jpg|jpeg|svg|webp|ico|woff2?)$/i.test(url.pathname);

  if (!cacheable) return;

  event.respondWith(
    fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
      }
      return response;
    }).catch(() => caches.match(request).then(hit => hit || caches.match('/')))
  );
});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  const title = data.title || 'Synchrified';
  const options = {
    body: data.body || 'You have a new Synchrified update.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification?.data?.url || '/';
  event.waitUntil(clients.openWindow(url));
});
