// Frame-telemetry coaching (Goal 2 assistant surfaces, Rev 2 §§3–5/10).
// Pure functions: edge telemetry in, spoken Turn out. Voice narrates,
// never decides — a fault repeating to the retry limit yields a `warn`
// Turn with a typed-description alternative; the run parks (Rev 2 §4
// supersedes the AU close-run rule) and never auto-passes or auto-continues.
import type { Turn, TurnKind } from "./flow.js";

export interface Telemetry {
  /** Glare score on hologram/photo, 0–1. */
  glare?: number;
  /** Finger/occlusion over Card Number or MRZ, 0–1. */
  finger?: number;
  /** Occlusion alias for finger (thumb over Card Number/MRZ), 0–1. */
  occlusion?: number;
  /** Tilt/skew score, 0–1. */
  skew?: number;
  /** Dark score, 0–1. */
  dark?: number;
  /** Blur/defocus score, 0–1 (coached like dark). */
  blur?: number;
  /** Moiré/screen-pattern score, 0–1. */
  moire?: number;
  /** Screenshot / screen-replay detected on live frames (truthy counts). */
  screenshot?: boolean | number;
  /** Back of card still missing (truthy counts). */
  missingBack?: boolean | number;
  /** Consecutive coaching turns already spoken for this issue. */
  turns?: number;
}

const ISSUE_THRESHOLD = 0.5;
/** Persistent-telemetry counter at which coaching escalates (Rev 2 §4). */
export const COACHING_RETRY_LIMIT = 3;

/** Canonical fault key per sample; null when the frame is clean. */
export type FaultKey =
  | "screenshot"
  | "moire"
  | "missingBack"
  | "glare"
  | "finger"
  | "skew"
  | "dark";

/** All fault keys, for zero-filled counters. */
export const FAULT_KEYS: readonly FaultKey[] = [
  "screenshot",
  "moire",
  "missingBack",
  "glare",
  "finger",
  "skew",
  "dark",
];

/** Fault-agnostic escalation: warn + typed-description alternative, run parks. */
const ESCALATION_TEXT =
  "We've tried this a few times and I still can't get a clear capture, " +
  "so let's try another way: type a short description of what you see. " +
  "The run stays parked here — nothing is decided until we get a clear frame.";

function over(v: number | undefined): boolean {
  return (v ?? 0) > ISSUE_THRESHOLD;
}

/**
 * Map one telemetry sample to its canonical fault. Priority:
 * screenshot → moiré → missing back → glare → finger/occlusion →
 * skew → dark/blur. Matches `coach()` branch order exactly.
 */
export function faultKey(t: Telemetry): FaultKey | null {
  if (t.screenshot) return "screenshot";
  if (over(t.moire)) return "moire";
  if (t.missingBack) return "missingBack";
  if (over(t.glare)) return "glare";
  if (over(t.finger) || over(t.occlusion)) return "finger";
  if (over(t.skew)) return "skew";
  if (over(t.dark) || over(t.blur)) return "dark";
  return null;
}

/** Alias for `faultKey`. */
export const detectFault = faultKey;

/**
 * Lock-ready predicate: the frame may lock only when no fault fires.
 * Absent fields read as clean, so `{}` (or an all-quiet sample) is
 * lock-ready; any truthy screenshot/missingBack blocks the lock.
 */
export function isLockReady(t: Telemetry): boolean {
  return faultKey(t) === null;
}

/** Alias for `isLockReady`. */
export const lockReady = isLockReady;

function say(kind: TurnKind, text: string): Turn {
  return { kind, text };
}

/**
 * Map one telemetry sample to the next spoken Turn. Priority:
 * screenshot → moiré → missing back → glare → finger → skew → dark.
 * Counter ≥ 3 with a persistent issue → `warn` with a typed-description
 * alternative; the run parks (Rev 2 §4: never a pass, never auto-continue).
 */
export function coach(t: Telemetry): Turn {
  const turns = t.turns ?? 0;
  const fault = faultKey(t);
  if (fault !== null && turns >= COACHING_RETRY_LIMIT) {
    return say("warn", ESCALATION_TEXT);
  }
  switch (fault) {
    case "screenshot":
      return say(
        "warn",
        "This looks like a photo of a screen. Please use your physical card.",
      );
    case "moire":
      return say(
        "warn",
        "I see a screen pattern over the card. Please use your physical card, not a photo of a screen.",
      );
    case "missingBack":
      return say(
        "re-ask",
        "I still need the back of the card — please flip it over, the Card Number lives there.",
      );
    case "glare":
      return say(
        "re-ask",
        "Tilt the top of your licence slightly away from the light to clear the glare on your photo. … Better, hold there.",
      );
    case "finger":
      return say(
        "re-ask",
        "Move your right thumb slightly — it's covering the Card Number. … Clear now, hold still.",
      );
    case "skew":
      return say(
        "re-ask",
        "Straighten the card so all four corners show. … Good.",
      );
    case "dark":
      return say(
        "re-ask",
        "Move to brighter light and hold the phone steadier. … Sharper now.",
      );
    case null:
      return say("progress", "Good framing. Hold still one second…");
  }
}
