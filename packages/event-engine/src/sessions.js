// ─────────────────────────────────────────────────────────────
//  EVENT ENGINE — sessions.js
//  Complete workout library — makeW() and all session builders.
//  Also contains slot normalisation helpers and rep-edit detection.
//  Pure functions — same inputs → same outputs.
// ─────────────────────────────────────────────────────────────
import { WORKOUT_SUBTYPES } from "./constants.js";
import { fmtPace, fmtDuration, estimateLongRunTime, to99 } from "@bronies/engine-core";

// ── Slot helpers ──────────────────────────────────────────────

/**
 * Normalise a dayPlan slot value to an array.
 * Old format: "workout" → ["workout"]
 * New format: ["workout","strength"] → ["workout","strength"]
 * Workout subtypes (hills, fartlek, intervals) are kept as-is.
 */
export function normaliseSlot(raw) {
  if (!raw) return ["rest"];
  if (Array.isArray(raw)) return raw.length ? raw : ["rest"];
  return [raw];
}

/** Returns the primary run type from a slot array (first non-strength, non-rest entry). */
export function primarySlot(slots) {
  const s = normaliseSlot(slots);
  return s.find(k => k !== "strength") || s[0] || "rest";
}

/** Returns true if strength training is included in a slot array. */
export function hasStrength(slots) {
  return normaliseSlot(slots).includes("strength");
}

/** Returns true if a slot primary is a workout (or workout subtype). */
export function isWorkoutSlot(p) {
  return p === "workout" || WORKOUT_SUBTYPES.includes(p);
}

// ── Rep-edit helpers ──────────────────────────────────────────

/**
 * Detect whether a session label matches one of our editable rep-based formats.
 * Returns { kind, reps, restSec, min, max, label } or null.
 */
export function parseEditableSession(session) {
  if (!session?.label) return null;
  const lbl = session.label;
  const m = lbl.match(
    /^(\d+)×(\d+m\s+Reps|\d+km\s+(?:Reps|Intervals)|1km\s+Intervals|1min\s+Hill\s+Sprints|2min\s+Hill\s+Efforts)/
  );
  if (!m) return null;
  const reps = parseInt(m[1], 10);
  const tail = m[2];
  if (/^400m/.test(tail))            return { kind: "reps400",     reps, restSec: 75,  min: 4, max: 12, label: "400m reps"     };
  if (/^800m/.test(tail))            return { kind: "reps800",     reps, restSec: 90,  min: 3, max: 10, label: "800m reps"     };
  if (/^1200m/.test(tail))           return { kind: "reps1200",    reps, restSec: 90,  min: 3, max: 8,  label: "1200m reps"   };
  if (/^1km/.test(tail))             return { kind: "intervals",   reps, restSec: 90,  min: 3, max: 8,  label: "1km intervals" };
  if (/^2km/.test(tail))             return { kind: "reps2k",      reps, restSec: 120, min: 2, max: 5,  label: "2km reps"      };
  if (/Hill\s+Sprints/.test(tail))   return { kind: "hillSprints", reps, restSec: 0,   min: 4, max: 12, label: "hill sprints"  };
  if (/Hill\s+Efforts/.test(tail))   return { kind: "hillRepeats", reps, restSec: 0,   min: 3, max: 10, label: "hill repeats"  };
  return null;
}

/**
 * Regenerate a session from an edited rep count.
 * Returns the full session object (label, summary, detail, distance, estMins, garmin).
 */
export function regenerateFromReps(W, kind, reps, restSec) {
  switch (kind) {
    case "reps400":     return W.reps400(reps, restSec);
    case "reps800":     return W.reps800(reps, restSec);
    case "reps1200":    return W.reps1200(reps, restSec);
    case "intervals":   return W.intervals(reps, restSec);
    case "reps2k":      return W.reps2k(reps, restSec);
    case "hillSprints": return W.hillSprints(reps);
    case "hillRepeats": return W.hillRepeats(reps);
    default:            return null;
  }
}

// ── Workout library ───────────────────────────────────────────

/**
 * Build the full workout library object, pre-bound to the runner's pace zones.
 *
 * @param {{ ep, tp, ip, mp, wucd }} paces  — all in seconds/km
 * @returns {object}  W — the full session builder object
 *
 * Every method returns a session object:
 *   { wtype, label, distance, estMins, summary, detail, garmin }
 */
