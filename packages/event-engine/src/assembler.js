// ─────────────────────────────────────────────────────────────
//  EVENT ENGINE — assembler.js
//  generatePlan(profile, event?, feedbackMap?) → Week[]
//
//  Orchestrates core physiology + event scheduler + sessions into
//  a full Daniels/Pfitzinger event plan. Entry point for consumers.
//  Pure function — same inputs → same outputs (given same date).
// ─────────────────────────────────────────────────────────────
import {
  derivePaces, goalMult, longRunCap,
  dateFromAnchor, weeksBetween, computeFeedbackAdj, todaySydney,
  DAYS,
} from "@bronies/engine-core";
import { WORKOUT_SUBTYPES, DEFAULT_DAY_PLAN } from "./constants.js";
import {
  getPhase, peakLongRunWeeks, computeDownWeeks, computeLongKm,
} from "./scheduler.js";
import {
  makeW, normaliseSlot, primarySlot, hasStrength, isWorkoutSlot,
} from "./sessions.js";

// ── Phase-aware workout selector ──────────────────────────────

/**
 * SPEED / VO2max sessions — short-to-medium reps, building through phases.
 * targetMins controls session size: 45 = default, 60–75 = more reps, 90 = max volume.
 */
function pickSpeedWorkout(W, wn, phase, targetMins) {
  const m = targetMins || 45;
  const big = m >= 75, medium = m >= 60;
  let pool;

  if (phase === "BASE") {
    pool = big ? [
      () => W.reps400(10, 75), () => W.reps800(6, 90),
      () => W.reps400(12, 75), () => W.fartlek(45),
    ] : medium ? [
      () => W.reps400(8, 90), () => W.reps800(5, 90),
      () => W.reps400(10, 75), () => W.fartlek(40),
    ] : [
      () => W.reps400(6, 90), () => W.reps800(4, 90),
      () => W.reps400(8, 75), () => W.fartlek(32),
    ];
  } else if (phase === "PEAK") {
    pool = big ? [
      () => W.intervals(8, 90), () => W.reps1200(5, 90),
      () => W.combo2k1k1k(), () => W.reps2k(3, 120),
      () => W.combo2x2k(), () => W.ladder([4, 3, 2, 1, 2, 3, 4, 4]),
    ] : medium ? [
      () => W.intervals(7, 90), () => W.reps1200(4, 90),
      () => W.combo2k1k1k(), () => W.reps2k(2, 120),
      () => W.combo2x2k(), () => W.ladder([4, 3, 2, 1, 2, 3, 4]),
    ] : [
      () => W.intervals(5, 90), () => W.reps1200(3, 90),
      () => W.reps2k(2, 120), () => W.intervals(6, 90),
      () => W.reps800(6, 90), () => W.combo800s400s(),
    ];
  } else { // BUILD
    pool = big ? [
      () => W.intervals(7, 90), () => W.reps800(8, 90),
      () => W.reps1200(5, 90), () => W.combo800s400s(),
      () => W.ladder([3, 2, 1, 2, 3, 4]), () => W.combo1200s400s(),
    ] : medium ? [
      () => W.intervals(6, 90), () => W.reps800(7, 90),
      () => W.reps1200(4, 90), () => W.combo800s400s(),
      () => W.ladder([3, 2, 1, 2, 3]), () => W.combo1200s400s(),
    ] : [
      () => W.intervals(5, 90), () => W.reps800(6, 90),
      () => W.reps1200(3, 90), () => W.combo800s400s(),
      () => W.ladder([3, 2, 1, 2, 3]), () => W.combo1200s400s(),
    ];
  }
  return pool[(wn - 1) % pool.length]();
}

/**
 * THRESHOLD / TEMPO sessions — sustained "comfortably hard" work, building in duration.
 */
function pickThresholdWorkout(W, wn, phase, targetMins) {
  const m = targetMins || 45;
  const tempoMins = Math.max(12, m - 20);
  let pool;

  if (phase === "BASE") {
    pool = [
      () => W.tempo(Math.min(tempoMins, 18)), () => W.progression(m - 10),
      () => W.onOff(Math.min(12, 8 + (m - 45) / 5), 60, 60), () => W.tempo(Math.min(tempoMins, 20)),
    ];
  } else if (phase === "PEAK") {
    pool = [
      () => W.tempo(tempoMins), () => W.overUnder(Math.min(6, 5 + (m - 45) / 15)),
      () => W.progression(m - 5), () => W.tempoStrides(tempoMins),
      () => W.tempo(Math.min(tempoMins + 2, 45)),
    ];
  } else { // BUILD
    pool = [
      () => W.tempo(Math.min(tempoMins, 35)), () => W.overUnder(Math.min(5, 4 + (m - 45) / 15)),
      () => W.progression(m - 10), () => W.tempoStrides(Math.min(tempoMins, 30)),
      () => W.tempo(24),
    ];
  }
  return pool[(wn - 1) % pool.length]();
}

