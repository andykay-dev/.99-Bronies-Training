// ─────────────────────────────────────────────────────────────
//  RACE ENGINE — index.js
//  Public exports for @bronies/race-engine.
// ─────────────────────────────────────────────────────────────

export { generateRacePlan }  from "./calculator.js";
export { computeLegFuelling } from "./fuelling.js";
export { recommendGear }      from "./gear.js";

export {
  CARB_TARGET_PER_HOUR,
  FLUID_TARGET_PER_HOUR,
  NAISMITH_MINS_PER_100M,
  FLASK_ML,
  FUEL_LOOKUP,
  DEFAULT_STRATEGY,
  DEFAULT_LEG,
} from "./constants.js";
