// ─────────────────────────────────────────────────────────────
//  BEGINNER ENGINE — assembler.js
//  generateBeginnerPlan(profile, feedbackMap?) → Week[]
//
//  Couch-to-Distance progression: linear ramp from current ability
//  to goal distance, walk/run early → continuous later, recovery
//  every 3rd week, goal-distance runs in the final two weeks.
//  Pure function — same inputs → same outputs (given same date).
// ─────────────────────────────────────────────────────────────
import {
  derivePaces, dateFromAnchor, todaySydney, DAYS,
} from "@bronies/engine-core";
import { SESSION_RATIOS, BEGINNER_PACE } from "./constants.js";
import {
  parseCurrentKm, parseTargetKm, parseTimeline,
  buildBeginnerSession, restSession,
} from "./sessions.js";

// Local slot helpers (beginner plans only distinguish "rest" vs "run day")
function isRunDay(slotValue) {
  if (!slotValue) return false;
  const v = Array.isArray(slotValue) ? slotValue[0] : slotValue;
  return v && v !== "rest";
}

/**
 * Generate a Couch-to-Distance beginner plan.
 *
 * @param {object} profile - {
 *     currentLongest, targetDistance, targetDistanceKm, timeline,
 *     healthyFreq, dayPlan, planStartDate, refDistance?, refTime?
 *   }
 * @param {object} [feedbackMap] - reserved for future load adjustment
 * @returns {Week[]} array of week objects
 */
export function generateBeginnerPlan(profile, feedbackMap = {}) {
  if (!profile) return [];

  const dayPlan    = profile.dayPlan || {};
  const planAnchor = profile.planStartDate || todaySydney();
  const startKm    = parseCurrentKm(profile.currentLongest);
  const goalKm     = parseTargetKm(profile.targetDistance, profile.targetDistanceKm);
  const weeks      = parseTimeline(profile.timeline);
  const freq       = profile.healthyFreq || 3;

  // Gentle, beginner-clamped easy pace.
  const ep = (() => {
    const paces = derivePaces(profile);
    return Math.max(BEGINNER_PACE.min, Math.min(BEGINNER_PACE.max, paces.ep));
  })();

  const sessionRatios = SESSION_RATIOS[freq] || SESSION_RATIOS[3];

  return Array.from({ length: weeks }, (_, i) => {
    const wn  = i + 1;
    const pct = wn / weeks;

    // Linear ramp from startKm to goalKm; goal reached in the last two weeks.
    const rampProgress = Math.min(1, (wn - 1) / Math.max(1, weeks - 2));
    let peakSessionKm  = startKm + rampProgress * (goalKm - startKm);

    // Recovery week every 3rd week (except the final couple) → pull back to 80%.
    const isDown = wn % 3 === 0 && wn < weeks - 1;
    if (isDown) peakSessionKm = Math.max(startKm, peakSessionKm * 0.8);

    peakSessionKm = Math.min(goalKm, peakSessionKm);
    peakSessionKm = Math.round(peakSessionKm * 10) / 10;

    // Active run days come from the user's selected non-rest days, capped to freq.
    const runDays = DAYS.filter(d => isRunDay(dayPlan[d.id]));
    const activeDays = runDays.slice(0, freq);

    const sessions = {};
    DAYS.forEach(d => { sessions[d.id] = restSession(); });

    activeDays.forEach((d, idx) => {
      const ratio  = sessionRatios[idx] ?? 1.0;
      const sessKm = Math.max(0.5, Math.round(peakSessionKm * ratio * 10) / 10);
      sessions[d.id] = buildBeginnerSession(sessKm, pct, ep, wn === 1 && idx === 0);
    });

    const totalKm = Math.round(
      DAYS.reduce((sum, d) => sum + (sessions[d.id]?.distance || 0), 0) * 10
    ) / 10;

    const isGoalWeek = wn >= weeks - 1;
    const note = wn === 1
      ? "🌱 Week 1 — start where you are. Walk any time you need to. Finishing is the whole goal."
      : isDown
      ? "⬇ Easy week — lighter load, let your body absorb the training. Don't skip it."
      : isGoalWeek
      ? `🎯 Goal week — you're running ${goalKm}km. This is what all those weeks were for.`
      : pct > 0.6
      ? "💪 The runs are getting longer. You've already done the hard part — keep going."
      : "";

    return {
      weekNum: wn,
      phase: "BASE",
      startDate: dateFromAnchor(planAnchor, i),
      isDown,
      isPeakLong: isGoalWeek,
      weekLabel: isDown ? "Easy Week" : isGoalWeek ? "Goal Week" : "Build",
      sessions,
      totalKm,
      longRunMins: 0,
      note,
      volumeWarning: null,
    };
  });
}
