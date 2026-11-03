// Pinned Meta model IDs + pricing (Rev 2 §11 roster).
// Source: Cerebral Valley participant guide (rules PDF) + dev.meta.ai model
// pages, read 2026-11-02 (voice-assistant spec §§3/11). Supersedes the meta
// plan's table: SAM 3 → SAM 3.1; fixture art Glimmer → Muse Image; Glimmer
// is the local always-on core, not an API role.
// Status 2026-11-03: UNVERIFIED — no live-key probe has succeeded yet
// (sandbox egress outage; $0 spent). Re-verify live per §12 and update
// these constants if the accepted IDs differ. Consumers import these
// constants, never literals. Wonder/Image/Transcribe IDs are PROVISIONAL
// placeholders pending §12 integration confirmation.
// Pricing units carry their basis; all estimates until the probe lands.

export const META_MODELS = {
  spark: "muse-spark-1.3",
  sam: "sam-3-1",
  /** Local run-weights core label — never sent to the Model API. */
  glimmer: "glimmer-local-core",
  /** PROVISIONAL placeholder — confirm against the Meta model list (§12). */
  image: "muse-image-1.0",
  /** PROVISIONAL placeholder — confirm against the Meta model list (§12). */
  wonder: "muse-wonder-1.0",
  /** PROVISIONAL placeholder (§5 names this id; still UNVERIFIED per §12). */
  transcribe: "muse-voice-transcribe-1.0",
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
  [META_MODELS.sam]: {
    perCall: 0.0025,
    unit: "USD/img ($0.20/1k frames tracked video, UNVERIFIED)",
  },
  [META_MODELS.glimmer]: {
    perCall: 0,
    unit: "USD (local run-weights core — no API spend)",
  },
  [META_MODELS.image]: {
    perCall: 0.01,
    unit: "USD/img (PROVISIONAL id, UNVERIFIED)",
  },
  [META_MODELS.wonder]: {
    perCall: 0.009,
    unit: "USD est/call (~1k tok in @ $4/MTok + ~250 tok out @ $20/MTok, PROVISIONAL id, UNVERIFIED)",
  },
  [META_MODELS.transcribe]: {
    perCall: 0.0005,
    unit: "USD est/call (~10s avg utterance @ $0.18/hr, PROVISIONAL id, UNVERIFIED)",
  },
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
