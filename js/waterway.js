/**
 * waterway.js — nearest mapped water feature (river/stream/lake/spring)
 * from a set of OpenStreetMap-sourced coordinates.
 *
 * Pure geometry only, no I/O — app.js owns the Overpass API call and
 * hands the raw coordinate list in here, same split as pip.js/risk.js.
 */

const FloodWaterway = (() => {

  const EARTH_RADIUS_M = 6371000;

  function haversineM(lat1, lng1, lat2, lng2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  /**
   * points: [{ lat, lng, name?, kind? }, ...] — typically OSM nodes/way
   * centres for nearby waterway or water-body features. Returns the
   * nearest one plus its distance in metres, or null if the list is empty.
   */
  function nearest(lat, lng, points) {
    if (!points || !points.length) return null;
    let best = null;
    for (const p of points) {
      if (typeof p.lat !== "number" || typeof p.lng !== "number") continue;
      const d = haversineM(lat, lng, p.lat, p.lng);
      if (!best || d < best.distanceM) best = { ...p, distanceM: d };
    }
    return best;
  }

  /**
   * Config-driven modifier: a mapped waterway/water body found within
   * `nearM` is treated as a positive risk factor (bank/overflow
   * exposure) and steps the tier up by one. Absence of a nearby feature
   * is deliberately NOT treated as evidence of safety — OSM waterway
   * coverage in rural Kenya is patchy, so "nothing found nearby" only
   * ever means "unknown", never "safe" (the same asymmetric-evidence
   * principle as the flood-zone adjustment in risk.js: an unmapped area
   * is lower, not zero, exposure).
   */
  function classify(nearestMatch, waterConfig) {
    if (!waterConfig || waterConfig.enabled === false) {
      return { modifier: 0, label: "unavailable" };
    }
    const nearM = waterConfig.nearM ?? 150;
    if (nearestMatch && nearestMatch.distanceM <= nearM) {
      return {
        modifier: 1,
        label: "near-water",
        distanceM: nearestMatch.distanceM,
        name: nearestMatch.name || null,
        kind: nearestMatch.kind || "water feature",
      };
    }
    return {
      modifier: 0,
      label: nearestMatch ? "mapped-but-far" : "no-data",
      distanceM: nearestMatch ? nearestMatch.distanceM : null,
    };
  }

  return { haversineM, nearest, classify };
})();
