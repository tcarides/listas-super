// Service worker para "Lista del súper" (PWA).
// Objetivo: que la app abra al instante y funcione aunque la señal del súper
// sea mala. NO cachea respuestas de /api/* para no romper la sincronización:
// los datos de la lista siempre se piden frescos a la red.

const CACHE = "listas-super-v1";

self.addEventListener("install", (event) => {
  // Activar la versión nueva sin esperar a que se cierren las pestañas.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Borrar caches de versiones anteriores.
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Solo GET y mismo origen. El resto (POST/PATCH/DELETE, terceros) pasa directo.
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  const url = new URL(request.url);

  // La API se sirve siempre desde la red: nunca datos viejos de la lista.
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Shell y assets: network-first con fallback a cache (evita chunks viejos
  // pero permite abrir offline con la última versión cacheada).
  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(request);
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE);
          cache.put(request, fresh.clone());
        }
        return fresh;
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        // Para navegaciones sin cache, intentar servir la home cacheada.
        if (request.mode === "navigate") {
          const home = await caches.match("/");
          if (home) return home;
        }
        throw new Error("offline y sin cache");
      }
    })()
  );
});
