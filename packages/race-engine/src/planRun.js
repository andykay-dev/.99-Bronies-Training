// ─────────────────────────────────────────────────────────────
//  RACE ENGINE — planRun.js
//  planRun(input) → RunPlan
//
//  Generates a simple ad-hoc fuelling plan for a training run
//  or tune-up race. No legs, no course setup — just distance,
//  pace, conditions, and what's in the vest.
//
//  Model:
//    durationMins  = distKm / (paceSecKm / 60)
//    carbsG        = (durationMins / 60) × CARB_TARGET_PER_HOUR
//                    scaled down for runs < 60min (gut needs time to absorb)
//    fluidMl       = (durationMins / 60) × FLUID_TARGET_PER_HOUR
//                    scaled up +20% in hot conditions
//    vestItems     = ceil(carbsG / avgCarbsPerItem)
//    timings[]     = take-item reminders every ~20-25min after 20min mark
//
//  Carb scaling by duration:
//    < 45min  → 0   (water only, no carbs needed)
//    45-60min → 30g flat (one item, top-up only)
//    60-90min → 60g/hr (moderate — gut still warming up)
//    > 90min  → 85g/hr (full race fuelling rate)
// ─────────────────────────────────────────────────────────────

import {
  CARB_TARGET_PER_HOUR,
  FLUID_TARGET_PER_HOUR,
  FLASK_ML,
} from "./constants.js";

/**
 * Average carbs per item, falling back to 25g if inventory empty.
 */
function avgCarbsPerItem(inventory) {
  if (!inventory || inventory.length === 0) return 25;
  return inventory.reduce((a, i) => a + (i.carbs || 0), 0) / inventory.length;
}

/**
 * Scale the carb rate based on run duration.
 * Shorter runs need far less carbohydrate — the body has glycogen stores
 * that only need topping up once you're past ~60 minutes.
 */
function carbRateForDuration(durationMins) {
  if (durationMins < 45)  return 0;          // water only
  if (durationMins < 60)  return 20;         // ~20g/hr — token top-up
  if (durationMins < 90)  return 50;         // moderate
  if (durationMins < 120) return 65;         // building up
  return CARB_TARGET_PER_HOUR;               // full 85g/hr for long efforts
}

/**
 * Generate take-fuel timing reminders.
 * First item at 20min, then every intervalMins until end.
 * Returns array of { atMin, label } objects.
 */
function buildTimings(durationMins, totalItems, fuelInventory) {
  if (totalItems === 0) return [];

  const timings = [];
  const intervalMins = Math.max(15, Math.min(25, Math.round((durationMins - 20) / totalItems)));
  const items = fuelInventory && fuelInventory.length > 0 ? fuelInventory : null;

  let itemIdx = 0;
  let atMin   = 20;

  while (atMin < durationMins - 5 && timings.length < totalItems) {
    const item = items ? items[itemIdx % items.length] : null;
    timings.push({
      atMin,
      label: item ? item.name : "Fuel item",
      carbs: item ? item.carbs : 25,
    });
    atMin   += intervalMins;
    itemIdx += 1;
  }

  return timings;
}

/**
 * Format minutes as "1h 23min" or "45min"
 */
function fmtMins(mins) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

/**
 * @typedef {object} RunInput
 * @property {number}   distKm        - Distance in km
 * @property {number}   paceSecKm     - Target pace in seconds per km (e.g. 330 = 5:30/km)
 * @property {"cool"|"mild"|"warm"|"hot"} conditions
 * @property {{ name:string, carbs:number }[]} fuelInventory - items in vest
 * @property {boolean}  [waterAvailable] - water on course (reduces flask count)
 */

