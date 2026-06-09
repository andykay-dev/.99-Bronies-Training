// ─────────────────────────────────────────────────────────────
//  SCANNER ENGINE — extractNutrition.js
//  extractNutrition(text) → NutritionResult
//
//  Parses raw text from a scanned nutrition/product page and
//  returns structured nutrition data for use in the fuel
//  inventory (carbs per serving) and drink mix calculator.
//
//  Handles:
//   - Standard nutrition panels ("Total Carbohydrate 25g")
//   - Per-serve / per-100g labelling
//   - Electrolyte / drink mix panels (sodium, potassium)
//   - Product name extraction from page title area
// ─────────────────────────────────────────────────────────────

/** Pull a numeric value from a string like "25g", "25.4g", "25 g" */
function parseGrams(str) {
  if (!str) return null;
  const m = str.match(/([\d.]+)\s*g/i);
  return m ? parseFloat(m[1]) : null;
}

/** Pull a numeric value from a string like "250kJ", "60kcal", "250 kJ" */
function parseEnergy(str) {
  if (!str) return null;
  const kj  = str.match(/([\d.]+)\s*kj/i);
  const cal  = str.match(/([\d.]+)\s*k?cal/i);
  if (kj)  return { value: parseFloat(kj[1]),  unit: "kJ"   };
  if (cal) return { value: parseFloat(cal[1]), unit: "kcal" };
  return null;
}

/** Pull sodium in mg */
function parseMg(str) {
  if (!str) return null;
  const m = str.match(/([\d.]+)\s*mg/i);
  return m ? parseFloat(m[1]) : null;
}

/**
 * Try to detect whether numbers are per-serve or per-100g.
 * Returns "per_serve" | "per_100g" | "unknown"
 */
function detectBasis(text) {
  const lower = text.toLowerCase();
  if (/per\s*serv/i.test(lower))  return "per_serve";
  if (/per\s*100\s*g/i.test(lower)) return "per_100g";
  return "unknown";
}

/**
 * Find a value on the same line as a keyword, or on the next line.
 */
function findValue(lines, keyword) {
  const kw = keyword.toLowerCase();
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (lower.includes(kw)) {
      // Try same line first
      const sameLineMatch = lines[i].match(/([\d.]+\s*(?:g|mg|kj|kcal|cal))/i);
      if (sameLineMatch) return sameLineMatch[1];
      // Try next line
      if (i + 1 < lines.length) {
        const nextMatch = lines[i + 1].match(/([\d.]+\s*(?:g|mg|kj|kcal|cal))/i);
        if (nextMatch) return nextMatch[1];
      }
    }
  }
  return null;
}

/**
 * Try to extract the product name from the first few lines.
 */
function extractProductName(lines) {
  // Look for the first non-empty line that's not a number or nutrition label
  const SKIP = /^(nutrition|serving|per|amount|energy|protein|fat|carb|sodium|sugar|total|calories|fibre|fiber)/i;
  for (const line of lines.slice(0, 20)) {
    const clean = line.trim();
    if (!clean || SKIP.test(clean)) continue;
    if (clean.length < 3 || clean.length > 80) continue;
    if (/^\d/.test(clean)) continue; // starts with a number
    return clean;
  }
  return null;
}

/**
 * @param {string} text  Raw text from a scanned product/nutrition page.
 * @returns {NutritionResult}
 *
 * NutritionResult:
 *   { productName, carbsG, sugarG, sodiumMg, potassiumMg,
 *     energyKj, energyKcal, proteinG, fatG,
 *     basis, servingSizeG, confidence, raw }
 */
export function extractNutrition(text) {
  const lines  = text.split("\n").map(l => l.trim()).filter(Boolean);
  const joined = lines.join(" ");

  const productName = extractProductName(lines);
  const basis       = detectBasis(text);

  // ── Carbohydrates ─────────────────────────────────────────
  // Look for "Total Carbohydrate", "Carbohydrate", "Carbs", "Total Carbs"
  const carbRaw = findValue(lines, "total carbohydrate")
               || findValue(lines, "carbohydrate")
               || findValue(lines, "total carbs")
               || findValue(lines, "carbs");
  const carbsG = parseGrams(carbRaw);

  // ── Sugars ────────────────────────────────────────────────
  const sugarRaw = findValue(lines, "sugars") || findValue(lines, "sugar");
  const sugarG   = parseGrams(sugarRaw);

  // ── Sodium ────────────────────────────────────────────────
  const sodiumRaw = findValue(lines, "sodium");
  const sodiumMg  = parseMg(sodiumRaw) ?? (parseGrams(sodiumRaw) != null ? parseGrams(sodiumRaw) * 1000 : null);

  // ── Potassium ─────────────────────────────────────────────
  const potassiumRaw = findValue(lines, "potassium");
  const potassiumMg  = parseMg(potassiumRaw);

  // ── Energy ────────────────────────────────────────────────
  const energyRaw = findValue(lines, "energy") || findValue(lines, "calories");
  const energy    = parseEnergy(energyRaw || "");
  const energyKj   = energy?.unit === "kJ"   ? energy.value : null;
  const energyKcal = energy?.unit === "kcal" ? energy.value
    : energyKj ? Math.round(energyKj / 4.184) : null;

  // ── Protein / Fat ─────────────────────────────────────────
  const proteinG = parseGrams(findValue(lines, "protein"));
  const fatG     = parseGrams(findValue(lines, "total fat") || findValue(lines, "fat"));

  // ── Serving size ──────────────────────────────────────────
  const servingMatch = joined.match(/serving\s*size[:\s]*([\d.]+\s*g)/i);
  const servingSizeG = servingMatch ? parseGrams(servingMatch[1]) : null;

  // ── Confidence ────────────────────────────────────────────
  // How sure are we this is a real nutrition panel?
  const fieldsFound = [carbsG, sodiumMg, proteinG, fatG, energyKj].filter(v => v !== null).length;
  const confidence  = fieldsFound >= 3 ? "high" : fieldsFound >= 1 ? "medium" : "low";

  return {
    productName,
    carbsG,
    sugarG,
    sodiumMg,
    potassiumMg,
    energyKj,
    energyKcal,
    proteinG,
    fatG,
    basis,
    servingSizeG,
    confidence,
  };
}
