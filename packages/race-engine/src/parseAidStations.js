// ─────────────────────────────────────────────────────────────
//  BULK CHECKPOINT PARSER
//  parseBulkCheckpoints(text) → ParseResult
//
//  Accepts loose free-text — one checkpoint per line.
//  Each line can be in any of these forms:
//
//    Name, km, gain           → "Dairyville, 14.9, 400"
//    Name, km, +gain          → "Dairyville, 14.9km, +400m"
//    Name km +gain            → "Bangalore Road 5.6km +525m"
//    Name - km - gain         → "Urumbilum Creek - 6.1km - 230m"
//    Name | km | gain         → "Finish | 3.8km | +35m"
//
//  The only hard requirements per line:
//    - At least one token that looks like a distance (digits + optional km/k)
//    - Everything before the first number-looking token is the name
//    - A second number-looking token is the elevation gain (optional)
//
//  Lines that can't yield a positive km are skipped with a warning.
// ─────────────────────────────────────────────────────────────

/**
 * Try to extract a positive km value from a token.
 * Accepts: "14.9", "14.9km", "14.9k", "14900m" (converts m→km if > 999).
 */
function tokenToKm(token) {
  const mMatch = token.match(/^[+-]?([\d,]+\.?\d*)\s*m$/i);
  if (mMatch) {
    const metres = parseNum(mMatch[1]);
    // Only treat as km-equivalent if it's clearly a distance, not elevation
    // Distances > 999m are implausible as a section length in metres
    return metres > 999 ? metres / 1000 : NaN;
  }
  const kmMatch = token.match(/^[+-]?([\d,]+\.?\d*)\s*(?:km?)?$/i);
  if (kmMatch) return parseNum(kmMatch[1]);
  return NaN;
}

/**
 * Try to extract an elevation gain value in metres from a token.
 * Accepts: "400", "+400", "+400m", "400m".
 */
function tokenToGainM(token) {
  const m = token.match(/^[+-]?([\d,]+\.?\d*)\s*m?$/i);
  if (!m) return NaN;
  const val = parseNum(m[1]);
  // Reject values that look like km distances (> 200km is implausible gain per section)
  return val <= 9999 ? val : NaN;
}

/**
 * Split a line into tokens, treating commas and pipes as separators.
 * Dashes are only treated as separators when surrounded by spaces ( - ),
 * so "Aid 1" stays together but "Aid 1 - 10km" splits at the dash.
 */
function tokeniseLine(line) {
  return line
    .replace(/[|,]/g, " ")             // commas and pipes always separate
    .replace(/\s+-+\s+/g, " ")         // " - " or " -- " as separator
    .replace(/\u2013|\u2014/g, " ")    // en-dash / em-dash
    .split(/\s+/)
    .map(t => t.trim())
    .filter(Boolean);
}

/**
 * Parse a single line into { name, km, gainM } or null.
 *
 * Strategy:
 *  1. First try to find a token with an explicit km/k suffix → that's the distance.
 *  2. If none found, fall back to the first positive numeric token.
 * This means "Aid 1 - 10km" picks "10km" not "1".
 */
function parseLine(line) {
  const tokens = tokeniseLine(line);
  if (tokens.length === 0) return null;

  // Pass 1 — find a token with explicit km suffix
  let kmIdx = -1;
  let km = NaN;
  for (let i = 0; i < tokens.length; i++) {
    if (/^[+-]?[\d,]+\.?\d*\s*km?$/i.test(tokens[i])) {
      const candidate = tokenToKm(tokens[i]);
      if (!isNaN(candidate) && candidate > 0) {
        km = candidate;
        kmIdx = i;
        break;
      }
    }
  }

  // Pass 2 — fall back to first positive bare number if no km-suffixed token found
  if (kmIdx === -1) {
    for (let i = 0; i < tokens.length; i++) {
      const candidate = tokenToKm(tokens[i]);
      if (!isNaN(candidate) && candidate > 0) {
        km = candidate;
        kmIdx = i;
        break;
      }
    }
  }

  if (kmIdx === -1 || isNaN(km)) return null;

  // Name = everything before the km token, re-joined
  const nameParts = tokens.slice(0, kmIdx);
  const name = nameParts.join(" ").replace(/[-–—:]+$/, "").trim();
  if (!name) return null;

  // Gain = look for a token after km that matches an elevation
  let gainM = 0;
  for (let i = kmIdx + 1; i < tokens.length; i++) {
    const candidate = tokenToGainM(tokens[i]);
    if (!isNaN(candidate) && candidate >= 0) {
      gainM = candidate;
      break;
    }
  }

  return { name, km: Math.round(km * 10) / 10, gainM };
}

