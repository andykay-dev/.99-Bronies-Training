// ─────────────────────────────────────────────────────────────
//  EVENT ENGINE — constants.js
//  Configuration specific to event-driven (Daniels/Pfitzinger) plans.
//  Shared data (race distances, goals, days, slot types) comes from
//  @bronies/engine-core.
// ─────────────────────────────────────────────────────────────

// Race-priority tags (A/B/C/D race classification)
export const PRIORITY = {
  A: { label: "A Race",  cls: "tag-a" },
  B: { label: "B Race",  cls: "tag-b" },
  C: { label: "C Race",  cls: "tag-c" },
  D: { label: "Fun Run", cls: "tag-d" },
};

// Default weekly slot layout for an event plan.
export const DEFAULT_DAY_PLAN = {
  mon: "rest", tue: "rest", wed: "bronies", thu: "rest",
  fri: "bronies", sat: "long", sun: "rest",
};

// Default workout duration target per day (minutes).
export const DEFAULT_WORKOUT_MINUTES = {
  mon: 45, tue: 45, wed: 45, thu: 45, fri: 45, sat: 45, sun: 45,
};

// Workout subtypes — treated as "workout" for planning but force a session type.
export const WORKOUT_SUBTYPES = ["hills", "fartlek", "intervals", "tempo"];

// ── Single-session progression cap ─────────────────────────────
// Same evidence base as the beginner engine (Frandsen/Nielsen et al. 2025,
// Br J Sports Med, 5,205 runners): a single session exceeding ~10% of the
// runner's longest recent run was the strongest overuse-injury predictor —
// far stronger than week-to-week volume change. When the profile provides
// currentLongestKm, no prescribed long run may exceed the longest run so
// far × this ratio; the ramp builds from the runner's actual base instead
// of jumping to a race-distance-derived start.
export const SESSION_CAP_RATIO = 1.10;

// Phase boundaries (fraction of total training weeks).
//   ≤ base  → BASE
//   ≤ build → BUILD
//   > build → PEAK (then TAPER = final 2 wks, RACE = final week)
export const PHASE_BOUNDARIES = {
  base:  0.28,
  build: 0.62,
};