/** Taper workouts — short, sharp, phase-appropriate. */
function pickTaperWorkout(W, wn, slotIdx) {
  if (slotIdx >= 1) return W.tempo(15);
  const pool = [() => W.reps400(6, 90), () => W.reps800(4, 90), () => W.fartlek(25)];
  return pool[wn % pool.length]();
}

/**
 * Interval-only selector — used when a slot is pinned to "intervals"
 * (e.g. Bronies Wednesday / Friday default).
 */
function pickIntervalByPhase(W, wn, slotIdx, phase, targetMins) {
  const m = targetMins || 45;
  const big = m >= 75, medium = m >= 60;

  if (phase === "BASE") {
    return (wn + slotIdx) % 2 === 0
      ? W.reps400(big ? 10 : medium ? 8 : 6, 90)
      : W.reps800(big ? 6 : medium ? 5 : 4, 90);
  }
  if (phase === "PEAK") {
    const opts = big
      ? [() => W.reps1200(5, 90), () => W.intervals(8, 90), () => W.combo2k1k1k(), () => W.reps2k(3, 120)]
      : medium
        ? [() => W.reps1200(4, 90), () => W.intervals(7, 90), () => W.combo2k1k1k(), () => W.reps2k(2, 120)]
        : [() => W.reps1200(3, 90), () => W.intervals(5, 90), () => W.combo2k1k1k(), () => W.reps2k(2, 120)];
    return opts[(wn + slotIdx) % opts.length]();
  }
  // BUILD
  const opts = big
    ? [() => W.intervals(6, 90), () => W.reps800(7, 90), () => W.reps1200(5, 90), () => W.combo800s400s()]
    : medium
      ? [() => W.intervals(5, 90), () => W.reps800(6, 90), () => W.reps1200(4, 90), () => W.combo800s400s()]
      : [() => W.intervals(4, 90), () => W.reps800(5, 90), () => W.reps1200(3, 90), () => W.combo800s400s()];
  return opts[(wn + slotIdx) % opts.length]();
}

/**
 * Full workout picker — used by buildSlot for "workout" slots.
 * Implements the two-quality-session model (Daniels/Pfitzinger):
 *   slot 0 = SPEED/VO2max, slot 1 = THRESHOLD/tempo
 *
 * Hills fortnightly for runners with hill access / trail events.
 * Wed/Fri defaults to intervals (coffee-compatible).
 */
function pickWorkout(W, wn, dayId, slotIdx, isTrail, hillAccess, isDown, forcedSubtype, phase, targetMins) {
  const hasHills = hillAccess === "lots of hills" || hillAccess === "some hills";
  const mins = targetMins || 45;

  // Wed/Fri default to intervals unless user overrode
  const isBroniesDay = dayId === "wed" || dayId === "fri";
  if (isBroniesDay && !forcedSubtype) forcedSubtype = "intervals";

  if (forcedSubtype === "hills") {
    return hasHills
      ? (wn % 2 === 0
          ? W.hillRepeats(Math.min(8, 4 + Math.floor(wn / 4)))
          : W.hillSprints(Math.min(10, 6 + Math.floor(wn / 4))))
      : W.fartlek(Math.min(45, mins));
  }
  if (forcedSubtype === "fartlek")   return W.fartlek(Math.min(mins, 28 + Math.floor(wn / 3) * 3));
  if (forcedSubtype === "intervals") return pickIntervalByPhase(W, wn, slotIdx, phase || "BUILD", mins);
  if (forcedSubtype === "tempo")     return W.tempo(Math.min(mins - 20, 15 + Math.floor(wn / 3) * 3));

  if (isDown) {
    const downPool = [
      () => W.fartlek(28), () => W.reps400(6, 90), () => W.tempo(15),
      () => W.onOff(6, 60, 90), () => W.progression(32), () => W.reps800(4, 90), () => W.comboAscending(),
    ];
    return downPool[(wn + slotIdx * 3) % downPool.length]();
  }

  const ph = phase || "BUILD";

  // Hills fortnightly (speed slot, even weeks) for trail/hilly plans
  const useHills = (hasHills || isTrail) && slotIdx === 0 && wn % 2 === 0;
  if (useHills) {
    return wn % 4 === 0
      ? W.hillRepeats(Math.min(8, 4 + Math.floor(wn / 4)))
      : W.hillSprints(Math.min(10, 6 + Math.floor(wn / 4)));
  }

  // Two-quality-session model: slot 0 = speed, slot 1+ = threshold
  if (slotIdx >= 1) return pickThresholdWorkout(W, wn, ph, mins);
  return pickSpeedWorkout(W, wn, ph, mins);
}

