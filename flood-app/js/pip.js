/**
 * pip.js — client-side point-in-polygon check (FR-2.1).
 *
 * Implements the standard ray-casting algorithm against GeoJSON
 * Polygon / MultiPolygon geometries. No network calls, no dependencies —
 * this must run entirely on-device (NFR-6).
 */

const FloodPIP = (() => {

  /**
   * Ray-casting test: is [lng, lat] inside a single linear ring?
   * ring: array of [lng, lat] pairs (GeoJSON winding, first ring = outer).
   */
  function pointInRing(lng, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersects =
        (yi > lat) !== (yj > lat) &&
        (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  /**
   * A point is inside a Polygon if it's inside the outer ring (ring[0])
   * and NOT inside any hole (ring[1..n]).
   */
  function pointInPolygon(lng, lat, coordinates) {
    if (!coordinates.length) return false;
    if (!pointInRing(lng, lat, coordinates[0])) return false;
    for (let h = 1; h < coordinates.length; h++) {
      if (pointInRing(lng, lat, coordinates[h])) return false;
    }
    return true;
  }

  function pointInMultiPolygon(lng, lat, polygons) {
    return polygons.some((coords) => pointInPolygon(lng, lat, coords));
  }

  /**
   * Test a point against a single GeoJSON Feature (Polygon or MultiPolygon).
   */
  function pointInFeature(lng, lat, feature) {
    const geom = feature && feature.geometry;
    if (!geom) return false;
    if (geom.type === "Polygon") {
      return pointInPolygon(lng, lat, geom.coordinates);
    }
    if (geom.type === "MultiPolygon") {
      return pointInMultiPolygon(lng, lat, geom.coordinates);
    }
    return false;
  }

  /**
   * Test a point against a GeoJSON FeatureCollection.
   * Returns the first matching feature, or null if the point is outside
   * every mapped flood zone.
   */
  function findMatchingZone(lng, lat, featureCollection) {
    const features = (featureCollection && featureCollection.features) || [];
    for (const feature of features) {
      if (pointInFeature(lng, lat, feature)) return feature;
    }
    return null;
  }

  return { pointInFeature, findMatchingZone };
})();
