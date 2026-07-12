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
 * type: "solid" = discrete food item carried in vest pocket (gel, bar, chew)
 *       "drink_mix" = powder/liquid added to a flask at aid-station fill-ups
 */
export const FUEL_LOOKUP = {
  "Gel":                  { carbs: 27, type: "solid" },
  "Energy Chew":          { carbs: 24, type: "solid" },
  "Energy / Muesli Bar":  { carbs: 25, type: "solid" },
  "Drink Mix":            { carbs: 50, type: "drink_mix" },
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

/**
 * Distance (km) after which caffeine becomes useful — the classic
 * "second wind" point where natural alertness starts to dip and a
 * moderate caffeine hit (75-100mg) measurably helps perceived effort.
 */
export const CAFFEINE_USEFUL_FROM_KM = 25;

/**
 * Time (minutes) after which pre-race caffeine (coffee, gels with caffeine
 * taken at breakfast) has likely worn off — caffeine has a half-life of
 * roughly 4-6 hours, but the initial alertness boost fades much sooner,
 * typically 60-90 minutes after the last dose. By 90 minutes into the race,
 * most runners are past that window regardless of how far they've covered.
 */
export const CAFFEINE_USEFUL_FROM_MINS = 90;

/**
 * Aid station item categories — used to match free-text stock strings
 * (e.g. "Water, Coca-cola, Trail Brew, Lollies, Chips, Bananas")
 * against what a runner might grab instead of digging into their vest.
 *
 * Each category maps keyword fragments (lowercase) to display info.
 * estCarbsG is a rough per-handful/serve estimate for planning purposes.
 */
export const AID_STATION_ITEMS = {
  coke: {
    keywords: ["coca-cola", "coca cola", "coke", "cola"],
    label: "Coca-Cola",
    estCarbsG: 20,       // ~half a small cup
    caffeineMg: 20,      // ~250ml serve
    tags: ["carbs", "caffeine"],
  },
  trail_brew: {
    keywords: ["trail brew"],
    label: "Trail Brew",
    estCarbsG: 25,
    caffeineMg: 50,      // typically caffeinated endurance mix
    tags: ["carbs", "caffeine", "electrolytes"],
  },
  energy_drink: {
    keywords: ["energy drink", "red bull", "v energy"],
    label: "Energy drink",
    estCarbsG: 27,
    caffeineMg: 80,
    tags: ["carbs", "caffeine"],
  },
  coffee: {
    keywords: ["coffee", "instant coffee"],
    label: "Coffee",
    estCarbsG: 0,
    caffeineMg: 60,
    tags: ["caffeine"],
  },
  lollies: {
    keywords: ["lollies", "lolly", "sweets", "candy", "jelly beans"],
    label: "Lollies",
    estCarbsG: 15,       // a small handful
    caffeineMg: 0,
    tags: ["carbs", "quick sugar"],
  },
  chips: {
    keywords: ["chips", "crisps", "pretzels"],
    label: "Chips",
    estCarbsG: 12,       // a handful
    caffeineMg: 0,
    tags: ["carbs", "salt"],
  },
  banana: {
    keywords: ["banana", "bananas"],
    label: "Banana",
    estCarbsG: 27,       // one medium banana
    caffeineMg: 0,
    tags: ["carbs", "potassium"],
  },
  watermelon: {
    keywords: ["watermelon"],
    label: "Watermelon",
    estCarbsG: 12,       // a couple of slices
    caffeineMg: 0,
    tags: ["carbs", "hydration"],
  },
  ginger_beer: {
    keywords: ["ginger beer"],
    label: "Ginger Beer",
    estCarbsG: 18,
    caffeineMg: 0,
    tags: ["carbs", "gut settling"],
  },
  water: {
    keywords: ["water"],
    label: "Water",
    estCarbsG: 0,
    caffeineMg: 0,
    tags: ["hydration"],
  },
};
