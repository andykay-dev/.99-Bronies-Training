// ─────────────────────────────────────────────────────────────
//  ENGINE CORE — constants.js
//  Data shared across ALL Bronies training engines.
//  Engine-specific constants live in each engine's own package.
// ─────────────────────────────────────────────────────────────

// Training phases (used by the event engine; beginner engine uses BASE only)
export const PHASES = {
  BASE:  { label: "Base",  color: "#1a6b6b" },
  BUILD: { label: "Build", color: "#7a4f00" },
  PEAK:  { label: "Peak",  color: "#c0392b" },
  TAPER: { label: "Taper", color: "#5b2d8e" },
  RACE:  { label: "Race",  color: "#1a472a" },
};

// Reference race distances — used for pace derivation in every engine
export const RACE_DISTANCES = [
  { value: "5k",   label: "5km",                    km: 5    },
  { value: "10k",  label: "10km",                   km: 10   },
  { value: "15k",  label: "15km",                   km: 15   },
  { value: "half", label: "Half Marathon (21.1km)", km: 21.1 },
  { value: "mara", label: "Marathon (42.2km)",      km: 42.2 },
];

// Training goals — top-level routing between engines.
//   goal_event → event-engine
//   healthier  → beginner-engine
//   hangout    → event-engine (ongoing rolling plan)
export const TRAINING_GOALS = [
  { value: "goal_event", label: "Training for an Event",                 desc: "I have a race I'm preparing for",               mult: 1.00 },
  { value: "healthier",  label: "Get me back to being a Healthy Bronie", desc: "Building habits, getting fitter — no pressure", mult: 0.74 },
  { value: "hangout",    label: "Coffee With the Boys",                   desc: "Here for the vibes — no pressure",              mult: 0.55 },
];

// Day picker — Mon=0 … Sun=6. Monday-anchored throughout.
export const DAYS = [
  { id: "mon", label: "Monday",    short: "MON" },
  { id: "tue", label: "Tuesday",   short: "TUE" },
  { id: "wed", label: "Wednesday", short: "WED" },
  { id: "thu", label: "Thursday",  short: "THU" },
  { id: "fri", label: "Friday",    short: "FRI" },
  { id: "sat", label: "Saturday",  short: "SAT" },
  { id: "sun", label: "Sunday",    short: "SUN" },
];

// Slot type metadata — for UI rendering (label, icon, colour, description)
export const SLOT_TYPES = {
  workout:  { label: "Workout",           icon: "⚡", color: "#7a4f00", desc: "Intervals, tempo, hills, fartlek" },
  easy:     { label: "Easy Run",          icon: "🦶", color: "#1a56db", desc: "Conversational pace, recovery" },
  long:     { label: "Long Run",          icon: "🏔", color: "#5b2d8e", desc: "Time on feet — the cornerstone session" },
  bronies:  { label: "BRONIES",           icon: "☕", color: "#1a472a", desc: "The 7.99km Bronie social run — coffee after" },
  strength: { label: "Strength Training", icon: "🏋", color: "#8B0000", desc: "Chat to the Bronies about what you SHOULD be doing" },
  rest:     { label: "Rest",              icon: "💤", color: "#9a9a9a", desc: "Recovery — protect the gains" },
};

// Pace derivation multipliers (Daniels VDOT-based approximations).
// Shared so both engines derive identical zones from the same reference run.
export const PACE_MULTIPLIERS = {
  threshold:    0.87,  // tp   = ep × 0.87
  interval:     0.79,  // ip   = ep × 0.79
  warmupCD:     1.04,  // wucd = ep × 1.04
  marathon:     0.92,  // mp   = ep × 0.92 (overridden by goal time when present)
  longRunTrail: 1.18,  // trail long-run pace vs easy pace
  longRoadEasy: 1.06,  // road long-run pace vs easy pace
};