export function makeW(paces) {
  const { ep, tp, ip, mp, wucd } = paces;

  // Sub-pace zones (Daniels %)
  const pace400  = Math.round(ip * 0.88);
  const pace800  = Math.round(ip * 0.93);
  const pace1200 = Math.round(ip * 0.97);
  const pace1k   = ip;
  const pace2k   = Math.round(ip * 0.98);
  const epSlow   = ep + 10;  // eslint-disable-line no-unused-vars
  const epFast   = ep - 10;  // eslint-disable-line no-unused-vars
  const wuSlow   = wucd + 10; // eslint-disable-line no-unused-vars
  const wuFast   = wucd - 10; // eslint-disable-line no-unused-vars

  return {

    // ── Interval reps ───────────────────────────────────────

    reps400: (reps, restSec = 75) => {
      const km = to99(4 + reps * 0.4);
      const effortSec = Math.round(400 / (1000 / pace400));
      const mins = Math.round(20 + reps * (effortSec + restSec) / 60);
      return {
        wtype: "intervals", label: `${reps}×400m Reps`, distance: km, estMins: mins,
        summary: `WU 2km · ${reps}×400m @ ${fmtPace(pace400)}/km · ${restSec}s rest · CD 2km`,
        detail: `Warm up 2km easy @ ${fmtPace(wucd)}/km.\n\n${reps}×400m @ ${fmtPace(pace400)}/km with ${restSec}s standing rest between reps.\n\nCool down 2km easy.\n\nShort and sharp — controlled aggression. Don't sprint the first one.\nEach rep should feel the same. If they're getting slower, you went out too hard.`,
        garmin: [`WARM UP   — Distance: 2.00km | Pace: ${fmtPace(wucd)}/km`, `REPEAT ×${reps}:`, `  INTERVAL — Distance: 0.40km | Pace: ${fmtPace(pace400)}/km`, `  REST     — Time: 1:${String(restSec % 60).padStart(2, "0")} | Standing rest`, `COOL DOWN — Distance: 2.00km | Pace: ${fmtPace(ep)}/km`],
      };
    },

    reps800: (reps, restSec = 90) => {
      const km = to99(4 + reps * 0.8);
      const effortSec = Math.round(800 / (1000 / pace800));
      const mins = Math.round(20 + reps * (effortSec + restSec) / 60);
      return {
        wtype: "intervals", label: `${reps}×800m Reps`, distance: km, estMins: mins,
        summary: `WU 2km · ${reps}×800m @ ${fmtPace(pace800)}/km · 90s rest · CD 2km`,
        detail: `Warm up 2km easy @ ${fmtPace(wucd)}/km.\n\n${reps}×800m @ ${fmtPace(pace800)}/km with 90s standing rest between reps.\n\nCool down 2km easy.\n\nFind your rhythm by rep 2. Each rep should feel controlled but uncomfortable.\nIf the last rep falls apart, you went too hard early.`,
        garmin: [`WARM UP   — Distance: 2.00km | Pace: ${fmtPace(wucd)}/km`, `REPEAT ×${reps}:`, `  INTERVAL — Distance: 0.80km | Pace: ${fmtPace(pace800)}/km`, `  REST     — Time: 1:30 | Standing rest`, `COOL DOWN — Distance: 2.00km | Pace: ${fmtPace(ep)}/km`],
      };
    },

    reps1200: (reps, restSec = 90) => {
      const km = to99(4 + reps * 1.2);
      const effortSec = Math.round(1200 / (1000 / pace1200));
      const mins = Math.round(20 + reps * (effortSec + restSec) / 60);
      const restLabel = restSec <= 90 ? "1:30" : "2:00";
      return {
        wtype: "intervals", label: `${reps}×1200m Reps`, distance: km, estMins: mins,
        summary: `WU 2km · ${reps}×1200m @ ${fmtPace(pace1200)}/km · ${restLabel} rest · CD 2km`,
        detail: `Warm up 2km easy @ ${fmtPace(wucd)}/km.\n\n${reps}×1200m @ ${fmtPace(pace1200)}/km with ${restLabel} standing rest between reps.\n\nCool down 2km easy.\n\nStay relaxed in the shoulders — drive with your arms in the final 200m.\nThe rest is short on purpose. Get comfortable being uncomfortable.`,
        garmin: [`WARM UP   — Distance: 2.00km | Pace: ${fmtPace(wucd)}/km`, `REPEAT ×${reps}:`, `  INTERVAL — Distance: 1.20km | Pace: ${fmtPace(pace1200)}/km`, `  REST     — Time: ${restLabel} | Standing rest`, `COOL DOWN — Distance: 2.00km | Pace: ${fmtPace(ep)}/km`],
      };
    },

    intervals: (reps, restSec = 90) => {
      const km = to99(4 + reps * 1.0);
      const effortSec = Math.round(1000 / (1000 / pace1k));
      const mins = Math.round(20 + reps * (effortSec + restSec) / 60);
      return {
        wtype: "intervals", label: `${reps}×1km Intervals`, distance: km, estMins: mins,
        summary: `WU 2km · ${reps}×1km @ ${fmtPace(pace1k)}/km · 90s rest · CD 2km`,
        detail: `Warm up 2km easy @ ${fmtPace(wucd)}/km.\n\n${reps}×1km @ ${fmtPace(pace1k)}/km with 90s standing rest between reps.\n\nCool down 2km easy.\n\nThe classic. Stay even across all reps — the last one should feel like work but not a death march.\nIf you're significantly slower on the last rep, start slower next time.`,
        garmin: [`WARM UP   — Distance: 2.00km | Pace: ${fmtPace(wucd)}/km`, `REPEAT ×${reps}:`, `  INTERVAL — Distance: 1.00km | Pace: ${fmtPace(pace1k)}/km`, `  REST     — Time: 1:30 | Standing rest`, `COOL DOWN — Distance: 2.00km | Pace: ${fmtPace(ep)}/km`],
      };
    },

    reps2k: (reps, restSec = 120) => {
      const km = to99(4 + reps * 2.0);
      const effortSec = Math.round(2000 / (1000 / pace2k));
      const mins = Math.round(20 + reps * (effortSec + restSec) / 60);
      return {
        wtype: "intervals", label: `${reps}×2km Reps`, distance: km, estMins: mins,
        summary: `WU 2km · ${reps}×2km @ ${fmtPace(pace2k)}/km · 2min rest · CD 2km`,
        detail: `Warm up 2km easy @ ${fmtPace(wucd)}/km.\n\n${reps}×2km @ ${fmtPace(pace2k)}/km with 2min standing rest between reps.\n\nCool down 2km easy.\n\nLonger reps — sits between interval pace and tempo.\nGo out controlled and build across each rep. The first km should feel almost easy.\nThe second km is where the work happens.`,
        garmin: [`WARM UP   — Distance: 2.00km | Pace: ${fmtPace(wucd)}/km`, `REPEAT ×${reps}:`, `  INTERVAL — Distance: 2.00km | Pace: ${fmtPace(pace2k)}/km`, `  REST     — Time: 2:00 | Standing rest`, `COOL DOWN — Distance: 2.00km | Pace: ${fmtPace(ep)}/km`],
      };
    },

    // ── Combo workouts ──────────────────────────────────────

    combo2k1k1k: () => {
      const e2k = Math.round(2000 / (1000 / pace2k));
      const e1k = Math.round(1000 / (1000 / pace1k));
      const mins = Math.round(20 + (e2k + 90 + e1k + 90 + e1k) / 60);
      const km = to99(4 + 2 + 1 + 1);
      return {
        wtype: "intervals", label: "2km / 1km / 1km", distance: km, estMins: mins,
        summary: `WU 2km · 2km rep · 90s · 1km · 90s · 1km · CD 2km`,
        detail: `Warm up 2km easy @ ${fmtPace(wucd)}/km.\n\n1×2km @ ${fmtPace(pace2k)}/km — 90s standing rest\n1×1km @ ${fmtPace(pace1k)}/km — 90s standing rest\n1×1km @ ${fmtPace(pace1k)}/km\n\nCool down 2km easy.\n\nThe 2km sets the tone — go out controlled.\nThe two 1kms that follow should be at the same effort, slightly faster pace.\nDon't die on the 2km trying to be a hero.`,
        garmin: [`WARM UP  — Distance: 2.00km | Pace: ${fmtPace(wucd)}/km`, `INTERVAL — Distance: 2.00km | Pace: ${fmtPace(pace2k)}/km`, `REST     — Time: 1:30 | Standing rest`, `INTERVAL — Distance: 1.00km | Pace: ${fmtPace(pace1k)}/km`, `REST     — Time: 1:30 | Standing rest`, `INTERVAL — Distance: 1.00km | Pace: ${fmtPace(pace1k)}/km`, `COOL DOWN — Distance: 2.00km | Pace: ${fmtPace(ep)}/km`],
      };
    },

    combo2x2k: () => {
      const effortSec = Math.round(2000 / (1000 / pace2k));
      const mins = Math.round(20 + (effortSec * 2 + 120) / 60);
      const km = to99(4 + 4);
      return {
        wtype: "intervals", label: "2×2km Reps", distance: km, estMins: mins,
        summary: `WU 2km · 2×2km @ ${fmtPace(pace2k)}/km · 2min rest · CD 2km`,
        detail: `Warm up 2km easy @ ${fmtPace(wucd)}/km.\n\n2×2km @ ${fmtPace(pace2k)}/km with 2min standing rest.\n\nCool down 2km easy.\n\nTwo solid sustained reps. The rest is short — you should feel it going into the second one.\nAim to run the second rep at the same pace or slightly faster than the first.`,
        garmin: [`WARM UP   — Distance: 2.00km | Pace: ${fmtPace(wucd)}/km`, `REPEAT ×2:`, `  INTERVAL — Distance: 2.00km | Pace: ${fmtPace(pace2k)}/km`, `  REST     — Time: 2:00 | Standing rest`, `COOL DOWN — Distance: 2.00km | Pace: ${fmtPace(ep)}/km`],
      };
    },

    combo2k1200800: () => {
      const e2k = Math.round(2000 / (1000 / pace2k));
      const e1200 = Math.round(1200 / (1000 / pace1200));
      const e800 = Math.round(800 / (1000 / pace800));
      const mins = Math.round(20 + (e2k + 90 + e1200 + 90 + e800) / 60);
      const km = to99(4 + 2 + 1.2 + 0.8);
      return {
        wtype: "intervals", label: "2km / 1200m / 800m", distance: km, estMins: mins,
        summary: `WU 2km · 2km → 1200m → 800m · getting faster · CD 2km`,
        detail: `Warm up 2km easy @ ${fmtPace(wucd)}/km.\n\n1×2km @ ${fmtPace(pace2k)}/km — 90s standing rest\n1×1200m @ ${fmtPace(pace1200)}/km — 90s standing rest\n1×800m @ ${fmtPace(pace800)}/km\n\nCool down 2km easy.\n\nDescending distance — each rep gets shorter and faster.\nThe 2km sets the aerobic foundation. The 800m at the end is pure speed.\nGive everything on that last 800.`,
        garmin: [`WARM UP  — Distance: 2.00km | Pace: ${fmtPace(wucd)}/km`, `INTERVAL — Distance: 2.00km | Pace: ${fmtPace(pace2k)}/km`, `REST     — Time: 1:30 | Standing rest`, `INTERVAL — Distance: 1.20km | Pace: ${fmtPace(pace1200)}/km`, `REST     — Time: 1:30 | Standing rest`, `INTERVAL — Distance: 0.80km | Pace: ${fmtPace(pace800)}/km`, `COOL DOWN — Distance: 2.00km | Pace: ${fmtPace(ep)}/km`],
      };
    },

    comboDescending: () => {
      const e1200 = Math.round(1200 / (1000 / pace1200));
      const e800 = Math.round(800 / (1000 / pace800));
      const e400 = Math.round(400 / (1000 / pace400));
      const mins = Math.round(20 + (e1200 + 90 + e800 + 75 + e400) / 60);
      const km = to99(4 + 1.2 + 0.8 + 0.4);
      return {
        wtype: "intervals", label: "1200 / 800 / 400 Descending", distance: km, estMins: mins,
        summary: `WU 2km · 1200m → 800m → 400m · paces get faster · CD 2km`,
        detail: `Warm up 2km easy @ ${fmtPace(wucd)}/km.\n\n1×1200m @ ${fmtPace(pace1200)}/km — 90s rest\n1×800m @ ${fmtPace(pace800)}/km — 75s rest\n1×400m @ ${fmtPace(pace400)}/km\n\nCool down 2km easy.\n\nEach rep gets shorter AND faster. Go out controlled on the 1200 — you'll earn the 400.\nThe 400 at the end should feel like a sprint. That's the point.`,
        garmin: [`WARM UP  — Distance: 2.00km | Pace: ${fmtPace(wucd)}/km`, `INTERVAL — Distance: 1.20km | Pace: ${fmtPace(pace1200)}/km`, `REST     — Time: 1:30 | Standing rest`, `INTERVAL — Distance: 0.80km | Pace: ${fmtPace(pace800)}/km`, `REST     — Time: 1:15 | Standing rest`, `INTERVAL — Distance: 0.40km | Pace: ${fmtPace(pace400)}/km`, `COOL DOWN — Distance: 2.00km | Pace: ${fmtPace(ep)}/km`],
      };
    },

    comboAscending: () => {
      const e400 = Math.round(400 / (1000 / pace400));
      const e800 = Math.round(800 / (1000 / pace800));
      const e1200 = Math.round(1200 / (1000 / pace1200));
      const mins = Math.round(20 + (e400 + 75 + e800 + 90 + e1200) / 60);
      const km = to99(4 + 0.4 + 0.8 + 1.2);
      return {
        wtype: "intervals", label: "400 / 800 / 1200 Ascending", distance: km, estMins: mins,
        summary: `WU 2km · 400m → 800m → 1200m · building into the longest rep · CD 2km`,
        detail: `Warm up 2km easy @ ${fmtPace(wucd)}/km.\n\n1×400m @ ${fmtPace(pace400)}/km — 75s rest\n1×800m @ ${fmtPace(pace800)}/km — 90s rest\n1×1200m @ ${fmtPace(pace1200)}/km\n\nCool down 2km easy.\n\nStart fast, build the distance. The 1200 at the end is the real test.\nHold the pace from the 800 into the 1200 — don't let it slip.`,
        garmin: [`WARM UP  — Distance: 2.00km | Pace: ${fmtPace(wucd)}/km`, `INTERVAL — Distance: 0.40km | Pace: ${fmtPace(pace400)}/km`, `REST     — Time: 1:15 | Standing rest`, `INTERVAL — Distance: 0.80km | Pace: ${fmtPace(pace800)}/km`, `REST     — Time: 1:30 | Standing rest`, `INTERVAL — Distance: 1.20km | Pace: ${fmtPace(pace1200)}/km`, `COOL DOWN — Distance: 2.00km | Pace: ${fmtPace(ep)}/km`],
      };
    },

    combo800s400s: () => {
      const e800 = Math.round(800 / (1000 / pace800));
      const e400 = Math.round(400 / (1000 / pace400));
      const mins = Math.round(20 + (3 * (e800 + 90) + 120 + 3 * (e400 + 75)) / 60);
      const km = to99(4 + 3 * 0.8 + 3 * 0.4);
      return {
        wtype: "intervals", label: "3×800m + 3×400m", distance: km, estMins: mins,
        summary: `WU 2km · 3×800m then 3×400m · CD 2km`,
        detail: `Warm up 2km easy @ ${fmtPace(wucd)}/km.\n\n3×800m @ ${fmtPace(pace800)}/km with 90s rest between.\n2min rest.\n3×400m @ ${fmtPace(pace400)}/km with 75s rest between.\n\nCool down 2km easy.\n\nTwo phases — the 800s build the engine, the 400s teach it to fire fast when tired.\nThe 400s should feel snappy even though you've already done 3×800.`,
        garmin: [`WARM UP    — Distance: 2.00km | Pace: ${fmtPace(wucd)}/km`, `REPEAT ×3:`, `  INTERVAL — Distance: 0.80km | Pace: ${fmtPace(pace800)}/km`, `  REST     — Time: 1:30 | Standing rest`, `TRANSITION — Time: 2:00 | Easy walk`, `REPEAT ×3:`, `  INTERVAL — Distance: 0.40km | Pace: ${fmtPace(pace400)}/km`, `  REST     — Time: 1:15 | Standing rest`, `COOL DOWN  — Distance: 2.00km | Pace: ${fmtPace(ep)}/km`],
      };
    },

    combo1200s400s: () => {
      const e1200 = Math.round(1200 / (1000 / pace1200));
      const e400 = Math.round(400 / (1000 / pace400));
      const mins = Math.round(20 + (2 * (e1200 + 90) + 150 + 4 * (e400 + 75)) / 60);
      const km = to99(4 + 2 * 1.2 + 4 * 0.4);
      return {
        wtype: "intervals", label: "2×1200m + 4×400m", distance: km, estMins: mins,
        summary: `WU 2km · 2×1200m then 4×400m · CD 2km`,
        detail: `Warm up 2km easy @ ${fmtPace(wucd)}/km.\n\n2×1200m @ ${fmtPace(pace1200)}/km with 90s rest.\n2.5min rest.\n4×400m @ ${fmtPace(pace400)}/km with 75s rest.\n\nCool down 2km easy.\n\nThe 1200s set the tone. The 400s finish the job.\nDon't die on the first 1200 — you've got 4 fast 400s waiting for you.`,
        garmin: [`WARM UP    — Distance: 2.00km | Pace: ${fmtPace(wucd)}/km`, `REPEAT ×2:`, `  INTERVAL — Distance: 1.20km | Pace: ${fmtPace(pace1200)}/km`, `  REST     — Time: 1:30 | Standing rest`, `TRANSITION — Time: 2:30 | Easy walk`, `REPEAT ×4:`, `  INTERVAL — Distance: 0.40km | Pace: ${fmtPace(pace400)}/km`, `  REST     — Time: 1:15 | Standing rest`, `COOL DOWN  — Distance: 2.00km | Pace: ${fmtPace(ep)}/km`],
      };
    },

    // ── Tempo / threshold ───────────────────────────────────

    tempo: (min) => ({
      wtype: "tempo", label: `${min}min Tempo`,
      distance: to99(4 + min * 60 / tp), estMins: 20 + min,
      summary: `WU 2km · ${min}min @ ${fmtPace(tp)}/km · CD 2km`,
      detail: `Warm up 2km easy @ ${fmtPace(wucd)}/km.\n\n${min}min continuous tempo @ ${fmtPace(tp)}/km — comfortably hard, short phrases only.\n\nCool down 2km easy.\n\nIf you can speak in full sentences, you're going too easy.\nIf you can't speak at all, you're going too hard. Short phrases is the sweet spot.`,
      garmin: [`WARM UP   — Distance: 2.00km | Pace: ${fmtPace(wucd)}/km`, `TEMPO     — Time: ${min}:00 | Pace: ${fmtPace(tp)}/km`, `COOL DOWN — Distance: 2.00km | Pace: ${fmtPace(ep)}/km`],
    }),

    tempoStrides: (min) => ({
      wtype: "tempo", label: `${min}min Tempo + Strides`,
      distance: to99(4 + min * 60 / tp), estMins: 20 + min + 8,
      summary: `WU 2km · ${min}min tempo · 4×1min strides · CD 2km`,
      detail: `Warm up 2km easy @ ${fmtPace(wucd)}/km.\n\n${min}min tempo @ ${fmtPace(tp)}/km.\n\nThen 4×1min strides @ ${fmtPace(pace400)}/km, 1min easy float between.\n\nCool down 2km easy.\n\nThe strides after tempo teach your legs to turn over fast when they're already tired.`,
      garmin: [`WARM UP   — Distance: 2.00km | Pace: ${fmtPace(wucd)}/km`, `TEMPO     — Time: ${min}:00 | Pace: ${fmtPace(tp)}/km`, `REPEAT ×4:`, `  STRIDE  — Time: 1:00 | Pace: ${fmtPace(pace400)}/km`, `  FLOAT   — Time: 1:00 | Easy jog`, `COOL DOWN — Distance: 2.00km | Pace: ${fmtPace(ep)}/km`],
    }),

    fartlek: (totalMin) => ({
      wtype: "fartlek", label: `${totalMin}min Fartlek`,
      distance: to99(totalMin * 60 / ((ep + pace800) / 2)), estMins: totalMin,
      summary: `${totalMin}min free-form speed play`,
      detail: `${totalMin}min continuous. Alternate freely between surges and easy floating.\n\n• Surges: 30–90s @ ${fmtPace(pace800)}/km effort\n• Float: ${fmtPace(ep)}/km or easier (keep moving, don't stop)\n\nNo structure — run entirely by feel. Perfect for the BRONIES Wednesday or Friday run.`,
      garmin: [`NOTE: Free-run mode recommended for fartlek.`, `Total Duration: ${totalMin}:00`, `Surge target: ${fmtPace(pace800)}/km effort`, `Float target: ${fmtPace(ep)}/km or easier`],
    }),

    onOff: (reps, onSec, offSec) => ({
      wtype: "onoff", label: `${reps}×${onSec}s On/Off`,
      distance: to99(4 + reps * (onSec + offSec) / 60 * 0.2),
      estMins: 20 + Math.round(reps * (onSec + offSec) / 60),
      summary: `WU 2km · ${reps}×(${onSec}s hard / ${offSec}s float) · CD 2km`,
      detail: `Warm up 2km easy @ ${fmtPace(wucd)}/km.\n\n${reps} reps:\n• ${onSec}s HARD @ ${fmtPace(pace800)}/km effort\n• ${offSec}s FLOAT @ ${fmtPace(ep)}/km (keep moving — never stop)\n\nCool down 2km easy.`,
      garmin: [`WARM UP — Distance: 2.00km | Pace: ${fmtPace(wucd)}/km`, `REPEAT ×${reps}:`, `  ON  — Time: 0:${String(onSec).padStart(2, "0")} | Pace: ${fmtPace(pace800)}/km`, `  OFF — Time: 1:00 | Pace: ${fmtPace(ep)}/km`, `COOL DOWN — Distance: 2.00km | Pace: ${fmtPace(ep)}/km`],
    }),

    overUnder: (sets) => ({
      wtype: "overunder", label: `${sets}×Over/Under KMs`,
      distance: to99(4 + sets * 2),
      estMins: 20 + Math.round(sets * 2 * 60 / Math.round((ep * 0.91 + ep * 1.06) / 2) * 60),
      summary: `WU 2km · ${sets}×(1km fast / 1km slow) · CD 2km`,
      detail: `Warm up 2km easy @ ${fmtPace(wucd)}/km.\n\n${sets} sets of alternating km blocks:\n• "Over" km: ${fmtPace(Math.round(ep * 0.91))}/km — faster than comfortable\n• "Under" km: ${fmtPace(Math.round(ep * 1.06))}/km — active recovery\n\nNo stopping between sets. Cool down 2km easy.`,
      garmin: [`WARM UP — Distance: 2.00km | Pace: ${fmtPace(wucd)}/km`, `REPEAT ×${sets}:`, `  OVER  — Distance: 1.00km | Pace: ${fmtPace(Math.round(ep * 0.91))}/km`, `  UNDER — Distance: 1.00km | Pace: ${fmtPace(Math.round(ep * 1.06))}/km`, `COOL DOWN — Distance: 2.00km | Pace: ${fmtPace(ep)}/km`],
    }),

    ladder: (steps) => {
      const s = steps || [3, 2, 1, 2, 3];
      const totalEffort = s.reduce((a, b) => a + b, 0);
      return {
        wtype: "ladder", label: `Ladder (${s.join("-")}min)`,
        distance: to99(4 + totalEffort * 60 / ip),
        estMins: 20 + totalEffort + (s.length - 1) * 2,
        summary: `WU 2km · ${s.map(x => x + "min").join("/")} @ ${fmtPace(ip)}/km · CD 2km`,
        detail: `Warm up 2km easy @ ${fmtPace(wucd)}/km.\n\nRun the ladder with 2min easy jog between efforts:\n${s.map(x => `• ${x}min @ ${fmtPace(ip)}/km`).join("\n")}\n\nCool down 2km easy.\n\nThe shortest effort is your peak — give it everything.`,
        garmin: [`WARM UP — Distance: 2.00km | Pace: ${fmtPace(wucd)}/km`, ...s.flatMap((x, idx) => [`EFFORT ${idx + 1} — Time: ${x}:00 | Pace: ${fmtPace(ip)}/km`, `REST    — Time: 2:00 | Easy jog`]), `COOL DOWN — Distance: 2.00km | Pace: ${fmtPace(ep)}/km`],
      };
    },

    progression: (totalMin) => ({
      wtype: "progression", label: `${totalMin}min Progression`,
      distance: to99(totalMin * 60 / Math.round((ep + tp) / 2)),
      estMins: totalMin,
      summary: `${totalMin}min — easy → building → tempo finish`,
      detail: `${totalMin}min continuous:\n\n• First ${Math.round(totalMin / 3)}min @ ${fmtPace(ep)}/km (easy)\n• Middle ${Math.round(totalMin / 3)}min @ ${fmtPace(Math.round((ep + tp) / 2))}/km (building)\n• Final ${Math.round(totalMin / 3)}min @ ${fmtPace(tp)}/km (tempo)\n\nHold back hard in the first third.`,
      garmin: [`EASY     — Time: ${Math.round(totalMin / 3)}:00 | Pace: ${fmtPace(ep)}/km`, `BUILDING — Time: ${Math.round(totalMin / 3)}:00 | Pace: ${fmtPace(Math.round((ep + tp) / 2))}/km`, `TEMPO    — Time: ${Math.round(totalMin / 3)}:00 | Pace: ${fmtPace(tp)}/km`],
    }),

    // ── Hills ───────────────────────────────────────────────

    hillSprints: (sets) => ({
      wtype: "hills", label: `${sets}×1min Hill Sprints`,
      distance: to99((40 + sets * 2.5) / 60 * (60 / wucd)),
      estMins: 40 + Math.round(sets * 2.5),
      summary: `WU 2km · ${sets}×1min max effort · walk back · CD 2km`,
      detail: `Warm up 2km easy @ ${fmtPace(wucd)}/km. Find a 5–8% grade hill.\n\n${sets}×1min max uphill sprint.\nWALK back down after each sprint (~90s) — this is your full recovery.\n\nCool down 2km easy.\n\nWalking back is not optional. Full recovery between reps is what makes these effective.`,
      garmin: [`WARM UP    — Distance: 2.00km | Pace: ${fmtPace(wucd)}/km`, `REPEAT ×${sets}:`, `  SPRINT    — Time: 1:00 | Effort: Maximum uphill`, `  WALK DOWN — Time: 1:30 | Walk back to start — full recovery`, `COOL DOWN  — Distance: 2.00km | Pace: ${fmtPace(ep)}/km`],
    }),

    hillRepeats: (sets) => ({
      wtype: "hills", label: `${sets}×2min Hill Efforts`,
      distance: to99((30 + sets * 4) / 60 * (60 / wucd)),
      estMins: 30 + sets * 4,
      summary: `WU 2km · ${sets}×2min hard uphill · walk back · CD 2km`,
      detail: `Warm up 2km easy @ ${fmtPace(wucd)}/km.\n\n${sets}×2min hard uphill effort at RPE 7–8.\nWalk back down to the start (~2min) as full recovery between reps.\n\nCool down 2km easy.\n\nRPE 7–8 means you could say a few words but not hold a conversation.`,
      garmin: [`WARM UP    — Distance: 2.00km | Pace: ${fmtPace(wucd)}/km`, `REPEAT ×${sets}:`, `  EFFORT    — Time: 2:00 | Hard uphill (RPE 7–8)`, `  WALK BACK — Time: 2:00 | Walk back to start — full recovery`, `COOL DOWN  — Distance: 2.00km | Pace: ${fmtPace(ep)}/km`],
    }),

    // ── Easy / long / social ────────────────────────────────

    bronieRun: () => ({
      wtype: "bronies", label: "BRONIES Run", distance: 7.99,
      estMins: Math.round(7.99 * ep / 60),
      summary: "7.99km · Little Black Pony Café",
      detail: `7.99km easy social run from the Little Black Pony Coffee Shop.\n\nConversational pace @ ${fmtPace(ep)}/km or slower.\nFinish on the .99. Always.\n\nCoffee after. Non-negotiable.`,
      garmin: [`Distance: 7.99km | Auto Lap every 1km`, `Pace: ≤${fmtPace(Math.round(ep * 0.94))}/km — conversational only`, `NOTE: Free-run mode recommended.`],
    }),

    easyRun: (min, withStrides = false) => {
      const m = min || 40;
      const dist = to99(m * 60 / Math.round(ep * 1.04));
      const stridePace = Math.round(ip * 0.95);
      const strideNote = withStrides
        ? `\n\nAfter your run: 4×20sec strides @ ${fmtPace(stridePace)}/km effort.\n• Accelerate smoothly over the first 5sec, hold for 10sec, decelerate for 5sec.\n• 60sec easy walk between each.\n• These should feel fast but controlled — not a sprint. Legs light, not heavy.\n• Done in 6–8min. Don't skip them.`
        : "";
      const strideGarmin = withStrides
        ? [`EASY RUN — Duration: ${m}:00 | Pace: ${fmtPace(ep)} – ${fmtPace(Math.round(ep * 1.15))}/km | Zone 1–2`, `STRIDES ×4:`, `  STRIDE — Time: 0:20 | Effort: fast & controlled (~${fmtPace(stridePace)}/km)`, `  WALK   — Time: 1:00 | Easy recovery walk`]
        : [`Duration: ${m}:00 | Pace: ${fmtPace(ep)} – ${fmtPace(Math.round(ep * 1.15))}/km | Zone 1–2`];
      return {
        wtype: "easy",
        label: withStrides ? `${m}min Easy + Strides` : `${m}min Easy Run`,
        distance: dist, estMins: withStrides ? m + 8 : m,
        summary: withStrides ? `${m}min easy · 4×20sec strides · ${dist}km` : `${m}min easy · ${dist}km`,
        detail: `${m}min easy aerobic run @ ${fmtPace(Math.round(ep * 1.04))}/km.\n\nFully conversational — you should be able to hold a full conversation.\nIf you're breathing hard, slow down.\n\nEasy runs are where most of your aerobic fitness is built. Don't skip them.` + strideNote,
        garmin: strideGarmin,
      };
    },

    longEasy: (km, isTrail, epOverride) => {
      const e = epOverride || ep;
      const d = to99(km);
      const mins = estimateLongRunTime(km, isTrail, e);
      return {
        wtype: "long", label: "Long Easy Run", distance: d, estMins: mins,
        summary: `${d}km easy · ${fmtDuration(mins)}`,
        detail: `${d}km at easy aerobic pace @ ${fmtPace(Math.round(e * 1.04))}/km or slower.\nEstimated moving time: ${fmtDuration(mins)}${isTrail ? " (trail — run by effort, walk steep climbs)" : ""}.\n\nTime on feet — no pace pressure. This is the cornerstone of the whole block.\nEat every 30–40min. Drink to thirst. Walk the hills if you need to.\n\nAlways finish on the .99.`,
        garmin: [`Distance: ${d}km | Auto Lap every 5km`, `Pace zone: ${fmtPace(e)} – ${fmtPace(Math.round(e * 1.15))}/km (Zone 1–2)`, `Nutrition alert: Every 30:00`, ...(isTrail ? [`NOTE: Run by effort on trail — ignore pace on climbs.`] : [])],
      };
    },

    longPaceBlocks: (km, epOverride, mpOverride) => {
      const e = epOverride || ep;
      const m = mpOverride || mp;
      const d = to99(km);
      const mins = estimateLongRunTime(km, false, e);
      return {
        wtype: "long", label: "Long Run — Pace Blocks", distance: d, estMins: mins,
        summary: `${d}km · easy → race pace → fast finish · ${fmtDuration(mins)}`,
        detail: `${d}km structured long run (${fmtDuration(mins)}):\n\n• First ${Math.round(km * 0.35)}km @ ${fmtPace(Math.round(e * 1.04))}/km (easy warm-in)\n• Middle ${Math.round(km * 0.40)}km @ ${fmtPace(m)}/km (goal race pace)\n• Final ${Math.round(km * 0.25)}km @ ${fmtPace(Math.round(m * 0.97))}/km (slightly faster)\n\nThe most race-specific long run in the block.`,
        garmin: [`EASY BLOCK  — Distance: ${Math.round(km * 0.35)}.00km | Pace: ${fmtPace(Math.round(e * 1.04))}/km`, `RACE PACE   — Distance: ${Math.round(km * 0.40)}.00km | Pace: ${fmtPace(m)}/km`, `FAST FINISH — Distance: ${Math.round(km * 0.25)}.00km | Pace: ${fmtPace(Math.round(m * 0.97))}/km`, `Auto Lap every 5km`],
      };
    },

    shakeout: (min) => {
      const m = min || 30;
      const dist = to99(m * 60 / Math.round(ep * 1.12));
      return {
        wtype: "easy", label: "Shakeout Run", distance: dist, estMins: m,
        summary: `${m}min very easy shakeout · ${dist}km`,
        detail: `${m}min easy jog @ ${fmtPace(Math.round(ep * 1.12))}/km or slower.\n\nLegs only — no effort, no pace targets.`,
        garmin: [`Duration: ${m}:00 | Pace: ≥${fmtPace(Math.round(ep * 1.08))}/km | Zone 1`],
      };
    },

    rest: () => ({
      wtype: "rest", label: "Rest Day", distance: 0, estMins: 0,
      summary: "Complete rest",
      detail: `Full rest day.\n\nSleep well. Eat enough. Stay hydrated.\nLight walking is fine — everything else can wait.\n\nRest is where the adaptation happens. Protect it.`,
      garmin: [`No workout today. Rest and recover.`],
    }),

    raceDay: (name, dist) => ({
      wtype: "race", label: "RACE DAY 🏁", distance: parseFloat(dist) || 0, estMins: null,
      summary: `${dist} · ${name}`,
      detail: `All the training is done. Trust the work.\n\nMorning checklist:\n• Wake 90–120min before start\n• Eat your practiced race-day breakfast\n• 5–10min easy shakeout jog + dynamic stretches\n• Arrive at start with time to spare\n\nRace execution:\n• First 20% — hold back, feel controlled\n• Middle 60% — settle into your rhythm\n• Final 20% — give everything that's left\n\nAlways finish on the .99.`,
      garmin: [`Race Day — use standard race recording.`, `Auto Lap every 5km.`, `Don't forget to press START.`],
    }),

  }; // end return
}
