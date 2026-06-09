// ─────────────────────────────────────────────────────────────
//  SCANNER ENGINE — index.js
//  Public exports for @bronies/scanner-engine
// ─────────────────────────────────────────────────────────────

export { processScan }       from "./scan.js";
export { extractNutrition }  from "./extractNutrition.js";

// Intent constants — use these instead of raw strings
export const SCAN_INTENTS = {
  RACE_AID_STATIONS: "race_aid_stations",
  NUTRITION:         "nutrition",
  GENERAL:           "general",
};
