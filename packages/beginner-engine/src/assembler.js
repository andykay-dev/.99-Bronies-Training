// ─────────────────────────────────────────────────────────────
//  BEGINNER ENGINE — assembler.js
//  generateBeginnerPlan(profile, feedbackMap?) → Week[]
//
//  Couch-to-Distance progression, grounded in:
//   - Frandsen/Nielsen et al. 2025, Br J Sports Med (5,205 runners, 87
//     countries): the strongest predictor of overuse injury was a single
//     session exceeding ~10% of the runner's longest run in the trailing
//     30 days — NOT week-to-week volume change, which showed no
//     significant relationship in that study. So EVERY active day is
//     ramped by capping it against its own longest session so far, not
//     by a flat weekly-total percentage.
//   - ACSM guidance: novices start at 2–3 run days/week.
//   - Standard "add a day" coaching practice: a newly-added day starts
//     short (~half the established/"hero" day) and builds its own
//     history from there — it does not inherit the hero day's distance.
//
//  Walk/run early → continuous later, recovery every 3rd week,
//  goal-distance targeted in the final two weeks (but never at the cost
//  of breaching the single-session cap on any day — see below).
//  Pure function — same inputs → same outputs (given same date).
// ─────────────────────────────────────────────────────────────
import {
  derivePaces, dateFromAnchor, todaySydney, DAYS,
} from "@bronies/engine-core";
import {
  SESSION_RATIOS, BEGINNER_PACE,
  SINGLE_SESSION_CAP_RATIO, FREQUENCY_STEP_WEEKS, NEW_DAY_RATIO,
} from "./constants.js";
import {
  parseCurrentKm, parseTargetKm, parseTimeline,
  buildBeginnerSession, restSession, buildRaceDaySession,
} from "./sessions.js";

// Local slot helpers (beginner plans only distinguish "rest" vs "run day")
function isRunDay(slotValue) {
  if (!slotValue) return false;
  const v = Array.isArray(slotValue) ? slotValue[0] : slotValue;
  return v && v !== "rest";
}

// ── Weekly encouragement notes ──────────────────────────────────
// Every week gets a message — previously mid-plan weeks got nothing at all,
// and repeated week-types showed the identical string every time. Each
// category rotates through several lines; picking is deterministic
// (wn-seeded, not random) so the same plan always renders the same way.
const DOWN_WEEK_NOTES = [
  "⬇ Easy week — lighter load, let your body absorb the training. Don't skip it.",
  "⬇ Recovery week. This is where the fitness actually sticks — trust it.",
  "⬇ Pulling back on purpose this week. Adaptation happens in the rest, not just the running.",
];
const MID_PLAN_NOTES = [
  "👣 Just showing up counts. You're building something that lasts.",
  "🧠 If this still feels like work, good — that's exactly what training is.",
  "👟 Consistency beats intensity. You're doing this exactly right.",
  "🌤 No fireworks this week, just steady work. That's the job.",
];
const LATE_PLAN_NOTES = [
  "💪 The runs are getting longer. You've already done the hard part — keep going.",
  "🚀 Look how far you've come already — this used to feel impossible.",
  "🏃 Getting real now. Trust the legs you've built.",
];
const GOAL_WEEK_NOTES = [
  (goalKm) => `🎯 Goal week — you're running ${goalKm}km. This is what all those weeks were for.`,
  (goalKm) => `🎯 This is it. ${goalKm}km. Every session got you here.`,
];

function pickNote(wn, isDown, isGoalWeek, pct, goalKm, freqJustIncreased, fellShort, heroKm) {
  if (wn === 1) return "🌱 Week 1 — start where you are. Walk any time you need to. Finishing is the whole goal.";
  if (isGoalWeek) return GOAL_WEEK_NOTES[wn % GOAL_WEEK_NOTES.length](goalKm);
  if (fellShort)
    return `📍 You're at ${heroKm}km, not quite the original ${goalKm}km goal yet — the timeline asked for more than was safe to add. Keep going at this pace and you'll get there without breaking down.`;
  if (freqJustIncreased)
    return "➕ Added a new run day this week — kept it short on purpose. It'll grow on its own from here; don't rush it.";
  if (isDown)     return DOWN_WEEK_NOTES[wn % DOWN_WEEK_NOTES.length];
  if (pct > 0.6)  return LATE_PLAN_NOTES[wn % LATE_PLAN_NOTES.length];
  return MID_PLAN_NOTES[wn % MID_PLAN_NOTES.length];
}

