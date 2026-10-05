/* Service worker minimal de Dalokeur.
   - met en cache uniquement les fichiers statiques de l'application (/_next/static, icônes) ;
   - ne met JAMAIS en cache les pages connectées, /api ni les fichiers privés (données personnelles) ;
   - affiche /offline quand le réseau est coupé pendant une navigation. */
const VERSION = "v1";
const STATIC = `dalokeur-static-${VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll([OFFLINE_URL, "/icons/icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== STATIC).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Fichiers statiques versionnés : cache d'abord (sûr, ils ne contiennent aucune donnée personnelle)
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(caches.open(STATIC).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    }));
    return;
  }

  // Navigations : réseau d'abord ; hors connexion, page de repli (sans aucune donnée utilisateur)
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
  }
  // Tout le reste (API, fichiers privés, actions) passe directement par le réseau, sans cache.
});
