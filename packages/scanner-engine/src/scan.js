// ─────────────────────────────────────────────────────────────
//  SCANNER ENGINE — scan.js
//  processScan(apiResponse, intent) → ScanResult
//
//  Takes the raw response from /api/scan and routes it through
//  the correct extractor based on intent.
//
//  This is the only function App.jsx needs to call after
//  getting back a response from the scan API.
// ─────────────────────────────────────────────────────────────

import { extractNutrition }       from "./extractNutrition.js";
import { parseAidStations,
         parseBulkCheckpoints }   from "../../race-engine/src/parseAidStations.js";

/**
 * @typedef {object} ScanResult
 * @property {"race_aid_stations"|"nutrition"|"general"} intent
 * @property {object|null} data      — structured extracted data (intent-specific)
 * @property {string[]}    warnings  — non-fatal issues
 * @property {string|null} error     — fatal error message, if any
 * @property {string}      rawText   — the raw text from the server (always present)
 * @property {string}      hostname  — source hostname for attribution
 */

/**
 * Process a successful scan API response into structured data.
 *
 * @param {{ ok: boolean, text: string, intent: string, hostname: string, error?: string, hint?: string, isPdf?: boolean }} apiResponse
 * @returns {ScanResult}
 */
export function processScan(apiResponse) {
  // Pass through server-side errors
  if (!apiResponse.ok) {
    return {
      intent:   apiResponse.intent || "general",
      data:     null,
      warnings: [],
      error:    apiResponse.hint || apiResponse.error || "Scan failed",
      rawText:  "",
      hostname: apiResponse.hostname || "",
    };
  }

  const { text, intent, hostname } = apiResponse;
  const warnings = [];

  // ── Route by intent ──────────────────────────────────────
  let data = null;

  if (intent === "race_aid_stations") {
    // Try the structured parser first (handles full race guide format)
    const structured = parseAidStations(text);
    if (structured.legs.length > 0) {
      data = structured;
      warnings.push(...structured.errors);
    } else {
      // Fall back to the bulk/loose parser
      const bulk = parseBulkCheckpoints(text);
      if (bulk.legs.length > 0) {
        data = bulk;
        warnings.push(...bulk.errors);
        warnings.push("Used loose parser — check leg distances and gains are correct.");
      } else {
        // Nothing found — return raw text so the user can paste manually
        data = { legs: [], stations: null };
        warnings.push(
          "Couldn't automatically extract checkpoints from this page.",
          "The raw text is shown below — you can copy the relevant section and use 'Paste race guide' instead."
        );
      }
    }
  }

  else if (intent === "nutrition") {
    data = extractNutrition(text);
    if (data.confidence === "low") {
      warnings.push("Couldn't find a clear nutrition panel. Check the values and correct any that look wrong.");
    }
    if (data.carbsG === null) {
      warnings.push("Carbohydrate value not found — you'll need to enter it manually.");
    }
  }

  else {
    // General — just return the raw text
    data = { text };
  }

  return {
    intent,
    data,
    warnings,
    error:   null,
    rawText: text,
    hostname,
  };
}