// ── Single-day slot builder ───────────────────────────────────

/**
 * Build one day's session from its slot configuration.
 *
 * @param {string[]} slots     - normalised slot array e.g. ["workout","strength"]
 * @param {object}   W         - workout library from makeW()
 * @param {object}   ctx       - week context (wn, dayId, slotIdx, isDown, …)
 * @returns {object}  session object
 */
export function buildSlot(slots, W, ctx) {
  const slotArr     = normaliseSlot(slots);
  const primary     = primarySlot(slotArr);
  const addStrength = hasStrength(slotArr) && primary !== "rest" && primary !== "strength";

  const {
    wn, dayId, slotIdx, isDown, isTaper, taperWkIdx, isPeakLong,
    isTrail, paces, profile, event, longKm, phase, forcedSubtype,
  } = ctx;
  const isBroniesDay = dayId === "wed" || dayId === "fri";

  let session;

  if (primary === "rest") return W.rest();

  if (primary === "bronies") {
    session = W.bronieRun();

  } else if (primary === "strength") {
    return {
      wtype: "rest", label: "Strength Training 🏋", distance: 0, estMins: 0,
      summary: "Chat to the Bronies about what you SHOULD be doing",
      detail: "Strength & conditioning day.\n\nChat to the Bronies about what you SHOULD be doing — they'll have opinions.\n\nFocus on single-leg stability, hip strength, and core work to keep you injury-free.",
      garmin: ["No running today — strength session.", "Ask a Bronie what to do."],
    };

  } else if (primary === "easy") {
    if (isTaper && taperWkIdx >= 2) {
      session = { ...W.easyRun(30, true), label: "Easy + Strides", summary: "30min easy + 4 strides — wake the legs" };
    } else {
      // Add strides to Tue/Thu easy runs in BUILD and PEAK (Daniels/Pfitzinger standard)
      const STRIDE_DAYS = ["tue", "thu"];
      const withStrides = !isDown
        && (phase === "BUILD" || phase === "PEAK")
        && STRIDE_DAYS.includes(dayId);
      session = W.easyRun(isDown ? 35 : 40, withStrides);
    }

  } else if (primary === "long") {
    if (isPeakLong && !isTrail && event?.goalTime) {
      session = W.longPaceBlocks(longKm, paces.ep, paces.mp);
    } else {
      session = W.longEasy(longKm, isTrail, paces.ep);
    }

  } else if (isWorkoutSlot(primary)) {
    if (isTaper && taperWkIdx === 1) {
      session = { ...W.tempo(15), label: "Taper Maintenance Tempo", summary: "WU 2km · 15min tempo · CD 2km — stay sharp" };
    } else if (isTaper && taperWkIdx >= 2) {
      session = { ...W.easyRun(30, true), label: "Easy + 3 Fast Strides", summary: "30min easy + 3×1min fast — final tune-up" };
    } else {
      const targetMins = profile?.workoutMinutes?.[dayId] || 45;
      session = pickWorkout(
        W, wn, dayId, slotIdx, isTrail,
        profile?.hillAccess || "some hills", isDown,
        forcedSubtype || (WORKOUT_SUBTYPES.includes(primary) ? primary : null),
        phase, targetMins,
      );
    }

  } else {
    session = W.rest();
  }

  // Append strength note when combined with a run
  if (addStrength) {
    session = {
      ...session,
      label: session.label + " + Strength 🏋",
      detail: (session.detail || "")
        + "\n\n──────────────────\n🏋 Strength Training (after your run)\nChat to the Bronies about what you SHOULD be doing — hip strength, single-leg stability, core.",
    };
  }

  // Social day bookend note (non-Bronies session on a Bronies day)
  if (isBroniesDay && session && session.wtype !== "rest" && primary !== "bronies") {
    session = {
      ...session,
      label: "☕ " + session.label,
      detail: (session.detail || "")
        + "\n\n──────────────────\n☕ BRONIES social day\nMeet the crew at the usual spot, warm up together, then run your session. Regroup at the end for coffee. The work gets done — the .99 chaos stays intact.",
    };
  }

  return session;
}

