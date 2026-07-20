// ─────────────────────────────────────────────────────────────
//  BEGINNER ENGINE — index.js
//  Couch-to-Distance beginner training plans.
//  generateBeginnerPlan(profile, feedbackMap?) → Week[]
// ─────────────────────────────────────────────────────────────

// Main entry point
export { generateBeginnerPlan } from "./assembler.js";

// Input parsing + session builders (exposed for inspection / testing / UI)
export {
  parseCurrentKm,
  parseTargetKm,
  parseTimeline,
  buildBeginnerSession,
  restSession,
} from "./sessions.js";

// Beginner-specific constants
export {
  CURRENT_KM_MAP,
  TARGET_KM_MAP,
  TIMELINE_MAP,
  SESSION_RATIOS,
  BEGINNER_PACE,
  WALK_RUN_FRACTION,
  WALK_RUN_INTERVALS,
  SINGLE_SESSION_CAP_RATIO,
  FREQUENCY_STEP_WEEKS,
  NEW_DAY_RATIO,
  BEGINNER_HANDOFF_KM,
} from "./constants.js";
