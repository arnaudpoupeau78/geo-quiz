/* Service worker de Géo Quiz.

   Deux stratégies volontairement différentes :
   - fichiers de l'app (html/css/js) -> RÉSEAU D'ABORD, cache en secours.
     C'est ce qui évite le piège classique du SW qui fige une vieille version
     pour toujours : dès qu'il y a du réseau, l'utilisateur a le code à jour.
   - ressources externes (Leaflet, drapeaux flagcdn)
     -> CACHE D'ABORD. Elles ne changent jamais et c'est ce qui rend le jeu
     jouable hors-ligne.
     Les tuiles de fond ont disparu : les cartes sont désormais dessinées à
     partir de data/borders.js, livré avec l'app.

   Pense à incrémenter CACHE_VERSION à chaque déploiement. */

const CACHE_VERSION = "geo-quiz-v10";
const CACHE_APP = CACHE_VERSION + "-app";
const CACHE_EXT = CACHE_VERSION + "-ext";

const FICHIERS_APP = [
  "./",
  "./index.html",
  "./style.css?v=10",
  "./app.js?v=10",
  "./data/countries.js?v=10",
  "./data/borders.js?v=10",
  "./data/departements.js?v=10",
  "./data/borders-fr.js?v=10",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

const FICHIERS_EXT = [
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
];

// Un seul fichier introuvable ne doit pas faire échouer toute l'installation :
// on met en cache un par un et on ignore les échecs.
async function cacheTolerant(nomCache, urls) {
  const cache = await caches.open(nomCache);
  await Promise.all(
    urls.map((u) => cache.add(new Request(u, { cache: "reload" })).catch(() => null))
  );
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      await cacheTolerant(CACHE_APP, FICHIERS_APP);
      await cacheTolerant(CACHE_EXT, FICHIERS_EXT);
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const noms = await caches.keys();
      await Promise.all(
        noms.filter((n) => !n.startsWith(CACHE_VERSION)).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

// Les tuiles CARTO sont servies par a/b/c/d.basemaps.cartocdn.com : on teste
// donc le domaine ET ses sous-domaines, pas une égalité stricte.
const EXTERNES = [/(^|\.)flagcdn\.com$/, /(^|\.)basemaps\.cartocdn\.com$/, /(^|\.)unpkg\.com$/];
const estExterne = (hote) => EXTERNES.some((re) => re.test(hote));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (!url.protocol.startsWith("http")) return;

  // ---- Ressources externes : cache d'abord ----
  if (estExterne(url.hostname)) {
    e.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_EXT);
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          // Les réponses opaques (mode no-cors) sont acceptées telles quelles.
          if (res && (res.ok || res.type === "opaque")) {
            cache.put(req, res.clone()).catch(() => {});
          }
          return res;
        } catch (err) {
          // Hors-ligne et jamais vu : on laisse l'app gérer (onerror des <img>).
          return Response.error();
        }
      })()
    );
    return;
  }

  // ---- Fichiers de l'app : réseau d'abord ----
  if (url.origin === self.location.origin) {
    e.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res && res.ok) {
            const cache = await caches.open(CACHE_APP);
            cache.put(req, res.clone()).catch(() => {});
          }
          return res;
        } catch (err) {
          const hit = await caches.match(req);
          if (hit) return hit;
          // Navigation hors-ligne vers une URL non vue : on sert l'accueil.
          if (req.mode === "navigate") {
            const home = await caches.match("./index.html");
            if (home) return home;
          }
          return Response.error();
        }
      })()
    );
  }
});