// ── Event-based plan builder ──────────────────────────────────

function buildEventPlan(profile, event, dayPlan, fb) {
  const planAnchor  = profile.planStartDate || todaySydney();
  const totalSpan   = Math.min(24, weeksBetween(planAnchor, event.date));
  const trainingWks = Math.max(1, totalSpan);
  const total       = trainingWks + 1;
  const isTrail     = event.type === "trail";
  const distNum     = parseFloat(event.distance) || 42;
  const gm          = goalMult(profile.trainingGoal || "goal_event");
  const paces       = derivePaces({ ...profile, eventDistanceNum: distNum, goalTime: event.goalTime });
  const W           = makeW(paces);
  const maxLong     = longRunCap(isTrail, distNum, paces.ep);
  const peakWeeks   = peakLongRunWeeks(distNum, trainingWks);

  const { downWeeks, interPeakDownWeeks, postPeakDownWeeks } =
    computeDownWeeks(peakWeeks, trainingWks, total);

  const weeks = Array.from({ length: total }, (_, i) => {
    const wn      = i + 1;
    const phase   = getPhase(wn, total);
    const isTaper = phase === "TAPER";
    const isRaceWk = phase === "RACE";
    const pct     = wn / trainingWks;
    const startDate = dateFromAnchor(planAnchor, i);
    const taperWkIdx = isTaper ? wn - (trainingWks - 2) : 0;

    const fbAdj = computeFeedbackAdj(fb, wn);

    const isPeakLong      = peakWeeks.includes(wn);
    const isInterPeakDown = interPeakDownWeeks.has(wn);
    const isPostPeakDown  = postPeakDownWeeks.has(wn);
    const isDown          = downWeeks.has(wn);

    // ── Race week ────────────────────────────────────────────
    if (isRaceWk) {
      const sessions = {};
      DAYS.forEach(d => { sessions[d.id] = W.rest(); });
      sessions.mon = { ...W.easyRun(30), label: "Race Week Opener", summary: "30min easy + 4 strides — remind legs how to move" };
      sessions.wed = { ...W.easyRun(25), label: "Shakeout + Strides", summary: "25min easy + 3×1min fast — 3 days out" };
      sessions.sat = W.raceDay(event.name, event.distance);
      return {
        weekNum: wn, phase, startDate, isDown: false, isRaceWeek: true, isPeakLong: false,
        weekLabel: "Race Week",
        sessions,
        totalKm: Math.round(sessions.mon.distance + sessions.wed.distance + (parseFloat(event.distance) || 0)),
        longRunMins: 0,
        note: "🏁 Race week — protect your legs Mon–Fri. Everything you need is already in the tank.",
      };
    }

    // ── Long run distance ────────────────────────────────────
    const longKm = computeLongKm({
      wn, pct, phase, isPeakLong, isDown, isInterPeakDown, isPostPeakDown,
      isTaper, taperWkIdx, maxLong, distNum, gm, fbAdj, peakWeeks,
    });

    // ── Build each day ───────────────────────────────────────
    const sessions = {};
    let workoutSlotIdx = 0;
    DAYS.forEach(d => {
      const slot = normaliseSlot(dayPlan[d.id]);
      sessions[d.id] = buildSlot(slot, W, {
        wn, dayId: d.id,
        slotIdx: primarySlot(slot) === "workout" ? workoutSlotIdx : 0,
        isDown, isTaper, taperWkIdx, isPeakLong, isTrail, paces,
        profile, event, longKm, phase,
      });
      if (primarySlot(slot) === "workout") workoutSlotIdx++;
    });

    const totalKm = Math.round(DAYS.reduce((sum, d) => sum + (sessions[d.id]?.distance || 0), 0));

    const weekLabel = isPeakLong     ? "Peak Long Run"
      : isPostPeakDown               ? "Recovery Week"
      : isInterPeakDown              ? "Down Week"
      : isDown                       ? "Down Week"
      : isTaper                      ? "Taper"
      : "Build";

    const note = isPostPeakDown
      ? "⬇ Recovery week — you just did a peak long run. Shorter long run, protect the legs before the next big effort."
      : isInterPeakDown
      ? "⬇ Down week — shorter long run between peaks. Let the big efforts absorb."
      : isDown
      ? "⬇ Down week — protect the gains."
      : isTaper && taperWkIdx === 1
      ? "📉 Taper begins — volume drops but intensity stays."
      : isTaper && taperWkIdx >= 2
      ? "📉 Final taper — legs should feel restless. That's the point."
      : isPeakLong
      ? "⭐ Peak long run — confidence-builder. Time on feet, conversational pace."
      : "";

    const longSession = Object.values(sessions).find(s => s?.wtype === "long");
    return {
      weekNum: wn, phase, startDate, isDown, isPeakLong, isPostPeakDown, weekLabel,
      sessions, totalKm, note,
      longRunMins: longSession?.estMins || 0,
    };
  });

  // 10% rule check
  const checked = [];
  for (let i = 0; i < weeks.length; i++) {
    const week = weeks[i];
    let volumeWarning = null;
    if (!week.isDown && week.phase !== "TAPER" && week.phase !== "RACE" && i > 0) {
      let prevKm = null;
      for (let j = i - 1; j >= 0; j--) {
        if (!weeks[j].isDown && weeks[j].phase !== "TAPER" && weeks[j].phase !== "RACE") {
          prevKm = weeks[j].totalKm;
          break;
        }
      }
      if (prevKm && prevKm > 0) {
        const pctIncrease = (week.totalKm - prevKm) / prevKm;
        if (pctIncrease > 0.10) {
          volumeWarning = { pct: Math.round(pctIncrease * 100), prevKm, thisKm: week.totalKm };
        }
      }
    }
    checked.push({ ...week, volumeWarning });
  }
  return checked;
}

