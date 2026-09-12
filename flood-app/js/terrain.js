/**
 * terrain.js — local terrain analysis from a small elevation sample grid.
 *
 * This is what makes risk assessment go finer than "county" or even
 * "flood-zone polygon": a single elevation value at one point tells you
 * almost nothing about flood exposure. What actually matters at
 * building/plot scale is RELIEF (does this point sit in a bowl relative
 * to its immediate surroundings, where runoff collects?) and SLOPE (does
 * water drain away quickly, or pool?). Sampling a small ring of points
 * around the location and comparing their elevations gives a cheap,
 * dependency-free approximation of both — using only a public elevation
 * API (no DEM file, no GIS library, no server of our own).
 *
 * Pure functions, no I/O — mirrors pip.js/risk.js so this is
 * unit-testable without a browser or network. app.js is the only place
 * that calls the elevation API; it hands the raw numbers in here.
 */

const FloodTerrain = (() => {

  const EARTH_RADIUS_M = 6371000;

  /**
   * Build a compass ring of [lat, lng] sample points around a centre
   * point, `radiusM` metres out, `count` points spaced evenly starting
   * due north and sweeping clockwise. Returns the centre point first
   * (role: "center"), then the ring (role: "ring") — order matters,
   * callers index the parallel elevations array by position.
   */
  function buildSampleGrid(lat, lng, radiusM, count) {
    const points = [{ lat, lng, role: "center" }];
    const latRad = (lat * Math.PI) / 180;
    const dLatPerM = 1 / ((Math.PI / 180) * EARTH_RADIUS_M);
    const dLngPerM = 1 / ((Math.PI / 180) * EARTH_RADIUS_M * Math.cos(latRad));
    for (let i = 0; i < count; i++) {
      const bearing = (2 * Math.PI * i) / count; // 0 = north, clockwise
      const dLat = radiusM * Math.cos(bearing) * dLatPerM;
      const dLng = radiusM * Math.sin(bearing) * dLngPerM;
      points.push({ lat: lat + dLat, lng: lng + dLng, role: "ring", bearingDeg: (bearing * 180) / Math.PI });
    }
    return points;
  }

  /**
   * Combine sample points with their elevations (metres) into a terrain
   * read: relief (centre minus ring average — negative means the centre
   * sits in a local bowl) and slope (steepest ring point relative to
   * centre, as a percent grade).
   */
  function analyze(points, elevations, radiusM) {
    if (!Array.isArray(elevations) || elevations.length !== points.length || typeof elevations[0] !== "number") {
      return null;
    }
    const centerElev = elevations[0];
    const ringElevs = elevations.slice(1);
    if (!ringElevs.length || ringElevs.some((v) => typeof v !== "number")) return null;

    const ringAvg = ringElevs.reduce((s, v) => s + v, 0) / ringElevs.length;
    const reliefM = centerElev - ringAvg; // negative = centre sits in a bowl
    const maxAbsDiff = ringElevs.reduce((m, v) => Math.max(m, Math.abs(v - centerElev)), 0);
    const slopePercent = radiusM > 0 ? (maxAbsDiff / radiusM) * 100 : 0;

    return { centerElev, ringElevs, ringAvg, reliefM, slopePercent };
  }

  /**
   * Classify a terrain analysis into a risk-tier adjustment, using
   * config-driven thresholds (same ops-editable pattern as risk.js's
   * thresholds — no redeploy needed to retune).
   *
   * Decision table (documented, mirrors risk.js's zone-adjustment table):
   *   - reliefM <= lowPointReliefM AND slopePercent < flatSlopePercent
   *       -> "basin": local depression, flat -> poor natural drainage.
   *          Steps the tier UP by one.
   *   - reliefM >= elevatedReliefM AND slopePercent >= steepSlopePercent
   *       -> "ridge": sits above its surroundings on a real gradient ->
   *          runoff drains away quickly. Steps the tier DOWN by one.
   *   - otherwise -> "mixed": no strong local signal either way. No change.
   * Bounded to a single step either way so terrain can nudge the result
   * but never override the rainfall + flood-zone signal outright.
   */
  function classify(analysis, terrainConfig) {
    if (!analysis || !terrainConfig || terrainConfig.enabled === false) {
      return { modifier: 0, label: "unavailable" };
    }
    const { reliefM, slopePercent } = analysis;
    const lowPointM = terrainConfig.lowPointReliefM ?? -1.5;
    const elevatedM = terrainConfig.elevatedReliefM ?? 1.5;
    const flatPercent = terrainConfig.flatSlopePercent ?? 2;
    const steepPercent = terrainConfig.steepSlopePercent ?? 8;

    if (reliefM <= lowPointM && slopePercent < flatPercent) {
      return { modifier: 1, label: "basin", reliefM, slopePercent };
    }
    if (reliefM >= elevatedM && slopePercent >= steepPercent) {
      return { modifier: -1, label: "ridge", reliefM, slopePercent };
    }
    return { modifier: 0, label: "mixed", reliefM, slopePercent };
  }

  const TERRAIN_LABELS = {
    basin: "sits in a low-lying, flat spot with poor natural drainage",
    ridge: "sits on elevated, sloped ground that drains well",
    mixed: "has no strong local drainage signal either way",
    unavailable: "terrain data was unavailable for this location",
  };

  return { buildSampleGrid, analyze, classify, TERRAIN_LABELS };
})();