/**
 * @param {string} text  One checkpoint per line, loose format.
 * @returns {{ legs: Leg[], stations: null, errors: string[] }}
 */
export function parseBulkCheckpoints(text) {
  const errors = [];
  const legs   = [];

  if (!text || !text.trim()) {
    return { legs: [], stations: null, errors: ["No text provided."] };
  }

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  // Skip heading-style lines that don't contain any digits
  const dataLines = lines.filter(l => /\d/.test(l));

  if (dataLines.length === 0) {
    return { legs: [], stations: null, errors: ["No lines with distance data found."] };
  }

  dataLines.forEach((line, idx) => {
    const parsed = parseLine(line);
    if (!parsed) {
      errors.push(`Line ${idx + 1} skipped — couldn't parse: "${line}"`);
      return;
    }
    legs.push({
      name:   parsed.name,
      km:     parsed.km,
      gainM:  parsed.gainM,
      stock:  "",
      cutoff: null,
      services: { supportCrew:false, pacers:false, dropBags:false, toilet:false },
    });
  });

  if (legs.length === 0) {
    errors.push("No checkpoints could be parsed. Check the format — each line needs a name and a distance.");
  }

  return { legs, stations: null, errors };
}

//  parseAidStations(text) → ParseResult
//
//  Converts pasted race-briefing text (aid station tables from
//  race websites / PDFs) into the leg array shape used by
//  generateRacePlan() and the Race Day screen in App.jsx.
//
//  Input format (each station block):
//
//    Water Point | Dairyville (1) | 14.8km
//    Section Stats: 14.9km | +400m | -765m
//    Cumulative Stats: 14.8km | +400m | -765m
//    Cut-off: 8:50am | 2 hour 20 minutes
//    Support Crew: ✅ / ❌
//    Pacers: ✅ / ❌
//    Drop Bags: ✅ / ❌
//    Toilet: ✅ / ❌
//
//  Returns:
//    {
//      legs:     Leg[],          // ready to drop into race.legs
//      stations: Station[],      // full parsed data for display
//      errors:   string[],       // non-fatal warnings
//    }
//
//  Leg shape (matches DEFAULT_LEG / computeLegFuelling input):
//    { name, km, gainM, stock, cutoff, services }
//
//  Station shape (superset of Leg with all parsed fields):
//    { type, name, cumKm, sectionKm, sectionGainM, sectionDropM,
//      cumGainM, cumDropM, cutoffTime, cutoffDuration,
//      supportCrew, pacers, dropBags, toilet }
// ─────────────────────────────────────────────────────────────

/**
 * Parse a number that may contain commas (e.g. "1,195").
 * Returns NaN if unparseable.
 */
function parseNum(str) {
  if (!str) return NaN;
  return parseFloat(str.replace(/,/g, "").trim());
}

/**
 * Parse a distance string like "14.8km", "5km", "1km".
 * Returns the numeric value in km, or NaN.
 */
function parseKm(str) {
  if (!str) return NaN;
  const m = str.trim().match(/^([\d,]+\.?\d*)\s*km$/i);
  return m ? parseNum(m[1]) : NaN;
}

/**
 * Parse an elevation string like "+400m", "-765m", "+1,195m".
 * Returns signed numeric metres, or NaN.
 */
