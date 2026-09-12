/**
 * risk.js — rainfall + flood-zone risk classification (FR-2.3, FR-2.4).
 *
 * Pure functions, no I/O — this is what TC-ALGO-01 should unit-test with
 * the boundary matrix (19.9 / 20 / 50 / 100 mm) called out in the SRS.
 * Every threshold and label comes from config/config.json (FR-4.2) —
 * nothing here is hardcoded, so an ops/DRR update to the config file
 * changes behaviour without a redeploy.
 */

const FloodRisk = (() => {

  const TIERS = ["green", "yellow", "orange", "red"];

  /**
   * Map a 24h rainfall figure (mm) to a base tier using config thresholds.
   * thresholds: { yellow: 20, orange: 50, red: 100 }
   *   < yellow           -> green
   *   [yellow, orange)   -> yellow
   *   [orange, red)      -> orange
   *   >= red             -> red
   */
  function tierFromRainfall(mm, thresholds) {
    if (mm >= thresholds.red) return "red";
    if (mm >= thresholds.orange) return "orange";
    if (mm >= thresholds.yellow) return "yellow";
    return "green";
  }

  function stepDown(tier) {
    const idx = TIERS.indexOf(tier);
    return TIERS[Math.max(0, idx - 1)];
  }

  function stepUp(tier) {
    const idx = TIERS.indexOf(tier);
    return TIERS[Math.min(TIERS.length - 1, idx + 1)];
  }

  /**
   * Combine rainfall tier with flood-zone membership, then with the two
   * finer-grained local signals (terrain relief/slope, waterway
   * proximity) from terrain.js / waterway.js.
   *
   * Decision rule (documented per FR-2.3's "documented decision table"
   * requirement, configurable via config.zoneAdjustment):
   *   1. Base tier from rainfall (config.thresholds).
   *   2. Zone adjustment: inside a mapped flood zone -> unchanged;
   *      outside every mapped flood zone -> step down one (unmapped
   *      land is lower, not zero, exposure). Disable via
   *      config.zoneAdjustment: false.
   *   3. Local adjustment: terrainAdjustment.modifier and
   *      waterAdjustment.modifier (each -1/0/+1, from terrain.js /
   *      waterway.js) are summed and clamped to a single step so
   *      neither factor — nor both together — can override the
   *      rainfall + flood-zone signal outright. Positive net -> step
   *      up one; negative net -> step down one. Either input can be
   *      omitted (e.g. elevation/Overpass lookup failed) and is then
   *      simply neutral (modifier 0), so the tier still resolves from
   *      whatever signals *did* come back.
   */
  function classify({ rainfallMm, inFloodZone, config, terrainAdjustment, waterAdjustment }) {
    const base = tierFromRainfall(rainfallMm, config.thresholds);
    const applyZoneAdjustment = config.zoneAdjustment !== false;
    const afterZone = (!inFloodZone && applyZoneAdjustment) ? stepDown(base) : base;

    const terrainMod = (terrainAdjustment && terrainAdjustment.modifier) || 0;
    const waterMod = (waterAdjustment && waterAdjustment.modifier) || 0;
    const netLocalMod = Math.max(-1, Math.min(1, terrainMod + waterMod));
    const tier = netLocalMod > 0 ? stepUp(afterZone) : netLocalMod < 0 ? stepDown(afterZone) : afterZone;

    return { tier, baseTierFromRainfall: base, afterZoneTier: afterZone, localModifier: netLocalMod };
  }

  /**
   * Build the one-sentence, plain-language explanation required by FR-2.4.
   * terrainLabel / waterLabel (optional) fold in the finer-grained local
   * signals when they were available and meaningful.
   */
  function explain({ rainfallMm, windowLabel, inFloodZone, terrainLabel, waterLabel }) {
    const zonePart = inFloodZone
      ? "your location is inside a mapped flood zone"
      : "your location is outside any mapped flood zone";
    let sentence = `Forecast shows ${rainfallMm.toFixed(1)}mm of rain in the ${windowLabel} and ${zonePart}`;
    if (terrainLabel) sentence += `; the ground here ${terrainLabel}`;
    if (waterLabel) sentence += `, and ${waterLabel}`;
    return `${sentence}.`;
  }

  const TIER_LABELS = {
    green: "Risk status: Low risk",
    yellow: "Risk status: Elevated risk",
    orange: "Risk status: High risk",
    red: "Risk status: Severe risk",
  };

  const TIER_DESCRIPTIONS = {
    green: "Keep your plan ready and watch local weather updates.",
    yellow: "Prepare now and check your route to safer ground.",
    orange: "Act soon: protect essentials and be ready to leave.",
    red: "Act now: follow local warnings and move to safer ground if told.",
  };

  return { tierFromRainfall, classify, explain, stepUp, stepDown, TIER_LABELS, TIER_DESCRIPTIONS, TIERS };
})();
