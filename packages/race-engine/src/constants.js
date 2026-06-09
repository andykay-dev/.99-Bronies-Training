// ─────────────────────────────────────────────────────────────
//  RACE ENGINE — constants.js
//  Nutrition targets, Naismith factor, fuel lookup, defaults.
// ─────────────────────────────────────────────────────────────

/** Carbohydrate target in grams per hour of running */
export const CARB_TARGET_PER_HOUR = 85; // g/hr

/** Base fluid target in ml per hour */
export const FLUID_TARGET_PER_HOUR = 600; // ml/hr

/** Naismith's rule: additional minutes per 100m of climb */
export const NAISMITH_MINS_PER_100M = 5.5;

/** Flask volume in ml — used to compute flask count per leg */
export const FLASK_ML = 500;

/**
 * Preset fuel items with carb content per serving.
 * Key is display name, value is carbs in grams.
 */
export const FUEL_LOOKUP = {
  "Maurten Gel 100":           25,
  "Koda Energy Gel":           30,
  "SIS Beta Fuel Gel":         40,
  "Energy Chews (Per Packet)": 32,
  "Tailwind 500ml Flask":      50,
};

/**
 * Default strategy — used as initial state in App.jsx.
 * fuelInventory is empty so the user builds their own vest load.
 */
export const DEFAULT_STRATEGY = {
  targetHours: 6.0,
  conditions: "clear", // "clear" | "storm"
  fuelInventory: [],
};

/** Skeleton for a new leg card in the UI */
export const DEFAULT_LEG = {
  name: "",
  km: 0,
  gainM: 0,
  stock: "",
};
