// ─────────────────────────────────────────────────────────────
//  EVENT ENGINE — scheduler.js
//  Event-specific periodisation: phase assignment, down-week
//  detection, peak long-run distribution, long-run distance.
//  Calendar helpers come from @bronies/engine-core.
//  Pure functions — same inputs → same outputs.
// ─────────────────────────────────────────────────────────────
import { PHASE_BOUNDARIES } from "./constants.js";

// ── Phase assignment ──────────────────────────────────────────

/**
 * Assign a training phase to a week number.
 * @param {number} wn    - 1-based week number
 * @param {number} total - total weeks including race week
 * @returns {"BASE"|"BUILD"|"PEAK"|"TAPER"|"RACE"}
 */
export function getPhase(wn, total) {
  if (wn === total) return "RACE";
  const rem = total - wn;
  if (rem <= 2) return "TAPER";
  const pct = wn / total;
  if (pct <= PHASE_BOUNDARIES.base)  return "BASE";
  if (pct <= PHASE_BOUNDARIES.build) return "BUILD";
  return "PEAK";
}

// ── Peak long-run distribution ────────────────────────────────

/**
 * Determine which weeks carry "peak" long runs. Returns 1-based week numbers.
 *
 * Rules:
 *  - Very short plans (< 9 wks): single peak — two peaks can't both fit with
 *    a proper ramp before the first one and recovery before taper.
 *  - Medium plans (9–12 wks): two peaks with revised timing (later first peak
 *    so there's more build room).
 *  - Long plans (≥ 13 wks): three peaks for ultra/marathon, two for shorter.
 *  - Peaks are always ≥ 2 weeks apart (recovery week between).
 *  - Peaks finish before taper (≤ trainingWks − 2).
 */
export function peakLongRunWeeks(distNum, trainingWks) {
  const canFitThree = trainingWks >= 13;
  const isVeryShort = trainingWks < 9;
  const isMedium    = trainingWks >= 9 && trainingWks < 13;

  let raw;

  if (distNum >= 80) {
    if (isVeryShort) {
      raw = [Math.round(trainingWks * 0.75)];
    } else if (isMedium) {
      raw = [Math.round(trainingWks * 0.68), Math.round(trainingWks * 0.82)];
    } else {
      raw = canFitThree
        ? [Math.round(trainingWks * 0.58), Math.round(trainingWks * 0.70), Math.round(trainingWks * 0.82)]
        : [Math.round(trainingWks * 0.66), Math.round(trainingWks * 0.80)];
    }
  } else if (distNum >= 30) {
    if (isVeryShort) {
      raw = [Math.round(trainingWks * 0.75)];
    } else if (isMedium) {
      raw = [Math.round(trainingWks * 0.70), Math.round(trainingWks * 0.84)];
    } else {
      raw = canFitThree
        ? [Math.round(trainingWks * 0.65), Math.round(trainingWks * 0.74), Math.round(trainingWks * 0.82)]
        : [Math.round(trainingWks * 0.68), Math.round(trainingWks * 0.80)];
    }
  } else {
    if (isVeryShort) {
      raw = [Math.round(trainingWks * 0.78)];
    } else if (isMedium) {
      raw = [Math.round(trainingWks * 0.72), Math.round(trainingWks * 0.85)];
    } else {
      raw = [Math.round(trainingWks * 0.70), Math.round(trainingWks * 0.80)];
    }
  }

  // Guarantee ≥ 2 weeks between consecutive peaks
  const spaced = [];
  raw.sort((a, b) => a - b).forEach(w => {
    if (!spaced.length) spaced.push(w);
    else spaced.push(Math.max(w, spaced[spaced.length - 1] + 2));
  });

  // Peaks must finish before taper
  const latestAllowed = trainingWks - 2;
  if (spaced.length && spaced[spaced.length - 1] > latestAllowed) {
    const shift = spaced[spaced.length - 1] - latestAllowed;
    for (let i = 0; i < spaced.length; i++) spaced[i] -= shift;
  }

  // Final safety: strictly increasing, ≥ week 1
  for (let i = 1; i < spaced.length; i++) {
    if (spaced[i] <= spaced[i - 1] + 1) spaced[i] = spaced[i - 1] + 2;
  }

  return spaced.filter(w => w >= 1);
}

// ── Down-week detection ───────────────────────────────────────

/**
 * Compute the full set of "down" week numbers for a training block.
 *
 * Rules:
 *  1. Every 3rd build week is a routine down week (load management)
 *  2. Weeks BETWEEN two consecutive peak weeks are down weeks
 *  3. The week immediately AFTER every peak long run is a down week
 *  4. Taper and race weeks are never flagged as down weeks
 *
 * @returns {{ downWeeks, interPeakDownWeeks, postPeakDownWeeks }} — each a Set<number>
 */