/**
 * Generate a Couch-to-Distance beginner plan.
 *
 * @param {object} profile - {
 *     currentLongest, targetDistance, targetDistanceKm, timeline,
 *     currentDaysPerWeek, maxDaysPerWeek, dayPlan, planStartDate,
 *     refDistance?, refTime?
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

  // Race-anchored mode: if a real event date is given, the plan length comes
  // from the calendar — final week contains the race, race day gets the race
  // session, and the week before is a taper. Otherwise timeline preset.
  const raceDate = profile.raceDate ? new Date(profile.raceDate + "T00:00:00") : null;
  const anchorDate = new Date(
    (typeof planAnchor === "string" ? planAnchor : planAnchor.toISOString().slice(0, 10)) + "T00:00:00"
  );
  let weeks;
  let raceWeekNum = null;
  let raceDayId   = null;
  if (raceDate && !isNaN(raceDate) && raceDate > anchorDate) {
    const diffDays = Math.floor((raceDate - anchorDate) / 86400000);
    weeks = Math.max(2, Math.floor(diffDays / 7) + 1);
    raceWeekNum = weeks;
    raceDayId = DAYS[(raceDate.getDay() + 6) % 7].id; // JS Sunday=0 → our Monday-first index
  } else {
    weeks = parseTimeline(profile.timeline);
  }

  // How many days they're running NOW (default 1 — assume the least, safest
  // starting point if this wasn't asked) vs. the ceiling they could run.
  // `healthyFreq` is kept as a fallback for profiles saved before this field
  // existed.
  const startFreq = Math.max(1, Math.min(5, profile.currentDaysPerWeek || 1));
  const maxFreq   = Math.max(startFreq, Math.min(5, profile.maxDaysPerWeek || profile.healthyFreq || 3));

  const ep = (() => {
    const paces = derivePaces(profile);
    return Math.max(BEGINNER_PACE.min, Math.min(BEGINNER_PACE.max, paces.ep));
  })();

  const runDays = DAYS.filter(d => isRunDay(dayPlan[d.id])).map(d => d.id);

  // Days are unlocked one at a time as frequency ramps, in calendar order.
  // Each unlocked day tracks its OWN longest session so far — a newly-added
  // day starts short and grows independently; it never inherits the
  // established ("hero") day's distance.
  let unlockedOrder = runDays.slice(0, Math.min(startFreq, runDays.length));
  const longestByDay = {};
  unlockedOrder.forEach(id => { longestByDay[id] = startKm; });

  const result = [];
  let peakTrained = startKm; // longest single session actually prescribed — for race-day honesty

  for (let i = 0; i < weeks; i++) {
    const wn  = i + 1;
    const pct = wn / weeks;
    const isRaceWeek  = raceWeekNum !== null && wn === raceWeekNum;
    const isTaperWeek = raceWeekNum !== null && wn === raceWeekNum - 1;
    const isDown     = isTaperWeek || (wn % 3 === 0 && wn < weeks - 1);
    const isFinalStretch = wn >= weeks - 1; // positional only — used for gating, not messaging

    // Frequency ramp: hold for FREQUENCY_STEP_WEEKS before adding a day,
    // never during a down week or the closing stretch, never past maxFreq
    // or past the days the user actually made available.
    let freqJustIncreased = false;
    if (wn > 1 && !isDown && !isFinalStretch &&
        (wn - 1) % FREQUENCY_STEP_WEEKS === 0 &&
        unlockedOrder.length < maxFreq &&
        unlockedOrder.length < runDays.length) {
      const nextDay = runDays[unlockedOrder.length];
      unlockedOrder = [...unlockedOrder, nextDay];
      longestByDay[nextDay] = 0; // no history yet — sized explicitly below
      freqJustIncreased = true;
    }

    const heroDay = unlockedOrder[0];

    // ── Race week: everything is in service of race day ──────────
    // 1–2 short shakeout runs earlier in the week (never the day before),
    // the race itself on its actual calendar day, rest everywhere else.
    if (isRaceWeek) {
      const sessions = {};
      DAYS.forEach(d => { sessions[d.id] = restSession(); });

      const raceDayIdx = DAYS.findIndex(d => d.id === raceDayId);
      const shakeoutDays = unlockedOrder
        .map(id => DAYS.findIndex(d => d.id === id))
        .filter(idx => idx >= 0 && idx < raceDayIdx - 1) // strictly before race day, with a clear day off before it
        .slice(0, 2);
      const shakeoutKm = Math.max(1, Math.round(peakTrained * 0.3 * 10) / 10);
      shakeoutDays.forEach(idx => {
        sessions[DAYS[idx].id] = buildBeginnerSession(shakeoutKm, pct, ep, false);
      });

      sessions[raceDayId] = buildRaceDaySession(goalKm, ep, profile.raceName, peakTrained);

      const totalKm = Math.round(
        DAYS.reduce((sum, d) => sum + (sessions[d.id]?.distance || 0), 0) * 10
      ) / 10;

      result.push({
        weekNum: wn,
        phase: "RACE",
        startDate: dateFromAnchor(planAnchor, i),
        isDown: false,
        isPeakLong: true, // race completion is the goal — fires the celebration
        weekLabel: "Race Week",
        sessions,
        totalKm,
        longRunMins: 0,
        note: `🎉 Race week! Short legs-ticking-over runs only, a full rest day before, then ${profile.raceName || "your race"} on ${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][raceDayIdx]}. You've done the work — now enjoy it.`,
        volumeWarning: null,
      });
      continue;
    }

    // Hero day carries the plan's overall ramp toward goalKm, capped
    // against its OWN longest session so far (the evidence-based guard).
    const rampProgress = Math.min(1, (wn - 1) / Math.max(1, weeks - 2));
    const desiredHeroKm = startKm + rampProgress * (goalKm - startKm);
    let heroKm = Math.min(desiredHeroKm, longestByDay[heroDay] * SINGLE_SESSION_CAP_RATIO);
    if (isDown) heroKm = Math.max(startKm, heroKm * 0.8);
    heroKm = Math.min(goalKm, Math.round(heroKm * 10) / 10);
    if (!isDown) {
      longestByDay[heroDay] = Math.max(longestByDay[heroDay], heroKm);
      peakTrained = Math.max(peakTrained, heroKm);
    }

    const sessionRatios   = SESSION_RATIOS[unlockedOrder.length] || SESSION_RATIOS[3];
    const secondaryRatios = sessionRatios.slice(0, -1); // hero owns the trailing 1.0

    const sessions = {};
    DAYS.forEach(d => { sessions[d.id] = restSession(); });
    sessions[heroDay] = buildBeginnerSession(heroKm, pct, ep, wn === 1);

    // "Goal week" is about actually reaching the goal distance, not just
    // being positionally near the end of the plan. If the single-session
    // safety cap has kept someone well short of goalKm — because the
    // timeline asked for more than could be safely delivered — say so
    // honestly rather than claiming a goal that wasn't reached.
    // In race-anchored mode neither applies to build weeks: the race week
    // itself (handled above) is the goal, whatever the training peak was.
    const isGoalWeek = raceWeekNum === null && isFinalStretch && heroKm >= goalKm * 0.95;
    const fellShort  = raceWeekNum === null && isFinalStretch && !isGoalWeek;

    unlockedOrder.forEach((dayId, idxFromOldest) => {
      if (dayId === heroDay) return; // already built above

      const isNewThisWeek = freqJustIncreased && dayId === unlockedOrder[unlockedOrder.length - 1];
      if (isNewThisWeek) {
        // Starts short and easy on purpose — about half the hero day —
        // then builds its own history from here, independently, next week.
        const sessKm = Math.max(0.5, Math.round(heroKm * NEW_DAY_RATIO * 10) / 10);
        longestByDay[dayId] = sessKm;
        sessions[dayId] = buildBeginnerSession(sessKm, pct, ep, false);
        return;
      }

      // Established secondary day: more senior (earlier-unlocked) days sit
      // closer to the hero's distance; each is still capped against its
      // own history, so a day can never spike either.
      const seniorityRank = idxFromOldest - 1; // 0 = most senior secondary
      const ratioIdx = Math.max(0, Math.min(secondaryRatios.length - 1, secondaryRatios.length - 1 - seniorityRank));
      const ratio = secondaryRatios[ratioIdx] ?? 0.7;

      const desired = heroKm * ratio;
      let sessKm = Math.min(desired, (longestByDay[dayId] || startKm * NEW_DAY_RATIO) * SINGLE_SESSION_CAP_RATIO);
      if (isDown) sessKm = sessKm * 0.8;
      sessKm = Math.max(0.5, Math.round(sessKm * 10) / 10);
      if (!isDown) longestByDay[dayId] = Math.max(longestByDay[dayId] || 0, sessKm);
      sessions[dayId] = buildBeginnerSession(sessKm, pct, ep, false);
    });

    const totalKm = Math.round(
      DAYS.reduce((sum, d) => sum + (sessions[d.id]?.distance || 0), 0) * 10
    ) / 10;

    const note = isTaperWeek
      ? "🪫→🔋 Taper week — deliberately light so your legs are fresh and bouncy on race day. Resting IS the training now."
      : pickNote(wn, isDown, isGoalWeek, pct, goalKm, freqJustIncreased, fellShort, heroKm);

    result.push({
      weekNum: wn,
      phase: "BASE",
      startDate: dateFromAnchor(planAnchor, i),
      isDown,
      isPeakLong: isGoalWeek,
      weekLabel: isTaperWeek ? "Taper Week" : isDown ? "Easy Week" : isGoalWeek ? "Goal Week" : "Build",
      sessions,
      totalKm,
      longRunMins: 0,
      note,
      volumeWarning: null,
    });
  }

  return result;
}