function parseElevM(str) {
  if (!str) return NaN;
  const m = str.trim().match(/^([+-]?)([\d,]+\.?\d*)\s*m$/i);
  if (!m) return NaN;
  const val = parseNum(m[2]);
  return m[1] === "-" ? -val : val;
}

/**
 * Parse a boolean from ✅ / ❌ / yes / no / true / false.
 */
function parseBool(str) {
  if (!str) return false;
  const s = str.trim();
  if (s === "✅" || /^yes$/i.test(s) || /^true$/i.test(s)) return true;
  return false;
}

/**
 * Split text into station blocks.
 * A new block starts on a line that matches the header pattern:
 *   (Water Point | Aid Station | Finish) | <name> | <km>
 */
function splitBlocks(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // Header line detection — must contain pipes and a km marker
    const isHeader = /^(water\s*point|aid\s*station|finish)\s*\|/i.test(line)
      && /\|\s*[\d,]+\.?\d*\s*km/i.test(line);

    if (isHeader) {
      if (current) blocks.push(current);
      current = [line];
    } else if (current) {
      current.push(line);
    }
    // Lines before first header are ignored (e.g. "Aid Stations & Water Points")
  }
  if (current) blocks.push(current);
  return blocks;
}

/**
 * Parse a single block (array of lines) into a Station object.
 */
function parseBlock(lines) {
  const station = {
    type:            "unknown",
    name:            "",
    cumKm:           0,
    sectionKm:       0,
    sectionGainM:    0,
    sectionDropM:    0,
    cumGainM:        0,
    cumDropM:        0,
    cutoffTime:      null,
    cutoffDuration:  null,
    supportCrew:     false,
    pacers:          false,
    dropBags:        false,
    toilet:          false,
  };

  for (const line of lines) {
    // ── Header line ─────────────────────────────────────────
    // e.g. "Water Point | Dairyville (1) | 14.8km"
    // e.g. "Aid Station | Bangalore Road (1) | 21.4km"
    // e.g. "Finish | Ulong | 50km"
    const headerMatch = line.match(
      /^(water\s*point|aid\s*station|finish)\s*\|\s*(.+?)\s*\|\s*([\d,]+\.?\d*)\s*km/i
    );
    if (headerMatch) {
      const typeRaw = headerMatch[1].trim().toLowerCase();
      station.type  = typeRaw.startsWith("water") ? "water_point"
                    : typeRaw === "finish"         ? "finish"
                    :                               "aid_station";
      station.name  = headerMatch[2].trim();
      station.cumKm = parseNum(headerMatch[3]);
      continue;
    }

    // ── Section Stats ────────────────────────────────────────
    // e.g. "Section Stats: 14.9km | +400m | -765m"
    const sectionMatch = line.match(
      /section\s*stats\s*:\s*([\d,]+\.?\d*\s*km)\s*\|\s*([+-]?[\d,]+\.?\d*\s*m)\s*\|\s*([+-]?[\d,]+\.?\d*\s*m)/i
    );
    if (sectionMatch) {
      station.sectionKm    = parseKm(sectionMatch[1]);
      const g = parseElevM(sectionMatch[2]);
      const d = parseElevM(sectionMatch[3]);
      station.sectionGainM = Math.abs(isNaN(g) ? 0 : g);
      station.sectionDropM = Math.abs(isNaN(d) ? 0 : d);
      continue;
    }

    // ── Cumulative Stats ─────────────────────────────────────
    // e.g. "Cumulative Stats: 14.8km | +400m | -765m"
    const cumMatch = line.match(
      /cumulative\s*stats\s*:\s*([\d,]+\.?\d*\s*km)\s*\|\s*([+-]?[\d,]+\.?\d*\s*m)\s*\|\s*([+-]?[\d,]+\.?\d*\s*m)/i
    );
    if (cumMatch) {
      const g = parseElevM(cumMatch[2]);
      const d = parseElevM(cumMatch[3]);
      station.cumGainM = Math.abs(isNaN(g) ? 0 : g);
      station.cumDropM = Math.abs(isNaN(d) ? 0 : d);
      continue;
    }

    // ── Cut-off ──────────────────────────────────────────────
    // e.g. "Cut-off: 8:50am | 2 hour 20 minutes"
    // e.g. "Cut-off: 10:30am | 4 hours"
    const cutoffMatch = line.match(
      /cut-?off\s*:\s*(\d{1,2}:\d{2}\s*(?:am|pm))\s*\|\s*(.+)/i
    );
    if (cutoffMatch) {
      station.cutoffTime     = cutoffMatch[1].trim();
      station.cutoffDuration = cutoffMatch[2].trim();
      continue;
    }

    // ── Services ─────────────────────────────────────────────
    const serviceMatch = line.match(/^([^:]+)\s*:\s*(.+)$/);
    if (serviceMatch) {
      const key = serviceMatch[1].trim().toLowerCase().replace(/\s+/g, "_");
      const val = parseBool(serviceMatch[2]);
      if (key === "support_crew")  station.supportCrew = val;
      if (key === "pacers")        station.pacers      = val;
      if (key === "drop_bags")     station.dropBags    = val;
      if (key === "toilet")        station.toilet      = val;
    }
  }

  return station;
}