/**
 * @typedef {object} RunPlan
 * @property {number}   distKm
 * @property {number}   paceSecKm
 * @property {number}   durationMins    - estimated total time
 * @property {string}   durationFmt     - "1h 23min"
 * @property {number}   carbsG          - total carbs needed
 * @property {number}   fluidMl         - total fluid needed
 * @property {number}   vestItems       - fuel items to carry
 * @property {number}   flasks          - soft flasks to carry
 * @property {string}   carbsNote       - human note about carb strategy
 * @property {{ atMin:number, label:string, carbs:number }[]} timings
 * @property {string[]} tips            - context-aware run tips
 */

/**
 * Generate an ad-hoc run nutrition plan.
 *
 * @param {RunInput} input
 * @returns {RunPlan}
 */
export function planRun(input) {
  const {
    distKm,
    paceSecKm,
    conditions   = "mild",
    fuelInventory = [],
    waterAvailable = false,
  } = input;

  // ── Duration ─────────────────────────────────────────────
  // paceSecKm is seconds per km, so:
  // durationMins = distKm × paceSecKm (sec) ÷ 60 (sec/min)
  const durationMins = (distKm * paceSecKm) / 60;

  // ── Carbs ─────────────────────────────────────────────────
  const carbRate  = carbRateForDuration(durationMins);
  const carbsG    = Math.round((durationMins / 60) * carbRate);
  const perItem   = avgCarbsPerItem(fuelInventory);
  const vestItems = carbsG > 0 ? Math.ceil(carbsG / perItem) : 0;

  // ── Fluid ─────────────────────────────────────────────────
  const heatMultiplier = { cool:0.8, mild:1.0, warm:1.25, hot:1.5 }[conditions] ?? 1.0;
  const fluidMl = Math.round((durationMins / 60) * FLUID_TARGET_PER_HOUR * heatMultiplier);

  // If water is available on course, carry less — one flask minimum
  const rawFlasks  = Math.ceil(fluidMl / FLASK_ML);
  const flasks = waterAvailable
    ? Math.max(1, Math.ceil(rawFlasks / 2))
    : Math.max(1, rawFlasks);

  // ── Carb note ─────────────────────────────────────────────
  let carbsNote;
  if (durationMins < 45) {
    carbsNote = "Under 45min — water only. Your glycogen stores will cover it.";
  } else if (durationMins < 60) {
    carbsNote = "45–60min — one small top-up item is enough. Focus on hydration.";
  } else if (durationMins < 90) {
    carbsNote = "60–90min — start fuelling from 20min in. Gut is still warming up so keep it light.";
  } else {
    carbsNote = "Over 90min — treat this like a race. Consistent fuelling every 20–25min from the start.";
  }

  // ── Timings ───────────────────────────────────────────────
  const timings = buildTimings(durationMins, vestItems, fuelInventory);

  // ── Contextual tips ───────────────────────────────────────
  const tips = [];

  if (conditions === "hot" || conditions === "warm") {
    tips.push("Hot conditions: pre-hydrate with 500ml in the 30min before you head out.");
    tips.push("Consider adding electrolytes to your first flask — sodium helps with absorption.");
  }
  if (durationMins > 90) {
    tips.push("Start fuelling earlier than feels necessary — gut absorption takes 15–20min to kick in.");
  }
  if (distKm >= 21 && distKm < 25) {
    tips.push("Half marathon pacing: the first 10km should feel easy. If you're reaching for fuel early, back off the pace.");
  }
  if (distKm >= 30) {
    tips.push("Long run: alternate between water and electrolyte mix to avoid sodium depletion.");
  }
  if (waterAvailable) {
    tips.push("Water on course: top up your flask at each station. Don't wait until you feel thirsty.");
  }
  if (fuelInventory.length === 0) {
    tips.push("No fuel inventory set — estimates use 25g/item average. Add your products to the library for exact counts.");
  }

  return {
    distKm,
    paceSecKm,
    durationMins: Math.round(durationMins * 10) / 10,
    durationFmt:  fmtMins(durationMins),
    carbsG,
    carbRate,
    fluidMl,
    vestItems,
    flasks,
    carbsNote,
    timings,
    tips,
  };
}
