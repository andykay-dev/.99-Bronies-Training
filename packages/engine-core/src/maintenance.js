// ─────────────────────────────────────────────────────────────
//  MAINTENANCE ENGINE
//  Rolling 12-week plan — no fixed event, just hold the base.
//  Wave pattern: 3 build weeks + 1 deload (72% of prior peak).
//  Exported as generateMaintenancePlan(profile, feedbackMap)
// ─────────────────────────────────────────────────────────────

import { derivePaces, fmtPace, to99 } from "./physiology.js";
import { mondayOf, dateFromAnchor, toDateStr, todaySydney, computeFeedbackAdj } from "./scheduler.js";
import { DAYS } from "./constants.js";

// ── Long-run variation multipliers (8-cycle pattern, loops) ──
const LONG_MULTS = [1.0, 1.12, 0.90, 1.15, 0.95, 1.08, 0.88, 1.10];

// ── Interval rotation (never repeat consecutively) ───────────
const INTERVAL_TYPES = [
  { label: "800m Reps",    desc: (n) => `${n}×800m @ 5km effort, 90s jog recovery`, reps: true },
  { label: "Tempo",        desc: () => "20–25 min continuous tempo @ threshold pace" },
  { label: "Fartlek",      desc: () => "30 min easy with 6×1 min surges @ hard effort" },
  { label: "Hills",        desc: () => "8×60s hill sprints, walk down recovery" },
  { label: "Ladder",       desc: () => "400–800–1200–800–400m @ 5km effort, 90s recovery" },
  { label: "Progression",  desc: () => "Easy 15 min → tempo 10 min → fast finish 5 min" },
];

function pickInterval(weekIndex) {
  return INTERVAL_TYPES[weekIndex % INTERVAL_TYPES.length];
}

// ── Week volume calculation ───────────────────────────────────
// 3:1 wave: build × 3 then deload. Peak = target × 1.15. Deload = prior peak × 0.72.
function weekVolumes(targetKm, totalWeeks = 12) {
  const peak  = targetKm * 1.15;
  const step  = (peak - targetKm) / 3;           // increment per build week
  const vols  = [];
  for (let w = 0; w < totalWeeks; w++) {
    const pos = w % 4;                             // 0,1,2 = build; 3 = deload
    if (pos < 3) {
      vols.push(to99(targetKm + step * pos));
    } else {
      // deload = 72% of the peak we just hit
      const priorPeak = to99(targetKm + step * 2);
      vols.push(to99(priorPeak * 0.72));
    }
  }
  return vols;
}

// ── Build a single week's sessions ───────────────────────────
function buildWeek({ weekIndex, weekStart, targetVol, slots, paces, maintFreq, feedbackAdj }) {
  const longMult = LONG_MULTS[weekIndex % LONG_MULTS.length];

  // Distribute volume: long ~35%, workout ~20%, rest easy
  const longKm    = to99(targetVol * 0.35 * longMult);
  const workoutKm = to99(targetVol * 0.20);
  const remaining = Math.max(0, targetVol - longKm - workoutKm);
  const easyCount = Math.max(0, maintFreq - (slots.includes("long") ? 1 : 0) - (slots.includes("workout") ? 1 : 0));
  const easyKm    = easyCount > 0 ? to99(remaining / easyCount) : 0;

  const interval = pickInterval(weekIndex);

  // Assign sessions to days
  const sessions = [];
  let slotQueue = [...slots]; // user's preferred session types

  DAYS.forEach((day, dayIdx) => {
    const date = toDateStr(dateFromAnchor(weekStart, dayIdx));
    // Find if this day has a slot
    const slotType = slotQueue.shift() || "rest";

    if (slotType === "rest" || !slotType) {
      sessions.push({ day: day.id, date, type: "rest", label: "Rest", km: 0, desc: "Recovery day" });
      return;
    }

    if (slotType === "long") {
      const adjKm = to99(longKm * feedbackAdj);
      sessions.push({
        day: day.id, date, type: "long",
        label: `Long Run — ${adjKm}km`,
        km: adjKm,
        pace: fmtPace(paces.ep),
        desc: `${adjKm}km easy to moderate. Time on feet.`,
      });
      return;
    }

    if (slotType === "workout") {
      const adjKm = to99(workoutKm * feedbackAdj);
      const reps  = interval.reps ? Math.max(4, Math.min(10, Math.round(adjKm / 0.8))) : null;
      sessions.push({
        day: day.id, date, type: "workout",
        label: `${interval.label}`,
        km: adjKm,
        pace: fmtPace(paces.ip),
        desc: interval.desc(reps),
      });
      return;
    }

    if (slotType === "bronies") {
      sessions.push({
        day: day.id, date, type: "bronies",
        label: "BRONIES 7.99km",
        km: 7.99,
        pace: fmtPace(paces.ep),
        desc: "The Saturday social run. Show up. Coffee after.",
      });
      return;
    }

    // easy
    const adjKm = to99(easyKm * feedbackAdj);
    sessions.push({
      day: day.id, date, type: "easy",
      label: `Easy Run — ${adjKm}km`,
      km: adjKm,
      pace: fmtPace(paces.ep),
      desc: `${adjKm}km easy conversational pace.`,
    });
  });

  const totalKm = to99(sessions.reduce((s, x) => s + (x.km || 0), 0));
  return { weekIndex, weekStart: toDateStr(weekStart), sessions, totalKm,
           isDeload: weekIndex % 4 === 3, targetVol };
}

// ── Main export ───────────────────────────────────────────────
export function generateMaintenancePlan(profile, feedbackMap = {}) {
  const {
    maintTargetKm = 30,
    maintFreq     = 3,
    maintSlots    = ["workout", "long", "easy"],
    referenceTime,
    referenceDistance,
    planStartDate,
  } = profile;

  // Derive paces from reference run (same as other engines)
  const paces = derivePaces(referenceTime, referenceDistance);

  // Feedback adjustment (same rolling adj as other engines)
  const feedbackAdj = computeFeedbackAdj(feedbackMap);

  // Anchor to Monday of planStartDate (or today)
  const today    = todaySydney();
  const anchor   = planStartDate ? mondayOf(new Date(planStartDate)) : mondayOf(new Date(today));

  const TOTAL_WEEKS = 12;
  const vols = weekVolumes(maintTargetKm, TOTAL_WEEKS);

  // Expand slots to fill all 7 days (pad with rest)
  // maintSlots is the user's active day types — map to their chosen days
  const activeDays = profile.dayPlan
    ? DAYS.map(d => profile.dayPlan[d.id]).map(v => (v && v !== "rest" ? v : "rest"))
    : (() => {
        // fallback: spread slots across days with rests
        const arr = Array(7).fill("rest");
        const chosen = maintSlots.slice(0, maintFreq);
        chosen.forEach((s, i) => { arr[i * Math.floor(7 / chosen.length)] = s; });
        return arr;
      })();

  const weeks = Array.from({ length: TOTAL_WEEKS }, (_, i) => {
    const weekStart = new Date(anchor);
    weekStart.setDate(anchor.getDate() + i * 7);
    return buildWeek({
      weekIndex: i,
      weekStart,
      targetVol: vols[i],
      slots: activeDays,
      paces,
      maintFreq,
      feedbackAdj,
    });
  });

  return {
    mode: "maintenance",
    maintTargetKm,
    maintFreq,
    maintSlots,
    totalWeeks: TOTAL_WEEKS,
    planStart: toDateStr(anchor),
    weeks,
    paces,
  };
}
