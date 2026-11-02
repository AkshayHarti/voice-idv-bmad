// Adversarial self-audit (Meta phase Task 2).
// Spark reasons over check ids + results + redacted evidence and returns
// exactly 3 attack hypotheses ("how a human could have fooled me, and
// whether it was caught"). Report annotation only — hypotheses never feed
// back into checks, so Decisions are identical with audit on or off.
// Non-blocking: runs behind `progress` Turns at ≤8000ms (Task 0 binding
// prescription); any failure degrades to 3 local templates. Never throws.
// Avoid: hypotheses use allowed terms/negations only —
// challenge_compliance, portrait_splice_artifact, face_match (uncertified).
import type { CheckResult, Decision } from "./checks.js";
import { META_MODELS, PRICING, logSpend } from "./meta-models.js";
import { META_BASE, postJson, responseText } from "./providers.js";
import type { Fetcher, ProviderName } from "./providers.js";

export interface AuditDeps {
  fetcher?: Fetcher;
  env?: Record<string, string | undefined>;
}

export interface Audit {
  hypotheses: [string, string, string];
  provider: ProviderName;
}

const LOCAL_TEMPLATES: [string, string, string] = [
  "Screen replay: a photo of a screen could reach the checks where moiré scoring is absent — untested in this slice, flag for review.",
  "Printed copy: a sharp print could satisfy portrait_region_present — the splice check reports discontinuity only, never authenticity.",
  "Edited MRZ: a reprinted MRZ line with valid check digits would pass digit checks — the visual-zone cross-check and DVS are the backstop.",
];

/** Strip quoted values, dates, and long code runs from evidence. Redacted refs only. */
function scrub(evidence: string): string {
  return evidence
    .replace(/"[^"]*"/g, '"••"')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "••")
    .replace(/\b[A-Z0-9]{6,}\b/g, "••");
}

function auditPrompt(checks: CheckResult[], decision: Decision): string {
  const lines = checks.map((c) => `${c.id}=${c.result} (${scrub(c.evidence)})`).join("; ");
  return (
    `You are auditing an identity verification run you did not decide. ` +
    `Decision: ${decision}. Checks (id=result, redacted evidence): ${lines}. ` +
    `Reply with exactly 3 numbered attack hypotheses — how a human could ` +
    `have fooled this run, and whether it was caught — each at most 40 ` +
    `words, no markdown.`
  );
}

/** Split model text into exactly 3 hypotheses, padding with local templates. Never throws. */
function parseHypotheses(text: string): [string, string, string] {
  const found: string[] = [];
  for (const line of text.split("\n")) {
    const clean = line.replace(/^\s*(?:\d+[.)]|[-*])\s*/, "").trim();
    if (clean) found.push(clean.split(/\s+/).slice(0, 40).join(" "));
    if (found.length === 3) break;
  }
  let i = 0;
  while (found.length < 3) found.push(LOCAL_TEMPLATES[i++]);
  return found as [string, string, string];
}

/**
 * Generate the 3-hypothesis adversarial audit. Reads check results;
 * never mutates them and never influences the Decision. Falls back to
 * local templates without a key or on any failure.
 */
export async function generateAudit(
  checks: CheckResult[],
  decision: Decision,
  deps: AuditDeps = {},
): Promise<Audit> {
  const env = deps.env ?? {};
  const fetcher = deps.fetcher ?? fetch;
  if (!env.META_API_KEY) {
    return { hypotheses: [...LOCAL_TEMPLATES] as [string, string, string], provider: "local" };
  }
  try {
    const payload = await postJson(
      fetcher,
      `${META_BASE}/responses`,
      { authorization: `Bearer ${env.META_API_KEY}` },
      { model: META_MODELS.spark, input: auditPrompt(checks, decision) },
      8000,
    );
    const text = responseText(payload);
    if (!text) throw new Error("meta returned no text");
    logSpend(META_MODELS.spark, 1, PRICING[META_MODELS.spark].perCall);
    return { hypotheses: parseHypotheses(text), provider: "meta" };
  } catch {
    return { hypotheses: [...LOCAL_TEMPLATES] as [string, string, string], provider: "local" };
  }
}
