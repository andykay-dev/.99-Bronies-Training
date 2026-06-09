// ─────────────────────────────────────────────────────────────
//  ENGINE CORE — physiology.js
//  Pace zones (Daniels VDOT), long run caps, elevation guidance,
//  session-time estimates, goal-multiplier lookup, .99 snapping.
//  Shared by every Bronies engine.
//  Pure functions — same inputs → same outputs.
// ─────────────────────────────────────────────────────────────
import { RACE_DISTANCES, TRAINING_GOALS } from "./constants.js";

// ── Formatting helpers ────────────────────────────────────────

export function parseTime(s) {
  if (!s || typeof s !== "string") return null;
  const parts = s.trim().split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

export function fmtPace(sec) {
  const s = Math.round(Math.abs(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function fmtDuration(minutes) {
  const h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

// ── Pace zone derivation ──────────────────────────────────────

/**
 * Derive training paces from a reference time/distance (Daniels VDOT approximation).
 *
 * @param {object} profile  - { refDistance, refTime, goalTime?, eventDistanceNum? }
 * @returns {{ ep, tp, ip, mp, wucd }}  — all in seconds/km
 *   ep:   easy pace
 *   tp:   threshold / tempo pace
 *   ip:   interval / VO2max pace
 *   mp:   marathon / goal race pace
 *   wucd: warm-up / cool-down pace
 */
export function derivePaces(profile) {
  const refDist = RACE_DISTANCES.find(d => d.value === (profile.refDistance || "10k"));
  let ep = 380; // fallback: ~6:20/km easy pace

  if (refDist && profile.refTime) {
    const totalSec = parseTime(profile.refTime);
    if (totalSec && totalSec > 0) {
      const racePace = totalSec / refDist.km;
      // Longer races need a smaller adjustment (you ran at a harder fraction of max)
      const adj = Math.max(50, 90 - refDist.km * 1.2);
      ep = Math.round(racePace + adj);
    }
  }

  const tp   = Math.round(ep * 0.87);
  const ip   = Math.round(ep * 0.79);
  const wucd = Math.round(ep * 1.04);
  let   mp   = Math.round(ep * 0.92);

  // Override marathon pace with goal time when available
  if (profile.goalTime && profile.eventDistanceNum) {
    const gs = parseTime(profile.goalTime);
    if (gs && gs > 0) mp = Math.round(gs / profile.eventDistanceNum);
  }

  return { ep, tp, ip, mp, wucd };
}

// ── Training goal multiplier ──────────────────────────────────

/** Returns the volume multiplier for a training goal key. */
export function goalMult(goal) {
  return TRAINING_GOALS.find(g => g.value === goal)?.mult || 1.0;
}

// ── Long run caps ─────────────────────────────────────────────

/**
 * Maximum long run distance (km) for the event type.
 * Capped by both time (to prevent 6+ hour slogs) and a hard distance ceiling
 * derived from race distance.
 *
 * @param {boolean} isTrail   - trail events allow slower/longer long runs
 * @param {number}  distNum   - race distance in km
 * @param {number}  ep        - easy pace in seconds/km
 * @returns {number} max long run km
 */
export function longRunCap(isTrail, distNum, ep) {
  // Time cap per distance bracket. 50km is its own bracket — the old code
  // used the marathon bracket (300min) which gave 42km long runs for a 50km
  // event. That is too long; 50km training peaks at ~33km / ~4hrs.
  const maxMins = distNum >= 80  ? (isTrail ? 420 : 360)   // ultra: 7h/6h
                : distNum >= 50  ? (isTrail ? 240 : 210)   // 50–79km: 4h/3.5h
                : distNum >= 42  ? (isTrail ? 270 : 240)   // marathon: 4.5h/4h
                : distNum >= 18  ? (isTrail ? 210 : 180)   // half: 3.5h/3h
                :                  (isTrail ? 150 : 120);  // shorter: 2.5h/2h

  const longPace = isTrail ? ep * 1.18 : ep * 1.06;
  const byTime   = Math.floor((maxMins * 60) / longPace);

  // Hard distance caps (Pfitzinger-based). For ultras (>= 80km) the cap is
  // time-limited above, so hardCap mainly guards against very fast runners.
  const hardCap = distNum >= 80  ? Math.min(Math.round(distNum * 0.48), 55)
                : distNum >= 50  ? Math.min(34, Math.round(distNum * 0.68))
                : distNum >= 42  ? Math.round(distNum * 0.83)
                : distNum >= 28  ? Math.round(distNum * 0.87)
                : distNum >= 18  ? Math.round(distNum * 0.91)
                : distNum >= 10  ? Math.round(distNum * 0.95)
                :                  Math.round(distNum * 1.0);

  return Math.min(hardCap, byTime);
}

/**
 * Determine which weeks should carry "peak" long runs.
 * Returns an array of 1-based week numbers.
 *
 * Rules:
 * - Two peaks for most plans, three for very long plans (≥13 wks)
 * - Ultra distances get three peaks when there's room
 * - Peaks are always ≥2 weeks apart (recovery week between)
 * - Peaks finish before taper (≤ trainingWks - 2)
 *
 * @param {number} distNum       - race distance in km
 * @param {number} trainingWks   - total training weeks (excl race week)
 * @returns {number[]} sorted week numbers
 */
export function peakLongRunWeeks(distNum, trainingWks) {
  const canFitThree = trainingWks >= 13;
  let raw;

  if (distNum >= 80) {
    raw = canFitThree
      ? [
          Math.round(trainingWks * 0.58),
          Math.round(trainingWks * 0.70),
          Math.round(trainingWks * 0.82),
        ]
      : [
          Math.round(trainingWks * 0.66),
          Math.round(trainingWks * 0.80),
        ];
  } else if (distNum >= 30) {
    raw = canFitThree
      ? [
          Math.round(trainingWks * 0.65),
          Math.round(trainingWks * 0.74),
          Math.round(trainingWks * 0.82),
        ]
      : [
          Math.round(trainingWks * 0.68),
          Math.round(trainingWks * 0.80),
        ];
  } else {
    raw = [
      Math.round(trainingWks * 0.70),
      Math.round(trainingWks * 0.80),
    ];
  }

  // Guarantee ≥2 weeks between consecutive peaks
  const spaced = [];
  raw.sort((a, b) => a - b).forEach(w => {
    if (!spaced.length) {
      spaced.push(w);
    } else {
      spaced.push(Math.max(w, spaced[spaced.length - 1] + 2));
    }
  });

  // Peaks must finish before taper (latestAllowed = trainingWks - 2)
  const latestAllowed = trainingWks - 2;
  if (spaced.length && spaced[spaced.length - 1] > latestAllowed) {
    const shift = spaced[spaced.length - 1] - latestAllowed;
    for (let i = 0; i < spaced.length; i++) spaced[i] -= shift;
  }

  // Final safety: strictly increasing, all ≥ week 1
  for (let i = 1; i < spaced.length; i++) {
    if (spaced[i] <= spaced[i - 1] + 1) spaced[i] = spaced[i - 1] + 2;
  }

  return spaced.filter(w => w >= 1);
}

// ── Session time estimates ────────────────────────────────────

/**
 * Estimate duration (minutes) for a long run.
 * Trail adds 18% to pace; road adds 6%.
 */
export function estimateLongRunTime(km, isTrail, ep) {
  const pace = isTrail ? ep * 1.18 : ep * 1.06;
  return Math.round((km * pace) / 60);
}

/**
 * Estimate duration (minutes) for any built session object.
 * Returns null for race days (duration unknown at plan time).
 */
export function sessionMinutes(session, paces, isTrail) {
  if (!session || !session.distance || session.distance < 0.01) return 0;
  if (session.estMins) return session.estMins;
  if (session.wtype === "long") return estimateLongRunTime(session.distance, isTrail, paces.ep);
  if (session.wtype === "race") return null;
  const mult = session.wtype === "easy" ? 1.04 : 1.0;
  return Math.round(session.distance * paces.ep * mult / 60);
}

// ── Elevation guidance ────────────────────────────────────────

/**
 * Return elevation thresholds (metres total ascent) for a given race distance.
 * Anchored to 5m/km (low) and 60m/km (high).
 *
 * @returns {{ low, mid, high, max }}
 */
export function elevationGuide(distNum) {
  const d   = Math.max(5, parseFloat(distNum) || 50);
  const low  = Math.round(d * 5);
  const high = Math.round(d * 60);
  const mid  = Math.round((low + high) / 2);
  return { low, mid, high, max: high };
}

/**
 * Map a numeric elevation (metres) to the categorical bucket used by the plan builder.
 * @returns {"flat"|"low"|"medium"|"high"}
 */
export function bucketElevation(meters, distNum) {
  if (!meters || meters < 0) return "flat";
  const { low, high } = elevationGuide(distNum);
  if (meters < low * 0.5) return "flat";
  if (meters < low)       return "low";
  if (meters < high)      return "medium";
  return "high";
}

// ── .99 distance snap ─────────────────────────────────────────

/**
 * Snap a distance to end in .99 — embrace the Bronies .99 chaos.
 * Always finishes on the .99. Always.
 */
export function to99(km) {
  if (!km || km <= 0) return 0.99;
  const floored = Math.floor(km);
  return (floored > 0 ? floored - 1 : 0) + 0.99;
}
