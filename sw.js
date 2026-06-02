const CACHE_NAME = 'schrodingerfridge-step20r-v1';
self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async()=>{
  const keys = await caches.keys();
  await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
