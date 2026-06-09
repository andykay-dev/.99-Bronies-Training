// api/scan.js — Vercel Serverless Function
//
// POST /api/scan
// Body: { url: string, intent: "race_aid_stations" | "nutrition" | "general" }
//
// Fetches the target URL server-side (bypassing browser CORS), strips the HTML
// down to readable text, and returns it for the scanner engine to parse.
//
// Works on any publicly accessible URL. Will not work on:
//   - Sites behind login walls
//   - Sites that block headless requests (Cloudflare bot protection etc.)
//   - PDFs (returns an error with a helpful message)
//
// Vercel automatically makes files in /api/ into serverless functions.
// No extra config needed — just deploy.

const ALLOWED_ORIGINS = [
  "https://bronies.app",
  "https://bronies-training.vercel.app",
  // Vercel preview deployments
  /^https:\/\/bronies-training-.*\.vercel\.app$/,
  // Local dev
  "http://localhost:5173",
  "http://localhost:4173",
];

function isAllowedOrigin(origin) {
  if (!origin) return true; // server-to-server, allow
  return ALLOWED_ORIGINS.some(allowed =>
    allowed instanceof RegExp ? allowed.test(origin) : allowed === origin
  );
}

/** Strip HTML tags, collapse whitespace, remove script/style blocks */
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, " | ")
    .replace(/<\/th>/gi, " | ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g,  "&")
    .replace(/&lt;/g,   "<")
    .replace(/&gt;/g,   ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#[0-9]+;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Pull only the most relevant section of text based on intent keywords */
function extractRelevantSection(text, intent) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  // Keywords that signal the start of a relevant section
  const INTENT_KEYWORDS = {
    race_aid_stations: [
      "aid station", "water point", "checkpoint", "cut-off", "cutoff",
      "support crew", "drop bag", "section stats", "cumulative",
    ],
    nutrition: [
      "nutrition facts", "serving size", "total carbohydrate", "carbs",
      "energy", "per serve", "per 100g", "ingredients", "calories",
      "sodium", "protein", "fat",
    ],
    general: [],
  };

  const keywords = INTENT_KEYWORDS[intent] || [];
  if (keywords.length === 0) {
    // General intent — return everything up to 8000 chars
    return lines.slice(0, 300).join("\n");
  }

  // Find the first line that contains a keyword
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (keywords.some(kw => lower.includes(kw))) {
      startIdx = Math.max(0, i - 2); // include 2 lines of context before
      break;
    }
  }

  if (startIdx === -1) {
    // Keyword not found — return the full text and let the client handle it
    return lines.slice(0, 400).join("\n");
  }

  // Return up to 200 lines from the start of the relevant section
  return lines.slice(startIdx, startIdx + 200).join("\n");
}

export default async function handler(req, res) {
  // CORS headers
  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin)) {
    return res.status(403).json({ error: "Origin not allowed" });
  }
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { url, intent = "general" } = req.body || {};

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "url is required" });
  }

  // Only allow http/https
  let parsed;
  try {
    parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
  } catch {
    return res.status(400).json({ error: "Invalid URL — must start with http:// or https://" });
  }

  // Fetch the page
  let html;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Appear as a regular browser to avoid bot blocks
        "User-Agent": "Mozilla/5.0 (compatible; BroniesApp/1.0; +https://bronies.app)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-AU,en;q=0.9",
      },
    });
    clearTimeout(timeout);

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/pdf")) {
      return res.status(422).json({
        error: "PDF detected",
        hint: "This URL points to a PDF. Download it and paste the text directly into the app instead.",
        isPdf: true,
      });
    }

    if (!response.ok) {
      return res.status(502).json({
        error: `Site returned ${response.status}`,
        hint: response.status === 403
          ? "This site blocks automated access. Try pasting the text manually."
          : `HTTP ${response.status} from ${parsed.hostname}`,
      });
    }

    html = await response.text();
  } catch (err) {
    if (err.name === "AbortError") {
      return res.status(504).json({ error: "Request timed out — site took too long to respond" });
    }
    return res.status(502).json({
      error: "Could not fetch the page",
      hint: err.message,
    });
  }

  // Extract and return
  const rawText  = htmlToText(html);
  const text     = extractRelevantSection(rawText, intent);
  const wordCount = text.split(/\s+/).length;

  return res.status(200).json({
    ok:        true,
    url,
    intent,
    text,
    wordCount,
    hostname:  parsed.hostname,
  });
}
