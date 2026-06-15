// ─────────────────────────────────────────────────────────────
//  parseWorkout.js
//  parseWorkoutText(text) → { name, steps, errors }
//
//  Converts plain-language workout descriptions into a structured
//  AST that the Garmin workout builder can consume.
//
//  Supported syntax (one segment per line):
//
//  DISTANCE + PACE
//    2km warmup @6:00
//    400m @ 4:00
//    1mi @ 5:30
//
//  DISTANCE + EFFORT KEYWORD (no pace)
//    400m hard
//    1km easy
//    200m float
//
//  TIME-BASED
//    2min rest
//    90sec rest
//    90s recovery
//
//  REPEATS (wraps the segments on the same line in a RepeatGroup)
//    10x 400m @4:00 with 90s rest
//    3x (1km hard @4:15, 1km easy @5:15, 400m hard @3:45, 2min rest)
//
//  SEGMENT TYPES (inferred from keywords or position)
//    warmup / warm up / wu
//    cooldown / cool down / cd
//    hard / interval / rep / fast → interval
//    easy / float / jog / recovery / recover → recovery
//    rest → rest
//    (default: interval)
//
//  PACE FORMATS
//    @4:15   → 4min 15sec per km
//    @4:15/km
//    @4.25   → treated as min:sec (4:15)
//
//  OUTPUT: ParsedStep[]
//    { kind: "warmup"|"cooldown"|"interval"|"recovery"|"rest"|"repeat",
//      distM?: number, durationSec?: number,
//      paceSecKm?: number, paceLabel?: string,
//      effort?: string,         ← raw effort keyword for display
//      desc?: string,           ← human label
//      reps?: number,           ← repeat only
//      children?: ParsedStep[]  ← repeat only
//    }
// ─────────────────────────────────────────────────────────────

// ── Pace parsing ────────────────────────────────────────────

/**
 * Parse a pace string like "4:15", "4:15/km", "6:00" → seconds per km.
 */
export function parsePaceStr(str) {
  if (!str) return null;
  const s = str.trim().replace(/\/km$/i, "").replace(/^@/, "");
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  // decimal like "4.25" → not a valid pace, skip
  return null;
}

/** Format seconds-per-km back to "4:15" */
export function fmtPaceStr(secPerKm) {
  if (!secPerKm) return "";
  const m = Math.floor(secPerKm / 60);
  const s = String(secPerKm % 60).padStart(2, "0");
  return `${m}:${s}`;
}

// ── Distance parsing ─────────────────────────────────────────

/**
 * Parse a distance token like "400m", "2km", "1mi", "1.5km" → metres.
 */
function parseDistStr(str) {
  if (!str) return null;
  const s = str.trim().toLowerCase();
  const km  = s.match(/^([\d.]+)\s*km$/);
  if (km)  return Math.round(parseFloat(km[1]) * 1000);
  const m   = s.match(/^([\d.]+)\s*m$/);
  if (m)   return Math.round(parseFloat(m[1]));
  const mi  = s.match(/^([\d.]+)\s*mi(?:le)?s?$/);
  if (mi)  return Math.round(parseFloat(mi[1]) * 1609);
  return null;
}

// ── Duration parsing ─────────────────────────────────────────

/**
 * Parse a duration token like "90s", "90sec", "2min", "1:30" → seconds.
 */
function parseDurStr(str) {
  if (!str) return null;
  const s = str.trim().toLowerCase();
  const ms  = s.match(/^([\d.]+)\s*(?:min|m)(?:ute)?s?$/);
  if (ms)  return Math.round(parseFloat(ms[1]) * 60);
  const sec = s.match(/^([\d.]+)\s*(?:s|sec|second)s?$/);
  if (sec) return Math.round(parseFloat(sec[1]));
  const mm  = s.match(/^(\d{1,2}):(\d{2})$/);
  if (mm)  return parseInt(mm[1], 10) * 60 + parseInt(mm[2], 10);
  return null;
}

// ── Step type inference ──────────────────────────────────────

/**
 * Infer the Garmin step type from keyword and position context.
 * position: "first" | "last" | "middle"
 */
function inferKind(tokens, position) {
  const joined = tokens.join(" ").toLowerCase();
  if (/\bwarm[\s-]?up\b|\bwu\b|\bwarmup\b/.test(joined)) return "warmup";
  if (/\bcool[\s-]?down\b|\bcd\b|\bcooldown\b/.test(joined)) return "cooldown";
  if (/\brest\b/.test(joined)) return "rest";
  if (/\brecovery\b|\brecover\b|\bfloat\b/.test(joined)) return "recovery";
  if (/\beasy\b|\bjog\b/.test(joined)) return "recovery";
  if (/\bhard\b|\bfast\b|\binterval\b|\brep\b/.test(joined)) return "interval";
  // Position-based fallback
  if (position === "first") return "warmup";
  if (position === "last")  return "cooldown";
  return "interval";
}

