/**
 * sw.js — offline capability (NFR-2). Caches the app shell, the config
 * and checklist data, and the flood-zone dataset on install so the
 * checklist and last-known result work fully offline. Rainfall forecast
 * calls use a network-first strategy with a cache fallback, since fresh
 * forecasts matter but a stale one (flagged in the UI) beats nothing.
 */

const CACHE_NAME = "flood-watch-v5";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/pip.js",
  "./js/risk.js",
  "./js/terrain.js",
  "./js/waterway.js",
  "./js/recommendations.js",
  "./js/checklist.js",
  "./js/geolocation.js",
  "./js/geocoding.js",
  "./js/map.js",
  "./js/app.js",
  "./config/config.json",
  "./data/counties.json",
  "./data/admin-units.json",
  "./data/flood-zones.geojson",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Rainfall forecast API: network-first, fall back to cache if offline.
  // The app itself also keeps its own localStorage cache for the
  // "stale forecast" UI state (see app.js) — this is a second layer.
  if (url.hostname === "api.open-meteo.com" || url.hostname === "seasonal-api.open-meteo.com") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // App shell + local data: cache-first, so the core experience
  // (checklist, last result) renders fully offline (NFR-2).
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
  }
});
