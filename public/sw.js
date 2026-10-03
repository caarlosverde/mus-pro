// Service worker mínimo: red primero para la página, caché como respaldo sin conexión.
const CACHE = 'mus-pro-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  event.respondWith(
    fetch(request)
      .then((respuesta) => {
        const copia = respuesta.clone()
        caches.open(CACHE).then((cache) => cache.put(request, copia))
        return respuesta
      })
      .catch(() => caches.match(request).then((r) => r ?? caches.match('./'))),
  )
})
