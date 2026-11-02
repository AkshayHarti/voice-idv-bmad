// Pinned Meta model IDs + pricing (Meta phase Task 0).
// Source: candidate IDs from the plan/rules review (Spark, SAM 3, Glimmer).
// Status 2026-11-01: UNVERIFIED — the live probe was blocked by a sandbox
// egress outage (every api.meta.ai call hangs, authenticated or not; $0
// spent). Re-probe live in Task 4 and update these constants if the
// accepted IDs differ. Tasks 1–3 consume these constants, never literals.
// Pricing units carry their basis; all estimates until the probe lands.

export const META_MODELS = {
  spark: "muse-spark-1.3",
  sam: "sam-3",
  glimmer: "glimmer",
} as const;

export interface ModelPrice {
  perCall: number;
  unit: string;
}

export const PRICING: Record<string, ModelPrice> = {
  [META_MODELS.spark]: {
    perCall: 0.00001,
    unit: "USD est/call (~100 tok @ $0.10/Mtok in, UNVERIFIED)",
  },
  [META_MODELS.sam]: { perCall: 0.0025, unit: "USD/img (UNVERIFIED)" },
  [META_MODELS.glimmer]: { perCall: 0.01, unit: "USD/img (UNVERIFIED)" },
};

export interface SpendEntry {
  model: string;
  calls: number;
  estCost: number;
}

/**
 * In-memory ledger of Meta calls made through the provider chains.
 * `docs/spend.md` is the durable, human-audited log — every real call is
 * mirrored there by hand; this ledger lets tests assert the call sites log.
 */
export const SPEND_LEDGER: SpendEntry[] = [];

/** Record one Meta call batch. Never throws; pure in-memory append. */
export function logSpend(model: string, calls: number, estCost: number): void {
  SPEND_LEDGER.push({ model, calls, estCost });
}

/** Running estimated total over the in-memory ledger. */
export function spendTotal(): number {
  return SPEND_LEDGER.reduce((total, entry) => total + entry.estCost, 0);
}
