// Muse Image edge-case fixture art (manual tool; Rev 2 §11 art role).
// Calls Muse Image once per fixture for the VISUAL BASE ONLY (backdrop);
// MRZ + card-number regions are composed programmatically in
// src/fixtures.ts, so ground truth stays exact regardless of the art.
// Usage: npm run build && node scripts/image-art.mjs
// Requires META_API_KEY (env or .env, never committed). Appends spend to
// docs/spend.md on success. Exits non-zero without writing on any failure.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env loader (KEY=VALUE, # comments, optional quotes). Real env wins.
try {
  for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
} catch {
  // No .env — plain environment only.
}

const KEY = process.env.META_API_KEY;
if (!KEY) {
  console.error("image-art: META_API_KEY not set (env or .env)");
  process.exit(1);
}

const { META_MODELS, PRICING } = await import("../dist/meta-models.js");
if (!META_MODELS.image || !PRICING[META_MODELS.image]) {
  console.error("image-art: stale dist, run npm run build");
  process.exit(1);
}

// Backdrops only: each prompt leaves the machine-readable zone blank —
// the MRZ / card number is composed programmatically afterwards.
const JOBS = [
  {
    id: "aus-passport-glare",
    prompt:
      "Fictional Australian passport photo page, synthetic specimen, " +
      "soft glare streak across the laminate, portrait box empty grey, " +
      "machine-readable zone left completely blank cream, no text, no numbers.",
  },
  {
    id: "nsw-dl-tilt",
    prompt:
      "Fictional NSW driver licence front, synthetic specimen photographed " +
      "at a slight tilt, portrait box empty grey, card-number area left " +
      "completely blank, no text, no numbers.",
  },
];

/** Extract base64 image bytes from an Image payload (provisional shapes). */
function imageBase64(payload) {
  const candidates = [
    payload?.image_base64,
    payload?.output?.image_base64,
    payload?.data?.[0]?.b64_json,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 100) return c;
  }
  return null;
}

const artDir = join(root, "fixtures", "art");
mkdirSync(artDir, { recursive: true });

let calls = 0;
for (const job of JOBS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  let payload;
  try {
    const response = await fetch("https://api.meta.ai/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${KEY}`,
      },
      body: JSON.stringify({ model: META_MODELS.image, input: job.prompt }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const snippet = (await response.text()).slice(0, 300);
      throw new Error(`Image responded ${response.status}: ${snippet}`);
    }
    payload = await response.json();
  } catch (error) {
    console.error(`image-art: ${job.id} failed: ${error.message}`);
    process.exit(1);
  } finally {
    clearTimeout(timer);
  }
  const b64 = imageBase64(payload);
  if (!b64) {
    console.error(`image-art: ${job.id} returned no image (keys: ${Object.keys(payload ?? {}).join(",")})`);
    process.exit(1);
  }
  writeFileSync(join(artDir, `${job.id}.png`), Buffer.from(b64, "base64"));
  calls++;
  console.log(`image-art: wrote fixtures/art/${job.id}.png`);
}

// Append spend (est. per-call price × calls) to the durable ledger.
const perCall = PRICING[META_MODELS.image].perCall;
const est = calls * perCall;
const date = new Date().toISOString().slice(0, 10);
const spendPath = join(root, "docs", "spend.md");
let spend = readFileSync(spendPath, "utf8");
const totalMatch = spend.match(/Running total: \*\*\$([\d.]+)\*\*/);
const total = (totalMatch ? Number(totalMatch[1]) : 0) + est;
spend = spend.replace(
  /Running total: \*\*\$[\d.]+\*\*/,
  `| ${date} | 3 | ${META_MODELS.image} | ${calls} | ${est.toFixed(2)} | ${total.toFixed(2)} | Fixture visual bases (backdrop only; MRZ composed programmatically). |\n\nRunning total: **$${total.toFixed(2)}**`,
);
writeFileSync(spendPath, spend);
console.log(`image-art: spend +$${est.toFixed(2)} total $${total.toFixed(2)}`);