// ── Ongoing / hangout plan (no event) ─────────────────────────
// Simple rolling 8-week plan for the "Coffee With the Boys" crowd —
// no periodisation, just the chosen weekly slots on repeat.

function buildOngoingPlan(profile, dayPlan, fb) {
  const WEEKS = 8;
  const planAnchor = profile.planStartDate || todaySydney();
  const paces = derivePaces(profile);
  const W     = makeW(paces);

  return Array.from({ length: WEEKS }, (_, i) => {
    const wn        = i + 1;
    const startDate = dateFromAnchor(planAnchor, i);

    const sessions = {};
    let workoutSlotIdx = 0;
    DAYS.forEach(d => {
      const slot = normaliseSlot(dayPlan[d.id]);
      sessions[d.id] = buildSlot(slot, W, {
        wn, dayId: d.id,
        slotIdx: primarySlot(slot) === "workout" ? workoutSlotIdx : 0,
        isDown: false, isTaper: false, taperWkIdx: 0, isPeakLong: false,
        isTrail: false, paces, profile, event: null, longKm: 10, phase: "BUILD",
      });
      if (primarySlot(slot) === "workout") workoutSlotIdx++;
    });

    const totalKm = Math.round(DAYS.reduce((sum, d) => sum + (sessions[d.id]?.distance || 0), 0));
    return {
      weekNum: wn, phase: "BASE", startDate,
      isDown: false, isPeakLong: false, isOngoing: true,
      weekLabel: "Build",
      sessions, totalKm,
      longRunMins: Object.values(sessions).find(s => s?.wtype === "long")?.estMins || 0,
      note: "",
      volumeWarning: null,
    };
  });
}

// ── Public API ────────────────────────────────────────────────

/**
 * Generate a full training plan.
 *
 * @param {object}       profile     - runner profile (refDistance, refTime, dayPlan, planStartDate, …)
 * @param {object|null}  event       - race event (date, distance, type, goalTime, …) or null
 * @param {object}       feedbackMap - { [weekNum]: "too_hard"|"too_easy"|"ok" }
 * @returns {Week[]}  array of week objects, each containing:
 *   { weekNum, phase, startDate, isDown, isPeakLong, weekLabel, sessions, totalKm, note, longRunMins, volumeWarning? }
 */
export function generatePlan(profile, event = null, feedbackMap = {}) {
  if (!profile) return [];
  const dayPlan = profile.dayPlan || DEFAULT_DAY_PLAN;
  const hasEvent = !!(event && event.date);
  if (!hasEvent) return buildOngoingPlan(profile, dayPlan, feedbackMap);
  return buildEventPlan(profile, event, dayPlan, feedbackMap);
}
