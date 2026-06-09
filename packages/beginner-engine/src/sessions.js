// ─────────────────────────────────────────────────────────────
//  BEGINNER ENGINE — sessions.js
//  Couch-to-Distance session builders: walk/run intervals early,
//  continuous easy running later. Confidence-first language.
//  Pure functions — same inputs → same outputs.
// ─────────────────────────────────────────────────────────────
import { fmtDuration } from "@bronies/engine-core";
import {
  CURRENT_KM_MAP, TARGET_KM_MAP, TIMELINE_MAP,
  WALK_RUN_FRACTION, WALK_RUN_INTERVALS,
} from "./constants.js";

// ── Input parsing ─────────────────────────────────────────────

/** Map the "how far now" bucket to a usable starting km. */
export function parseCurrentKm(currentLongest) {
  return CURRENT_KM_MAP[currentLongest] || 1;
}

/** Map targetDistance field to km. A free-form number overrides the preset. */
export function parseTargetKm(targetDistance, targetDistanceKm) {
  const manual = parseFloat(targetDistanceKm);
  if (!isNaN(manual) && manual > 0) return manual;
  return TARGET_KM_MAP[targetDistance] || 5;
}

/** Map timeline preset to weeks. */
export function parseTimeline(timeline) {
  return TIMELINE_MAP[timeline] || 12;
}

// ── Session builders ──────────────────────────────────────────

/**
 * Build a single beginner session.
 *
 * @param {number}  runKm   - target distance for this session (km)
 * @param {number}  pct     - progress through the plan (0→1)
 * @param {number}  ep      - easy pace (seconds/km, beginner-clamped)
 * @param {boolean} isFirst - is this the very first session of the plan?
 * @returns {object} session object
 *
 * Early in the plan (pct < WALK_RUN_FRACTION) sessions are walk/run intervals;
 * later they become continuous easy runs.
 */
export function buildBeginnerSession(runKm, pct, ep, isFirst) {
  const isWalkRun = pct < WALK_RUN_FRACTION;
  const d = Math.round(runKm * 10) / 10;

  if (isWalkRun) {
    const early = pct < WALK_RUN_INTERVALS.early.threshold;
    const runMin  = early ? WALK_RUN_INTERVALS.early.runMin  : WALK_RUN_INTERVALS.late.runMin;
    const walkMin = early ? WALK_RUN_INTERVALS.early.walkMin : WALK_RUN_INTERVALS.late.walkMin;
    // approximate total time including walk overhead (~1.4× the running-only estimate)
    const totalMin = Math.round((d / (ep / 60 / 1000)) / 60 * 1.4);

    return {
      wtype: "easy",
      label: `${d}km Walk/Run`,
      distance: d,
      estMins: Math.round(totalMin),
      summary: `${runMin}min run / ${walkMin}min walk — repeat for ~${d}km · walk any time you need`,
      detail:
        `Warm up: 5min easy walk.\n\n` +
        `Main set: alternate ${runMin}min running and ${walkMin}min walking for ~${d}km.\n` +
        `Don't worry about pace — if you can say short sentences while running, you're going the right speed.\n\n` +
        `Walk whenever you need to. That's not quitting — it's how this works.\n\n` +
        `Cool down: 5min easy walk.\n\n` +
        `✓ Did it? Tick it off. That's a win.`,
      garmin: [
        `WARM UP — Time: 5:00 | Easy walk`,
        `REPEAT until ${d}km covered:`,
        `  RUN  — Time: ${runMin}:00 | Easy jog, conversational`,
        `  WALK — Time: ${walkMin}:00 | Recovery walk`,
        `COOL DOWN — Time: 5:00 | Easy walk`,
      ],
    };
  }

  // Continuous run
  const mins = Math.round((d * ep) / 60);
  return {
    wtype: "easy",
    label: `${d}km Easy Run`,
    distance: d,
    estMins: mins,
    summary: `${d}km easy · est. ${fmtDuration(mins)} · conversational pace`,
    detail:
      `${d}km easy run at a comfortable, conversational pace.\n\n` +
      `If you can't say short sentences, slow down. If it feels too easy, good — that's the point right now.\n\n` +
      (pct > 0.8
        ? `This is one of your goal-distance runs. You've earned it. Trust the training you've put in.\n\n`
        : `Walk for 30–60 seconds any time you need to — this isn't weakness, it's smart training.\n\n`) +
      `Finish line: ${d}km. Every metre counts.`,
    garmin: [
      `Distance: ${d}km | No pace target — run to feel`,
      `Auto Lap every 1km`,
      `Zone 1–2 only — if breathing is hard, slow down`,
    ],
  };
}

/** A plain rest-day session. */
export function restSession() {
  return {
    wtype: "rest", label: "Rest Day", distance: 0, estMins: 0,
    summary: "Complete rest",
    detail: "Full rest. Sleep, eat well, hydrate.",
    garmin: ["No workout today."],
  };
}
