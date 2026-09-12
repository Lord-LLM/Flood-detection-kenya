/**
 * recommendations.js - plain-language actions from local risk signals.
 * Pure functions only: thresholds are supplied by the live config.
 */

const FloodRecommendations = (() => {
  function build({ tier, reliefM, slopePercent, nearestWaterDistance, waterAvailable, inFloodZone, terrainConfig, waterConfig }) {
    const items = [];
    const terrain = terrainConfig || {};
    const water = waterConfig || {};

    if (typeof reliefM === "number" && typeof slopePercent === "number") {
      const isBowl = typeof terrain.lowPointReliefM === "number" && typeof terrain.flatSlopePercent === "number"
        && reliefM <= terrain.lowPointReliefM && slopePercent < terrain.flatSlopePercent;
      const isSteep = typeof terrain.elevatedReliefM === "number" && typeof terrain.steepSlopePercent === "number"
        && reliefM >= terrain.elevatedReliefM && slopePercent >= terrain.steepSlopePercent;
      if (isBowl) {
        items.push("Water tends to collect here. Clear drains and channels near your home before rain starts.");
      } else if (isSteep) {
        items.push("Runoff drains away quickly here. Check that water is not being sent toward a road or neighbour below you.");
      }
    }

    if (waterAvailable === false) {
      items.push("No nearby mapped water feature was found. Map coverage can be incomplete, so this does not mean the area is safe.");
    } else if (waterAvailable === null) {
      items.push("Nearby water data was not available. Do not treat missing map data as proof that the area is safe.");
    } else if (typeof nearestWaterDistance === "number" && typeof water.nearM === "number" && nearestWaterDistance <= water.nearM) {
      items.push("You are close to a mapped river or stream. Know your route to higher ground.");
    }

    if (inFloodZone) {
      items.push("Your location is in a mapped flood zone. Keep important items high and be ready to leave early.");
    } else {
      items.push("No mapped flood zone covers this point. Stay alert because maps and warnings can miss local flooding.");
    }

    if (!items.length) {
      items.push(`Your current status is ${tier || "uncertain"}. Check local warnings and keep your household plan ready.`);
    }
    return items;
  }

  return { build };
})();