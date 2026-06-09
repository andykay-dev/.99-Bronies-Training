// ─────────────────────────────────────────────────────────────
//  RACE ENGINE — gear.js
//  recommendGear(conditions, race) → GearItem[]
//
//  Returns an array of gear recommendations.
//  Each item: { item: string, status: "required" | "optional" | "critical" }
//
//  "required"  — always carry regardless of conditions
//  "optional"  — recommended but not mandatory
//  "critical"  — mandatory under storm conditions
// ─────────────────────────────────────────────────────────────

/**
 * @param {"clear"|"storm"} conditions
 * @param {object} [race] - reserved for future distance/terrain-based logic
 * @returns {{ item: string, status: "required"|"optional"|"critical" }[]}
 */
export function recommendGear(conditions, race = {}) {
  const gear = [];

  // Always required
  gear.push({ item: "Smartphone (GPS offline maps downloaded)", status: "required" });
  gear.push({ item: "Headlamp + spare batteries",               status: "required" });
  gear.push({ item: "Race-mandatory first aid kit",             status: "required" });
  gear.push({ item: "Emergency whistle",                        status: "required" });
  gear.push({ item: "Charged GPS watch",                        status: "required" });
  gear.push({ item: "Cash / emergency card",                    status: "required" });

  // Always sensible to have
  gear.push({ item: "Emergency space blanket",   status: "optional" });
  gear.push({ item: "Lightweight wind layer",    status: "optional" });
  gear.push({ item: "Buff / sun protection",     status: "optional" });
  gear.push({ item: "Sunscreen",                 status: "optional" });

  if (conditions === "storm") {
    gear.push({ item: "Seam-sealed waterproof shell",     status: "critical" });
    gear.push({ item: "Thermal mid-layer",                status: "critical" });
    gear.push({ item: "Thermal headwear & gloves",        status: "critical" });
    gear.push({ item: "Waterproof overpants",             status: "critical" });
    gear.push({ item: "Waterproof bag liner for vest",    status: "critical" });
  }

  return gear;
}
