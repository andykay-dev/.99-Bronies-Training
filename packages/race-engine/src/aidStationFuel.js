// ─────────────────────────────────────────────────────────────
//  RACE ENGINE — aidStationFuel.js
//  recommendAidStationFuel(leg, cumulativeKmAtStart, strategy) → AidStationFuel
//
//  Cross-references a leg's aid station stock (free text, e.g.
//  "Water, Coca-cola, Trail Brew, Lollies, Chips, Bananas") against
//  the runner's vest plan and produces a short list of suggestions:
//    - "grab a handful of chips instead of a vest item"
//    - "Coke available — worth a caffeine hit from here on"
//
//  This is additive — it doesn't change vestItems/flasks math from
//  computeLegFuelling(), it just suggests substitutions and extras.
// ─────────────────────────────────────────────────────────────

import { AID_STATION_ITEMS, CAFFEINE_USEFUL_FROM_KM, CAFFEINE_USEFUL_FROM_MINS } from "./constants.js";

/**
 * Match a free-text stock string against AID_STATION_ITEMS.
 * Returns the matched item configs (with their key) found in the text.
 *
 * @param {string} stockText
 * @returns {{ key: string, label: string, estCarbsG: number, caffeineMg: number, tags: string[] }[]}
 */
function matchStockItems(stockText) {
  if (!stockText) return [];
  const lower = stockText.toLowerCase();
  const matches = [];

  for (const [key, item] of Object.entries(AID_STATION_ITEMS)) {
    if (item.keywords.some(kw => lower.includes(kw))) {
      matches.push({ key, ...item });
    }
  }
  return matches;
}

/**
 * @typedef {object} AidStationFuel
 * @property {{ key:string, label:string, estCarbsG:number, caffeineMg:number, tags:string[] }[]} available
 *   — items detected at this aid station
 * @property {string[]} substitutions
 *   — human-readable suggestions for grabbing aid station food instead of vest items
 * @property {{ available: boolean, suggestion: string|null }} caffeine
 *   — whether caffeine is available here and whether it's a good point to take it
 * @property {number} aidStationCarbsG
 *   — rough total carbs available if the runner grabs one of everything offered
 */

/**
 * Generate aid-station-aware fuel suggestions for a leg.
 *
 * @param {{ stock: string, carbsG: number, vestItems: number }} leg
 *   The leg from computeLegFuelling() — needs .stock, .carbsG, .vestItems
 * @param {number} cumulativeKmAtStart
 *   Distance covered before reaching this leg's aid station (km)
 * @param {number} cumulativeMinsAtStart
 *   Time elapsed before reaching this leg's aid station (minutes)
 * @param {{ fuelInventory: Array, conditions?: string }} strategy
 * @returns {AidStationFuel}
 */
export function recommendAidStationFuel(leg, cumulativeKmAtStart, cumulativeMinsAtStart, strategy = {}) {
  const available = matchStockItems(leg.stock);

  const substitutions = [];
  const aidStationCarbsG = available.reduce((sum, i) => sum + i.estCarbsG, 0);

  // ── Substitution suggestions ──────────────────────────────
  // If the aid station offers enough carbs to cover (or partly cover) this
  // leg's requirement, suggest grabbing real food instead of a vest item.
  if (available.length > 0 && leg.carbsG > 0) {
    const foodItems = available.filter(i => i.tags.includes("carbs") && i.key !== "coke");

    if (foodItems.length > 0) {
      // Suggest the most calorie-dense whole-food options first (banana > chips > lollies)
      const sorted = [...foodItems].sort((a, b) => b.estCarbsG - a.estCarbsG);
      const top = sorted.slice(0, 2);

      if (aidStationCarbsG >= leg.carbsG) {
        // Aid station alone could realistically cover this leg
        substitutions.push(
          `This station has enough on offer (${top.map(i => i.label.toLowerCase()).join(" + ")}) ` +
          `to cover this leg's ~${Math.round(leg.carbsG)}g target — consider skipping a vest item here.`
        );
      } else if (leg.vestItems > 0) {
        // Partial cover — suggest dropping one vest item for real food
        substitutions.push(
          `Grab a handful of ${top[0].label.toLowerCase()} here` +
          (top[1] ? ` (or some ${top[1].label.toLowerCase()})` : "") +
          ` — saves a vest item for later in the race.`
        );
      }
    }
  }

  // ── Caffeine recommendation ───────────────────────────────
  // Two independent triggers, either is enough:
  //   - Distance: past the "second wind" point where effort starts to bite
  //   - Time: pre-race caffeine (coffee, breakfast) has likely worn off by ~90min,
  //           regardless of how far that 90min has covered (relevant for slower
  //           runners on long climbs where 25km might take 3+ hours)
  const caffeineItems   = available.filter(i => i.tags.includes("caffeine"));
  const pastDistancePoint = cumulativeKmAtStart   >= CAFFEINE_USEFUL_FROM_KM;
  const pastTimePoint     = cumulativeMinsAtStart >= CAFFEINE_USEFUL_FROM_MINS;
  const pastUsefulPoint   = pastDistancePoint || pastTimePoint;

  let caffeineSuggestion = null;
  if (caffeineItems.length > 0 && pastUsefulPoint) {
    const names = caffeineItems.map(i => i.label).join(" or ");
    const hours = Math.floor(cumulativeMinsAtStart / 60);
    const mins  = Math.round(cumulativeMinsAtStart % 60);
    const timeStr = hours > 0 ? `${hours}h ${mins}min` : `${mins}min`;

    if (pastTimePoint && !pastDistancePoint) {
      // Time-based trigger fired first — likely a slower runner / steep early climb
      caffeineSuggestion =
        `You're ${timeStr} in — any pre-race caffeine has likely worn off by now. ` +
        `${names} available here is a good pick-me-up.`;
    } else {
      caffeineSuggestion =
        `You're ${Math.round(cumulativeKmAtStart)}km in (${timeStr}) — ${names} available here is a good ` +
        `caffeine boost for the back half. Worth a cup if you're feeling flat.`;
    }
  } else if (caffeineItems.length > 0 && !pastUsefulPoint) {
    // Caffeine available but probably too early — mention it's there for later reference
    caffeineSuggestion =
      `${caffeineItems.map(i => i.label).join(" / ")} available — save the caffeine hit ` +
      `for a later station if you're still feeling fresh.`;
  }

  return {
    available,
    substitutions,
    caffeine: {
      available: caffeineItems.length > 0,
      suggestion: caffeineSuggestion,
    },
    aidStationCarbsG,
  };
}