/** Extract the effort keyword for display purposes */
function extractEffort(str) {
  const s = str.toLowerCase();
  if (/hard|fast/.test(s)) return "hard";
  if (/easy|jog/.test(s))  return "easy";
  if (/float/.test(s))     return "float";
  if (/recovery|recover/.test(s)) return "recovery";
  return null;
}

// ── Pace zone widening ────────────────────────────────────────

/**
 * Given a target pace, produce [slowSecKm, fastSecKm] zone ±5–8%.
 * Garmin uses a zone window; targeting exact pace = narrow 5s either side.
 */
export function paceZone(targetSecKm) {
  if (!targetSecKm) return [null, null];
  const margin = Math.max(5, Math.round(targetSecKm * 0.03)); // 3% or 5s minimum
  return [targetSecKm + margin, targetSecKm - margin];
}

// ── Single-line segment parser ────────────────────────────────

/**
 * Parse a single segment (non-repeat) line into a ParsedStep.
 * Returns null if line looks empty or unparseable.
 *
 * @param {string} line
 * @param {"first"|"last"|"middle"} position
 * @returns {ParsedStep|null}
 */
function parseSegment(line, position = "middle") {
  const s = line.trim();
  if (!s) return null;

  // Extract pace (@4:15 or @4:15/km)
  let paceSecKm = null;
  let paceLabel = null;
  const paceMatch = s.match(/@([\d:]+(?:\/km)?)/i);
  if (paceMatch) {
    paceSecKm = parsePaceStr(paceMatch[1]);
    paceLabel = fmtPaceStr(paceSecKm);
  }
  const clean = s.replace(/@[\d:/a-z]+/gi, "").trim();

  // Try distance
  const distMatch = clean.match(/^([\d.]+\s*(?:km|m|mi(?:le)?s?))\b/i);
  if (distMatch) {
    const distM = parseDistStr(distMatch[1]);
    if (distM !== null) {
      const rest = clean.slice(distMatch[0].length).trim();
      const kind = inferKind([rest || clean], position);
      const effort = extractEffort(rest || clean);
      const distLabel = distM >= 1000 ? `${distM / 1000}km` : `${distM}m`;
      const desc = paceLabel
        ? `${distLabel} @ ${paceLabel}/km`
        : effort
          ? `${distLabel} ${effort}`
          : distLabel;
      return { kind, distM, durationSec: null, paceSecKm, paceLabel, effort, desc };
    }
  }

  // Try duration first (e.g. "2min rest", "90s recovery")
  const durMatch = clean.match(/^([\d.]+\s*(?:min|m(?:inute)?s?|s(?:ec(?:ond)?)?s?|\d+:\d+))\b/i);
  if (durMatch) {
    const durationSec = parseDurStr(durMatch[1]);
    if (durationSec !== null) {
      const rest = clean.slice(durMatch[0].length).trim();
      const kind = inferKind([rest || clean], position);
      const durLabel = durationSec >= 60
        ? `${Math.floor(durationSec/60)}min${durationSec%60 ? ` ${durationSec%60}s` : ""}`
        : `${durationSec}s`;
      const desc = paceLabel ? `${durLabel} @ ${paceLabel}/km` : `${durLabel} ${kind}`;
      return { kind, distM: null, durationSec, paceSecKm, paceLabel, effort: extractEffort(rest), desc };
    }
  }

  // Couldn't parse a distance or duration — return a label-only stub
  return { kind: inferKind([clean], position), distM: null, durationSec: null,
           paceSecKm, paceLabel, effort: null, desc: clean };
}

// ── Repeat line parser ────────────────────────────────────────

/**
 * Detect and parse a repeat line.
 *
 * Formats:
 *   10x 400m @4:00 with 90s rest
 *   3x (1km hard @4:15, 1km easy @5:15, 400m hard @3:45, 2min rest)
 *   Repeat 5 times: 1km @4:00, 90s rest
 *
 * Returns { reps, children: ParsedStep[] } or null.
 */
