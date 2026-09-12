/* Optional Mapbox renderer. The SVG terrain view remains the no-token/offline fallback. */
(() => {
  "use strict";

  let pendingLocation = null;
  let map = null;

  function render(location) {
    pendingLocation = location;
    if (!window.mapboxgl || !document.getElementById("terrain-map")) return;
    const center = { lat: location.lat, lng: location.lng };
    mapboxgl.accessToken = window.FLOOD_CONFIG_KEYS.MAPBOX_ACCESS_TOKEN;
    map = new mapboxgl.Map({
      container: "terrain-map",
      style: "mapbox://styles/mapbox/streets-v12",
      center: [center.lng, center.lat],
      zoom: 15,
    });
    new mapboxgl.Marker().setLngLat([center.lng, center.lat]).setPopup(new mapboxgl.Popup().setText(location.address || location.label || "Selected location")).addTo(map);
    map.on("load", () => {
      map.addSource("flood-zones", { type: "geojson", data: "data/flood-zones.geojson" });
      map.addLayer({
        id: "flood-zones-fill",
        type: "fill",
        source: "flood-zones",
        paint: { "fill-color": "#B91C1C", "fill-opacity": 0.18 },
      });
      map.addLayer({
        id: "flood-zones-line",
        type: "line",
        source: "flood-zones",
        paint: { "line-color": "#B91C1C", "line-width": 1 },
      });
    });
  }

  function onReady() {
    if (pendingLocation) render(pendingLocation);
  }

  function load(apiKey) {
    if (!apiKey || !window.mapboxgl) return;
    mapboxgl.accessToken = apiKey;
    onReady();
  }

  window.FloodMap = { load, render };
})();
