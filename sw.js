const CACHE_NAME = 'schrodingerfridge-step25-v1';
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil((async()=>{ const keys=await caches.keys(); await Promise.all(keys.map(k=>caches.delete(k))); })());
});
self.addEventListener('activate', event => event.waitUntil((async()=>{
  const keys = await caches.keys();
  await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request, {cache:'no-store'}).catch(() => caches.match(event.request)));
});
