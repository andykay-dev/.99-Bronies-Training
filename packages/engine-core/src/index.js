// ─────────────────────────────────────────────────────────────
//  ENGINE CORE — index.js
//  Shared foundation for all Bronies training engines.
//  No plan-building here — just the common physiology, calendar,
//  and constant data each engine builds on top of.
// ─────────────────────────────────────────────────────────────

// Physiology — pace zones, caps, formatting, .99 snapping
export {
  parseTime,
  fmtPace,
  fmtDuration,
  derivePaces,
  goalMult,
  longRunCap,
  peakLongRunWeeks,
  estimateLongRunTime,
  sessionMinutes,
  elevationGuide,
  bucketElevation,
  to99,
} from "./physiology.js";

// Scheduler — Monday-anchored calendar helpers + feedback loop
export {
  parseLocalDate,
  mondayOf,
  weeksBetween,
  dateFromAnchor,
  dateFromToday,
  toDateStr,
  todaySydney,
  fmtDate,
  weekStatus,
  dayDate,
  computeFeedbackAdj,
} from "./scheduler.js";

// Constants — shared data
export {
  PHASES,
  RACE_DISTANCES,
  TRAINING_GOALS,
  DAYS,
  SLOT_TYPES,
  PACE_MULTIPLIERS,
} from "./constants.js";

// Maintenance engine — rolling 12-week plan, no fixed event
export { generateMaintenancePlan } from "./maintenance.js";