function parseRepeatLine(line) {
  const s = line.trim();

  // Match "Nx ...", "N× ...", "N times ...", "Repeat N ..." — MUST have explicit repeat marker
  const repMatch = s.match(/^(?:repeat\s+)?(\d+)\s*(?:[x×]|times)\s*:?\s*/i);
  if (!repMatch) return null;

  const reps = parseInt(repMatch[1], 10);
  if (reps < 2 || reps > 50) return null;

  let body = s.slice(repMatch[0].length).trim();

  // Strip outer parens if present
  if (body.startsWith("(") && body.endsWith(")")) {
    body = body.slice(1, -1).trim();
  }

  // Extract trailing "with Xs rest" / "with Xmin rest" BEFORE splitting on commas
  // e.g. "10x 400m @4:00 with 90s rest" → interval + rest child
  let trailingRest = null;
  const withRestMatch = body.match(/\s+with\s+([\d.]+\s*(?:s(?:ec(?:ond)?)?s?|min(?:ute)?s?))\s*(?:rest|recovery|standing\s*rest)?\s*$/i);
  if (withRestMatch) {
    const restSec = parseDurStr(withRestMatch[1]);
    if (restSec !== null) {
      const durLabel = restSec >= 60
        ? `${Math.floor(restSec/60)}min${restSec % 60 ? ` ${restSec%60}s` : ""} rest`
        : `${restSec}s rest`;
      trailingRest = { kind:"recovery", distM:null, durationSec:restSec,
                       paceSecKm:null, paceLabel:null, effort:null, desc:durLabel };
      body = body.slice(0, withRestMatch.index).trim();
    }
  }

  // Split body on commas or semicolons
  const parts = body
    .split(/,|;/)
    .map(p => p.trim())
    .filter(Boolean);

  if (parts.length === 0 && !trailingRest) return null;

  const children = parts.map(p => parseSegment(p, "middle")).filter(Boolean);
  if (trailingRest) children.push(trailingRest);

  if (children.length === 0) return null;

  return { reps, children };
}

// ── Main parser ───────────────────────────────────────────────

/**
 * Parse a full workout text into a structured step list.
 *
 * @param {string} text
 * @returns {{ name: string, steps: ParsedStep[], errors: string[] }}
 */
export function parseWorkoutText(text) {
  const errors = [];
  if (!text || !text.trim()) {
    return { name: "Workout", steps: [], errors: ["No workout text provided."] };
  }

  const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // First line might be a workout name.
  // Treat it as a name unless it clearly parses as a workout step:
  //   - Has a pace zone:  @4:15
  //   - Is a valid repeat line: "10x 800m @4:00 with 90s rest"
  //   - Contains a bare distance+unit that would parse: "2km", "400m"
  //   - Contains a bare duration: "2min", "90s"
  // Titles like "10×800m Reps" or "Lactate Float Set" are NOT steps.
  let name = "Custom Workout";
  let startIdx = 0;
  const firstLine = rawLines[0] || "";
  const hasPace    = /@[\d:]/.test(firstLine);
  const hasDurUnit = /\b\d+\s*(?:sec|second|min(?:ute)?)\b/i.test(firstLine)
    && !/[x×]/i.test(firstLine); // "Fartlek 5×2min" has min but it's part of the title format
  // Bare distance = digit+unit where the NEXT token is a pace, effort keyword, or end-of-word
  const hasBareKm  = /\b\d+(?:\.\d+)?\s*km\b/i.test(firstLine);
  const hasBareM   = /\b\d+\s*m\b(?!\w)/.test(firstLine);  // e.g. "400m" but not "mins"
  const isStep = hasPace || hasDurUnit
    || (hasBareKm && !/reps?|speed|session|set|workout|run|day/i.test(firstLine))
    || (hasBareM  && !/reps?|speed|session|set|workout|run|day/i.test(firstLine));
  if (!isStep) {
    name = firstLine;
    startIdx = 1;
  }

  const lines = rawLines.slice(startIdx);
  const steps = [];

  lines.forEach((line, idx) => {
    const position = idx === 0 ? "first" : idx === lines.length - 1 ? "last" : "middle";

    // Try repeat first
    const repeat = parseRepeatLine(line);
    if (repeat) {
      steps.push({
        kind: "repeat",
        reps: repeat.reps,
        children: repeat.children,
        desc: `Repeat ${repeat.reps}×`,
      });
      return;
    }

    // Single segment
    const seg = parseSegment(line, position);
    if (seg) {
      steps.push(seg);
    } else {
      errors.push(`Line ${idx + 1}: couldn't parse "${line}"`);
    }
  });

  if (steps.length === 0) {
    errors.push("No workout steps could be parsed.");
  }

  return { name, steps, errors };
}
