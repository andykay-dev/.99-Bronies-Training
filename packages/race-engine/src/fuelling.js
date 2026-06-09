// ─────────────────────────────────────────────────────────────
//  RACE ENGINE — fuelling.js
//  computeLegFuelling(leg, totalDistKm, strategy) → LegFuel
//
//  Takes a single leg, the total race distance, and the strategy.
//  Returns the leg enriched with time and nutrition estimates.
// ─────────────────────────────────────────────────────────────

import {
  CARB_TARGET_PER_HOUR,
  FLUID_TARGET_PER_HOUR,
  NAISMITH_MINS_PER_100M,
  FLASK_ML,
} from "./constants.js";

/**
 * Average carbs per item across the fuel inventory.
 * Falls back to 25g (a conservative gel) if inventory is empty.
 *
 * @param {{ name: string, carbs: number }[]} fuelInventory
 * @returns {number}
 */
function avgCarbsPerItem(fuelInventory) {
  if (!fuelInventory || fuelInventory.length === 0) return 25;
  const total = fuelInventory.reduce((acc, item) => acc + (item.carbs || 0), 0);
  return total / fuelInventory.length;
}

/**
 * @typedef {object} LegFuel
 * @property {string}  name       - Leg name (passed through)
 * @property {number}  km         - Leg distance (passed through)
 * @property {number}  gainM      - Elevation gain (passed through)
 * @property {string}  stock      - Aid station stock (passed through)
 * @property {number}  legMins    - Estimated total time for this leg in minutes
 * @property {number}  carbsG     - Carbohydrates required in grams
 * @property {number}  fluidMl    - Fluid required in ml
 * @property {number}  vestItems  - Fuel items to carry into this leg
 * @property {number}  flasks     - Soft flasks needed for this leg
 */

/**
 * Compute per-leg time and nutrition requirements.
 *
 * Time model:
 *   baseLegMins  = (targetHours × 60) × (leg.km / totalDistKm)
 *   climbDelay   = (leg.gainM / 100) × NAISMITH_MINS_PER_100M
 *   totalLegMins = baseLegMins + climbDelay
 *
 * Nutrition model:
 *   carbsG    = (totalLegMins / 60) × CARB_TARGET_PER_HOUR
 *   fluidMl   = (totalLegMins / 60) × FLUID_TARGET_PER_HOUR
 *   vestItems = ceil(carbsG / avgCarbsPerItem)
 *   flasks    = max(1, ceil(fluidMl / FLASK_ML))
 *
 * @param {{ km: number, gainM: number, name: string, stock: string }} leg
 * @param {number} totalDistKm - total race distance in km
 * @param {{ targetHours: number, fuelInventory: Array }} strategy
 * @returns {LegFuel}
 */
export function computeLegFuelling(leg, totalDistKm, strategy) {
  const { targetHours, fuelInventory } = strategy;

  const segmentProportion = leg.km / totalDistKm;
  const baseLegMins = targetHours * 60 * segmentProportion;
  const climbDelayMins = (leg.gainM / 100) * NAISMITH_MINS_PER_100M;
  const legMins = baseLegMins + climbDelayMins;

  const legHours = legMins / 60;
  const carbsG = legHours * CARB_TARGET_PER_HOUR;
  const fluidMl = legHours * FLUID_TARGET_PER_HOUR;

  const perItem = avgCarbsPerItem(fuelInventory);
  const vestItems = Math.ceil(carbsG / perItem);
  const flasks = Math.max(1, Math.ceil(fluidMl / FLASK_ML));

  return {
    name:      leg.name,
    km:        leg.km,
    gainM:     leg.gainM,
    stock:     leg.stock,
    legMins:   Math.round(legMins * 10) / 10,     // 1 decimal place
    carbsG:    Math.round(carbsG * 10) / 10,
    fluidMl:   Math.round(fluidMl),
    vestItems,
    flasks,
  };
}