export function computeDownWeeks(peakWeeks, trainingWks, total) {
  const interPeakDownWeeks = new Set();
  const postPeakDownWeeks  = new Set();

  if (peakWeeks.length >= 2) {
    for (let pi = 0; pi < peakWeeks.length - 1; pi++) {
      for (let w = peakWeeks[pi] + 1; w < peakWeeks[pi + 1]; w++) {
        interPeakDownWeeks.add(w);
      }
    }
  }

  peakWeeks.forEach(pw => {
    const afterPeak = pw + 1;
    if (!peakWeeks.includes(afterPeak)) postPeakDownWeeks.add(afterPeak);
  });

  const downWeeks = new Set();
  for (let wn = 1; wn <= trainingWks; wn++) {
    const phase = getPhase(wn, total);
    const isPeakLong = peakWeeks.includes(wn);
    const isAnyRecovery = interPeakDownWeeks.has(wn) || postPeakDownWeeks.has(wn);
    if (
      ((wn % 3 === 0) && !["TAPER", "RACE", "PEAK"].includes(phase) && !isPeakLong)
      || isAnyRecovery
    ) {
      downWeeks.add(wn);
    }
  }

  return { downWeeks, interPeakDownWeeks, postPeakDownWeeks };
}

// ── Long-run distance ─────────────────────────────────────────

/**
 * Compute the long-run distance (km) for a given week.
 *
 * Ramp model:
 *  - Non-peak, non-down weeks ramp from baseStart (42% of race dist) up to
 *    85% of maxLong, scaled relative to the first peak week so the build
 *    fills the available window regardless of plan length.
 *  - Peak weeks hit 95% (first peak) and 100% (second) of maxLong.
 *  - Recovery weeks (post-peak, inter-peak) floor at 65% of maxLong.
 *  - Down weeks floor at minRecovery (45% of race dist).
 *  - Taper drops to 60% then 38% of maxLong.
 */
export function computeLongKm(opts) {
  const {
    wn, pct, phase, isPeakLong, isDown, isInterPeakDown, isPostPeakDown,
    isTaper, taperWkIdx, maxLong, distNum, gm, fbAdj, peakWeeks,
  } = opts;

  const isAnyRecovery = isInterPeakDown || isPostPeakDown;

  // Ultra events (>= 80km) train on time on feet — base and recovery floors
  // scale from maxLong rather than race distance to avoid flat ramps.
  const isUltraEvent  = distNum >= 80;
  const minRecovery   = isUltraEvent
    ? Math.round(maxLong * 0.70)
    : Math.round(distNum * 0.45);
  const baseStart     = isUltraEvent
    ? Math.round(maxLong * 0.60)
    : Math.max(distNum * 0.42, 10);
  const prePeakCeil   = Math.round(maxLong * 0.85);
  const firstPeak     = peakWeeks.length > 0 ? peakWeeks[0] : wn;

  let longKm;

  if (isPeakLong) {
    const peakIdx = peakWeeks.indexOf(wn);
    const mult = peakIdx === 0 ? 0.95 : peakIdx === 1 ? 1.00 : 0.98;
    longKm = Math.round(maxLong * mult);

  } else if (isAnyRecovery) {
    longKm = Math.max(minRecovery, Math.round(maxLong * 0.65));

  } else if (isTaper) {
    longKm = taperWkIdx <= 1
      ? Math.round(maxLong * 0.60)
      : Math.round(maxLong * 0.38);

  } else if (isDown) {
    // For ultra events the distNum-anchored formula produces values close to
    // maxLong (100 * 0.40 = 40km on a 48km cap). Use maxLong-anchored floor instead.
    longKm = isUltraEvent
      ? minRecovery
      : Math.max(minRecovery, Math.round((distNum * 0.40 + pct * distNum * 0.15) * gm));

  } else {
    // Ramp relative to first peak — fills the build window evenly regardless
    // of plan length, so short plans still build through the mid-distance range.
    const rampPct = firstPeak > 1 ? Math.min(1, (wn - 1) / (firstPeak - 1)) : 1;
    longKm = Math.round((baseStart + rampPct * (prePeakCeil - baseStart)) * gm);
  }

  const lower = isDown ? minRecovery : 6;
  return Math.max(lower, Math.min(maxLong, longKm + (isDown ? 0 : Math.round(fbAdj))));
}
