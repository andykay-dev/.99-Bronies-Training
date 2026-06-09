// ─────────────────────────────────────────────────────────────
//  ENGINE CORE — scheduler.js
//  Calendar / date helpers shared by every Bronies engine.
//  All weeks are Monday-anchored.
//  Engine-specific scheduling (phase maps, down-week detection,
//  peak-week identification) lives in each engine package.
//  Pure functions — same inputs → same outputs.
// ─────────────────────────────────────────────────────────────

/** Parse a YYYY-MM-DD string as local midnight (not UTC midnight). */
export function parseLocalDate(s) {
  if (!s) return null;
  if (s instanceof Date) return isNaN(s) ? null : new Date(s);
  if (typeof s !== "string") return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/** Return the Monday of the week containing `date`. */
export function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Total Monday-anchored weeks between two YYYY-MM-DD strings.
 * Used to lock plan length to the original start date so past weeks stay visible.
 */
export function weeksBetween(fromDateStr, toDateStr) {
  const a = parseLocalDate(fromDateStr);
  const b = parseLocalDate(toDateStr);
  if (!a || !b) return 16;
  const aMonday = mondayOf(a);
  const bMonday = mondayOf(b);
  return Math.max(1, Math.round((bMonday - aMonday) / (1000 * 60 * 60 * 24 * 7)));
}

/**
 * Monday date-string for week offset `i` from an anchor date.
 * i=0 → anchor's Monday, i=1 → next Monday, etc.
 */
export function dateFromAnchor(anchorStr, i) {
  const anchor = parseLocalDate(anchorStr);
  if (!anchor) return dateFromToday(i);
  const monday = mondayOf(anchor);
  monday.setDate(monday.getDate() + i * 7);
  return toDateStr(monday);
}

/**
 * Monday date-string for week offset `w` from the current week's Monday.
 * @param {Date} [todayMonday] - inject for deterministic tests
 */
export function dateFromToday(w, todayMonday) {
  const base = todayMonday || mondayOf(new Date());
  const d = new Date(base);
  d.setDate(d.getDate() + w * 7);
  return toDateStr(d);
}

/** Format a Date as YYYY-MM-DD. */
export function toDateStr(d) {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Returns "YYYY-MM-DD" for today in Sydney time (UTC+10/+11). */
export function todaySydney() {
  const d = new Date(new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney" }));
  return toDateStr(d);
}

/** Format YYYY-MM-DD as a human-readable date (en-AU locale). */
export function fmtDate(s) {
  if (!s) return "";
  const d = parseLocalDate(s);
  if (!d) return "";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Returns "past" | "current" | "future" for a week given its Monday date-string.
 * @param {Date} [today] - inject for deterministic tests
 */
export function weekStatus(startDate, today) {
  const now = today || new Date();
  if (!startDate) return "future";
  const start = parseLocalDate(startDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  if (now > end) return "past";
  if (now >= start) return "current";
  return "future";
}

/** Returns the Date for a specific day within a week (0=Mon … 6=Sun). */
export function dayDate(weekStartDate, dayIndex) {
  const start = parseLocalDate(weekStartDate);
  if (!start) return null;
  start.setDate(start.getDate() + dayIndex);
  return start;
}

/**
 * Cumulative feedback adjustment (±km) up to week `wn`.
 * Feedback values: "too_hard" | "too_easy" | "ok".
 * Shared because both engines use the same feedback loop semantics.
 * @returns {number} adjustment in km, clamped to [-6, +8]
 */
export function computeFeedbackAdj(feedbackMap, wn) {
  let adj = 0;
  for (let w = 1; w < wn; w++) {
    const fb = (feedbackMap || {})[w];
    if (fb === "too_hard") adj -= 1.5;
    if (fb === "too_easy") adj += 1.5;
    if (fb === "ok")       adj  = Math.max(0, adj * 0.5);
  }
  return Math.max(-6, Math.min(8, adj));
}