/**
 * Build the stock string for a leg from its station's services.
 * This is used to pre-populate the "Aid station stock" field in the UI.
 */
function buildStock(station) {
  const parts = [];
  if (station.type === "water_point") parts.push("Water, Coca-cola, Lollies");
  if (station.type === "aid_station") parts.push("Water, Coca-cola, Trail Brew, Lollies, Chips, Bananas, Watermelon");
  if (station.type === "finish")      parts.push("Water, Coca-cola, Ginger beer, Trail Brew, Lollies, Chips, Bananas, Watermelon");
  if (station.dropBags)  parts.push("Drop bags ✓");
  if (station.supportCrew) parts.push("Crew ✓");
  if (station.toilet)    parts.push("Toilets ✓");
  return parts.join(" · ");
}

/**
 * Convert an array of stations into the leg shape used by generateRacePlan().
 * Each station becomes one leg — section distance and gain from the section stats.
 */
function stationsToLegs(stations) {
  return stations.map(station => ({
    name:   station.name,
    km:     Math.round(station.sectionKm * 10) / 10 || station.cumKm,
    gainM:  station.sectionGainM,
    stock:  buildStock(station),
    // Extra fields carried through for the UI — not used by the engine calculation
    // but available for display (e.g. cutoff badge on leg card)
    cutoff:   station.cutoffTime   ? `${station.cutoffTime} (${station.cutoffDuration})` : null,
    services: {
      supportCrew: station.supportCrew,
      pacers:      station.pacers,
      dropBags:    station.dropBags,
      toilet:      station.toilet,
    },
  }));
}

/**
 * Main entry point.
 *
 * @param {string} text  Raw pasted text from the race briefing.
 * @returns {{ legs: Leg[], stations: Station[], errors: string[] }}
 */
export function parseAidStations(text) {
  const errors = [];

  if (!text || !text.trim()) {
    return { legs: [], stations: [], errors: ["No text provided."] };
  }

  const blocks   = splitBlocks(text);
  if (blocks.length === 0) {
    return { legs: [], stations: [], errors: ["No aid station blocks found. Make sure the text includes lines like 'Aid Station | Name | 21.4km'."] };
  }

  const stations = blocks.map(parseBlock);

  // Validate — flag stations with missing section data
  stations.forEach(s => {
    if (!s.name) {
      errors.push(`Could not parse name for a station block.`);
    }
    if (!s.sectionKm || isNaN(s.sectionKm)) {
      errors.push(`"${s.name || "Unknown"}" is missing section distance — km set to cumulative distance.`);
    }
  });

  const legs = stationsToLegs(stations);

  return { legs, stations, errors };
}
