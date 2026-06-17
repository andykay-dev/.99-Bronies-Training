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
 * Partition the fuel inventory into solid food items (gels, bars, chews —
 * eaten discretely on the run) and drink mix items (Tailwind, Trail Brew —
 * added to flasks at aid stations, not counted as vest items).
 *
 * An item is treated as drink mix if:
 *   - item.type === "drink_mix"  (explicitly tagged), OR
 *   - item.name matches common drink-mix keywords
 *
 * This matters for vest-item counting: drink mixes contribute carbs to the
 * budget (reducing how many solids you need) but are NOT counted as carried
 * items — they're mixed at aid-station fill-ups, not eaten from a pocket.
 */
function partitionInventory(fuelInventory) {
  if (!fuelInventory || fuelInventory.length === 0) {
    return { solids: [], drinkMixes: [] };
  }
  const DRINK_MIX_KEYWORDS = /tailwind|trail\s?brew|precision\s?hydration|maurten\s?mix|skratch|nuun|hydration\s?mix|drink\s?mix|electrolyte\s?mix/i;

  const solids    = fuelInventory.filter(i =>
    i.type !== "drink_mix" && !DRINK_MIX_KEYWORDS.test(i.name)
  );
  const drinkMixes = fuelInventory.filter(i =>
    i.type === "drink_mix" || DRINK_MIX_KEYWORDS.test(i.name)
  );
  return { solids, drinkMixes };
}

/**
 * Average carbs per solid food item.
 * Falls back to 25g (a conservative gel) if no solid items.
 */
function avgCarbsPerSolid(solids) {
  if (!solids || solids.length === 0) return 25;
  const total = solids.reduce((acc, item) => acc + (item.carbs || 0), 0);
  return total / solids.length;
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
  const carbsG   = legHours * CARB_TARGET_PER_HOUR;
  const fluidMl  = legHours * FLUID_TARGET_PER_HOUR;

  // Split inventory — drink mixes fill flasks at aid stations and aren't
  // counted as discrete vest items.
  const { solids, drinkMixes } = partitionInventory(fuelInventory);

  // Carbs from drink mix in flasks this leg.
  // Each flask of drink mix contributes its carbs; we assume one flask per
  // leg minimum so at least one serving of mix is consumed if it's in the vest.
  const flasks = Math.max(1, Math.ceil(fluidMl / FLASK_ML));
  const drinkMixCarbsPerFlask = drinkMixes.length > 0
    ? drinkMixes.reduce((a, i) => a + (i.carbs || 0), 0) / drinkMixes.length
    : 0;
  const drinkMixCarbsG = drinkMixCarbsPerFlask * flasks;

  // Remaining carbs that must come from solid food
  const solidCarbsNeeded = Math.max(0, carbsG - drinkMixCarbsG);
  const perSolid  = avgCarbsPerSolid(solids);
  const vestItems = solidCarbsNeeded > 0 ? Math.ceil(solidCarbsNeeded / perSolid) : 0;

  // Build a human note for the leg card about how the carb target is split
  let drinkMixNote = null;
  if (drinkMixes.length > 0) {
    const mixNames = drinkMixes.map(i => i.name).join(" / ");
    const covered  = Math.min(Math.round(drinkMixCarbsG), Math.round(carbsG));
    const fromFood = Math.round(solidCarbsNeeded);
    drinkMixNote = fromFood > 0
      ? `${mixNames} covers ~${covered}g — ${fromFood}g still from solids`
      : `${mixNames} covers the full carb target for this leg`;
  }

  return {
    name:          leg.name,
    km:            leg.km,
    gainM:         leg.gainM,
    stock:         leg.stock,
    legMins:       Math.round(legMins * 10) / 10,
    carbsG:        Math.round(carbsG * 10) / 10,
    fluidMl:       Math.round(fluidMl),
    vestItems,
    flasks,
    drinkMixNote,  // shown on leg card below the nutrition row
    drinkMixCarbsG: Math.round(drinkMixCarbsG),
    solidCarbsNeeded: Math.round(solidCarbsNeeded),
  };
}
