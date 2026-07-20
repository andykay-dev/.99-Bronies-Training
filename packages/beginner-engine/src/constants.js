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
// Target preset → km. Goals above BEGINNER_HANDOFF_KM aren't rejected —
// they trigger the two-stage journey (base here, event engine after).
export const TARGET_KM_MAP = {
  parkrun:   5,
  brownie:   7.99,
  "10k":     10,
  city2surf: 14,
  half:      21,
};

// Handoff point: goals up to this distance are handled entirely by this
// engine; bigger goals become a two-stage journey — this engine builds the
// base to 10km, then the event engine (fitness-anchored) carries on to the
// real goal. Not a clamp: daunting goals are welcome, they just get staged.
export const BEGINNER_HANDOFF_KM = 10;

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

// ── Frequency & single-session progression ──────────────────────
// Grounded in:
//  - Frandsen/Nielsen et al. 2025, Br J Sports Med (5,205 runners, 87
//    countries, 588,071 Garmin-logged sessions): the strongest predictor of
//    overuse injury was a single session exceeding ~10% of the runner's
//    longest run in the trailing 30 days (10–30% over → 64% higher injury
//    rate); week-to-week volume change showed no significant relationship.
//    This is why the cap below is per-SESSION, not per-week.
//  - ACSM guidance: novice runners start at 2–3 days/week, building to 4–5
//    with experience.
//  - Standard coaching practice for adding a run day (Gaudette / Runner's
//    World): introduce a new day short and easy — about half a normal easy
//    day — hold it for a few weeks before building it up, rather than
//    adding full-size sessions on new days immediately.
export const SINGLE_SESSION_CAP_RATIO = 1.10; // a session may not exceed 110% of the longest run so far
export const FREQUENCY_STEP_WEEKS     = 3;    // wait this many weeks before adding another run day
export const NEW_DAY_RATIO            = 0.5;  // a newly-added day starts at ~50% of that week's peak session

// Fraction of plan spent in walk/run before switching to continuous running.
export const WALK_RUN_FRACTION = 0.4;

// Walk/run interval structure (run:walk minutes) by progress fraction.
export const WALK_RUN_INTERVALS = {
  early: { runMin: 1, walkMin: 2, threshold: 0.2 }, // pct < 0.2
  late:  { runMin: 2, walkMin: 1 },                 // 0.2 ≤ pct < 0.4
};
