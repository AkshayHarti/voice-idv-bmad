// Fraud risk tier (AU voice-IDV demo slice, spec §5 + Global Constraints).
// Tier rule: any High → `hard_flag` (silent — the caller-facing string is
// generic, the real reason lives only in the queue object); any Medium or
// OCR <85% → `step_up`; all pass + DVS match → `auto_approve`.
// `inconclusive` (decision `not_verified`) never approves.
// Consumes `decide` output + `verifyDVS` result + fraud signals.
import type { Decision } from "./checks.js";

export type Tier = "auto_approve" | "step_up" | "hard_flag";

export interface TierResult {
  tier: Tier;
  /** Generic caller-facing string — never carries signal names or numbers. */
  userMessage: string;
  /** Real reason lives here only (queue reviewers, never the caller). */
  queue: { reasons: string[] };
  signals: string[];
}

export interface TierOptions {
  /** OCR confidence 0–1; <0.85 forces step_up (spec §2 spelling fallback). */
  ocrConfidence?: number;
}

/** High-weight signals (spec §5): any one hard-flags. */
export const HIGH_SIGNALS: readonly string[] = [
  "mrz_mismatch",
  "dvs_mismatch",
  "screen_replay",
  "print_no_ovd",
];

/** Medium-weight signals (spec §5): any one steps up. */
export const MEDIUM_SIGNALS: readonly string[] = [
  "font_mismatch",
  "second_voice",
  "synthetic_voice",
  "hesitation",
  "device_velocity",
  "emulator",
];

const GENERIC_HARD_FLAG =
  "Your verification needs manual review. We will be in touch shortly.";
const GENERIC_STEP_UP =
  "We need one extra check to finish verifying your ID. Please follow the next prompt.";
const GENERIC_APPROVED = "Verified. Your ID passed all checks.";

export function tier(
  decision: Decision | string,
  dvs: { match: boolean },
  signals: string[],
  opts?: TierOptions,
): TierResult {
  const seen = new Set<string>(signals);
  if (!dvs.match) seen.add("dvs_mismatch");
  if (decision === "rejected") seen.add("checks_rejected");
  if (decision === "not_verified") seen.add("checks_inconclusive");
  const reasons = [...seen];

  const hasHigh =
    signals.some((s) => (HIGH_SIGNALS as readonly string[]).includes(s)) ||
    !dvs.match ||
    decision === "rejected";
  if (hasHigh) {
    return {
      tier: "hard_flag",
      userMessage: GENERIC_HARD_FLAG,
      queue: { reasons },
      signals: [...signals],
    };
  }

  const ocr = opts?.ocrConfidence ?? 1;
  const hasMedium =
    signals.some((s) => (MEDIUM_SIGNALS as readonly string[]).includes(s)) ||
    ocr < 0.85 ||
    decision === "not_verified";
  if (hasMedium) {
    return {
      tier: "step_up",
      userMessage: GENERIC_STEP_UP,
      queue: { reasons },
      signals: [...signals],
    };
  }

  return {
    tier: "auto_approve",
    userMessage: GENERIC_APPROVED,
    queue: { reasons },
    signals: [...signals],
  };
}
