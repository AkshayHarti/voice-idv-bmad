// Frame-telemetry coaching (AU voice-IDV demo slice, spec §§2/4).
// Pure function: edge telemetry in, spoken Turn out. Voice narrates,
// never decides — persistent failure (counter ≥ 3) yields a `re-ask`
// Turn whose text closes the run as `not_verified`, never a pass.
import type { Turn, TurnKind } from "./flow.js";

export interface Telemetry {
  /** Glare score on hologram/photo, 0–1. */
  glare?: number;
  /** Finger/occlusion over Card Number or MRZ, 0–1. */
  finger?: number;
  /** Tilt/skew score, 0–1. */
  skew?: number;
  /** Dark/blur score, 0–1. */
  dark?: number;
  /** Screenshot / screen-replay detected on live frames. */
  screenshot?: boolean;
  /** Back of card still missing. */
  missingBack?: boolean;
  /** Consecutive coaching turns already spoken for this issue. */
  turns?: number;
}

const ISSUE_THRESHOLD = 0.5;
/** Persistent-telemetry counter at which coaching gives up (spec §5). */
export const COACHING_RETRY_LIMIT = 3;

function reask(kind: TurnKind, text: string): Turn {
  return { kind, text };
}

/**
 * Map one telemetry sample to the next spoken Turn. Priority:
 * screenshot → missing back → glare → finger → skew → dark.
 * Counter ≥ 3 with a persistent issue → `re-ask` closing as
 * `not_verified` (spec §5: never a pass).
 */
export function coach(t: Telemetry): Turn {
  const turns = t.turns ?? 0;
  const persistent =
    t.screenshot === true ||
    t.missingBack === true ||
    (t.glare ?? 0) > ISSUE_THRESHOLD ||
    (t.finger ?? 0) > ISSUE_THRESHOLD ||
    (t.skew ?? 0) > ISSUE_THRESHOLD ||
    (t.dark ?? 0) > ISSUE_THRESHOLD;
  if (persistent && turns >= COACHING_RETRY_LIMIT) {
    return reask(
      "re-ask",
      "We've tried this a few times and I still can't get a clear capture, " +
        "so this run is not verified. You can start over in better light when ready.",
    );
  }
  if (t.screenshot === true) {
    return reask(
      "warn",
      "This looks like a photo of a screen. Please use your physical card.",
    );
  }
  if (t.missingBack === true) {
    return reask(
      "re-ask",
      "I still need the back of the card — please flip it over, the Card Number lives there.",
    );
  }
  if ((t.glare ?? 0) > ISSUE_THRESHOLD) {
    return reask(
      "re-ask",
      "Tilt the top of your licence slightly away from the light to clear the glare on your photo. … Better, hold there.",
    );
  }
  if ((t.finger ?? 0) > ISSUE_THRESHOLD) {
    return reask(
      "re-ask",
      "Move your right thumb slightly — it's covering the Card Number. … Clear now, hold still.",
    );
  }
  if ((t.skew ?? 0) > ISSUE_THRESHOLD) {
    return reask(
      "re-ask",
      "Straighten the card so all four corners show. … Good.",
    );
  }
  if ((t.dark ?? 0) > ISSUE_THRESHOLD) {
    return reask(
      "re-ask",
      "Move to brighter light and hold the phone steadier. … Sharper now.",
    );
  }
  return { kind: "progress", text: "Good framing. Hold still one second…" };
}
