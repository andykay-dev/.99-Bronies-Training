// ─────────────────────────────────────────────────────────────
//  EVENT ENGINE — index.js
//  Daniels/Pfitzinger event-driven training plans.
//  generatePlan(profile, event?, feedbackMap?) → Week[]
// ─────────────────────────────────────────────────────────────

// Main entry point
export { generatePlan, buildSlot } from "./assembler.js";

// Event-specific scheduling (exposed for inspection / testing / UI)
export {
  getPhase,
  peakLongRunWeeks,
  computeDownWeeks,
  computeLongKm,
} from "./scheduler.js";

// Session helpers + workout library
export {
  normaliseSlot,
  primarySlot,
  hasStrength,
  isWorkoutSlot,
  parseEditableSession,
  regenerateFromReps,
  makeW,
} from "./sessions.js";

// Event-specific constants
export {
  PRIORITY,
  DEFAULT_DAY_PLAN,
  DEFAULT_WORKOUT_MINUTES,
  WORKOUT_SUBTYPES,
  PHASE_BOUNDARIES,
} from "./constants.js";
