// ─────────────────────────────────────────────────────────────
//  RACE ENGINE — calculator.js
//  generateRacePlan(race, strategy) → RacePlan
//
//  Top-level orchestrator. Derives totals from legs, maps each
//  leg through fuelling, computes daysToGo from engine-core's
//  Sydney-time clock, and appends gear recommendations.
// ─────────────────────────────────────────────────────────────

import { todaySydney, parseLocalDate } from "@bronies/engine-core";
import { computeLegFuelling } from "./fuelling.js";
import { recommendGear } from "./gear.js";
import { recommendAidStationFuel } from "./aidStationFuel.js";

/**
 * @typedef {object} RacePlan
 * @property {number}   globalPaceMinKm  - Overall pace in min/km (target time ÷ distance)
 * @property {number}   totalItems       - Sum of vestItems across all legs
 * @property {number}   peakFlasks       - Maximum flasks required on any single leg
 * @property {number}   daysToGo         - Calendar days from today (Sydney) to race date
 * @property {number}   totalDistKm      - Sum of km across legs
 * @property {number}   totalAscentM     - Sum of gainM across legs
 * @property {import('./fuelling.js').LegFuel[]} legs
 * @property {{ item: string, status: string }[]} gear
 */

/**
 * Generate a complete race day plan.
 *
 * The race object's `distance` field is auto-derived from the sum of leg
 * distances — do not rely on a top-level race.distance field being present
 * (the UI only stores legs). Same for ascent.
 *
 * Returns null if race has no legs or strategy is missing.
 *
 * @param {{ title?: string, date?: string, legs: Array }} race
 * @param {{ targetHours: number, conditions: string, fuelInventory: Array }} strategy
 * @returns {RacePlan|null}
 */
export function generateRacePlan(race, strategy) {
  if (!race || !race.legs || race.legs.length === 0) return null;
  if (!strategy || !strategy.targetHours) return null;

  // Derive totals from legs
  const validLegs = race.legs.filter(l => l.km > 0);
  if (validLegs.length === 0) return null;

  const totalDistKm  = validLegs.reduce((acc, l) => acc + l.km, 0);
  const totalAscentM = validLegs.reduce((acc, l) => acc + (l.gainM || 0), 0);

  // Global pace — based purely on target time and total distance (no Naismith at this level)
  const globalPaceMinKm = (strategy.targetHours * 60) / totalDistKm;

  // Per-leg fuelling
  const legs = validLegs.map(leg => computeLegFuelling(leg, totalDistKm, strategy));

  // Aid station suggestions — needs cumulative distance AND cumulative time
  // at the START of each leg (caffeine timing is time-based, substitutions
  // are distance/effort-based).
  let cumulativeKm = 0;
  let cumulativeMins = 0;
  for (const leg of legs) {
    leg.aidStation = recommendAidStationFuel(leg, cumulativeKm, cumulativeMins, strategy);
    cumulativeKm += leg.km;
    cumulativeMins += leg.legMins;
  }

  // Summary stats across legs
  const totalItems = legs.reduce((acc, l) => acc + l.vestItems, 0);
  const peakFlasks = legs.reduce((acc, l) => Math.max(acc, l.flasks), 0);

  // Days to race (Sydney calendar, so midnight doesn't flip early for eastern AU users)
  let daysToGo = null;
  if (race.date) {
    const todayStr  = todaySydney(); // "YYYY-MM-DD"
    const todayDate = parseLocalDate(todayStr);
    const raceDate  = parseLocalDate(race.date);
    if (todayDate && raceDate) {
      const msPerDay = 1000 * 60 * 60 * 24;
      daysToGo = Math.round((raceDate - todayDate) / msPerDay);
    }
  }

  // Gear
  const gear = recommendGear(strategy.conditions, race);

  return {
    globalPaceMinKm: Math.round(globalPaceMinKm * 100) / 100,
    totalItems,
    peakFlasks,
    daysToGo,
    totalDistKm:  Math.round(totalDistKm * 10) / 10,
    totalAscentM,
    legs,
    gear,
  };
}
