// ─────────────────────────────────────────────────────────────
//  BEGINNER ENGINE — constants.js
//  Configuration specific to Couch-to-Distance beginner plans.
//  Shared data (days, race distances) comes from @bronies/engine-core.
// ─────────────────────────────────────────────────────────────

// "How far can you run now?" bucket → starting km
export const CURRENT_KM_MAP = {
  "0-1": 0.5,
  "1-3": 2,
  "3-5": 4,
  "5-8": 6,
  "8+":  8,
};

// Target-distance preset → km (free-form number overrides these)
export const TARGET_KM_MAP = {
  parkrun:   5,
  brownie:   7.99,
  "10k":     10,
  city2surf: 14,
  half:      21,
};

// Timeline preset → weeks
export const TIMELINE_MAP = {
  "8w":  8,
  "12w": 12,
  "16w": 16,
  open:  16,
};

// Session-distance ratios by weekly run frequency.
// The last ratio (1.0) is the week's "peak" session; earlier days are shorter.
export const SESSION_RATIOS = {
  2: [0.85, 1.0],
  3: [0.7, 0.85, 1.0],
  4: [0.6, 0.8, 0.9, 1.0],
  5: [0.55, 0.7, 0.8, 0.9, 1.0],
};

// Beginner pace clamps (seconds/km). Never faster than 5:30, never slower than 9:00.
export const BEGINNER_PACE = {
  min: 330,  // 5:30/km
  max: 540,  // 9:00/km
};

// Fraction of plan spent in walk/run before switching to continuous running.
export const WALK_RUN_FRACTION = 0.4;

// Walk/run interval structure (run:walk minutes) by progress fraction.
export const WALK_RUN_INTERVALS = {
  early: { runMin: 1, walkMin: 2, threshold: 0.2 }, // pct < 0.2
  late:  { runMin: 2, walkMin: 1 },                 // 0.2 ≤ pct < 0.4
};
