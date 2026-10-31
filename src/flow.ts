// Voice-guided stage machine (AU voice-IDV demo slice, spec §§2/4).
// Stages move on backend signals only — `signal()` advances capture,
// reading, comparison and decided stages; `say()` (speech) only resolves
// the consent/front prompts and never completes a capture. `say("ready")`
// starts capture, never completes it. DLs always require back (Card
// Number + address sticker live there); passports skip the back stages.
// A DL run whose back is missing parks at `awaiting_doc_back` and never
// reaches the check/tier pipeline (fail-closed per Task 4 ruling).
// Consumes `runChecks`, `decide` (Task 3), `verifyDVS` (Task 4),
// `tier` (Task 4). Produces `startRun`, `say`, `signal`, 10-stage type.
import { decide, runChecks } from "./checks.js";
import type { Decision, Measurements } from "./checks.js";
import { parseNSWDL } from "./au_dl.js";
import { loadFixture } from "./fixtures.js";
import { parseTD3 } from "./mrz.js";
import { verifyDVS } from "./dvs.js";
import { tier } from "./fraud.js";
import type { TierResult } from "./fraud.js";
import { coach } from "./telemetry.js";

export type Stage =
  | "idle"
  | "awaiting_consent"
  | "awaiting_doc_front"
  | "reading_front"
  | "awaiting_doc_back"
  | "reading_back"
  | "awaiting_challenge"
  | "awaiting_selfie"
  | "comparing"
  | "decided";

/** Closed subject intents (6). `not ready` and other negation = `deny`. */
export type Intent = "affirm" | "deny" | "repeat" | "ready" | "help" | "unknown";

/** Closed system Turns (8). Template-first; every Turn is barge-inable. */
export type TurnKind =
  | "consent"
  | "instruct"
  | "re-ask"
  | "replay"
  | "progress"
  | "warn"
  | "result"
  | "abort_confirm";

export interface Turn {
  kind: TurnKind;
  text: string;
}

export interface FlowState {
  fixture: string;
  stage: Stage;
  last_intent: Intent | null;
  last_turn: Turn | null;
  /** Set when a deny purged session captures (full purge lands in Task 6). */
  capturesPurged: boolean;
  decision: Decision | null;
  tier: TierResult | null;
}

export { coach };

const CONSENT_TURN: Turn = {
  kind: "consent",
  text: "I'll guide you by voice to verify your ID. Nothing is uploaded until you say so. Say — I consent — to start.",
};

function instructTurn(fixtureId: string, which: "front" | "back"): Turn {
  if (which === "back") {
    return {
      kind: "instruct",
      text: "Now flip the card over so I can grab your Card Number on the back.",
    };
  }
  try {
    if (loadFixture(fixtureId).kind === "au_passport") {
      return {
        kind: "instruct",
        text: "Open to the photo page. I need the two-line code at the bottom fully visible.",
      };
    }
  } catch {
    // Unknown fixture: fall through to the licence prompt.
  }
  return {
    kind: "instruct",
    text: "Hold your licence up, front facing the camera. Fill the frame.",
  };
}

/** Deterministic keyword match; model only for `unknown` (out of slice). */
export function matchIntent(text: string): Intent {
  const t = text.toLowerCase();
  if (/\brepeat\b|\bagain\b|say again|pardon|come again/.test(t)) return "repeat";
  if (/\bhelp\b|\bhow\b|confused|what do i|don't understand/.test(t)) return "help";
  if (
    /\bnot ready\b|\bnot yet\b|\bno\b|\bdeny\b|\bdon't\b|\bdo not\b|\bstop\b|\bcancel\b|not consent/.test(
      t,
    )
  ) {
    return "deny";
  }
  if (/\bconsent\b|\byes\b|\bagree\b|\baffirm\b|\bi do\b|\bok\b|\bsure\b/.test(t)) {
    return "affirm";
  }
  if (/\bready\b|\bstart\b|\bbegin\b|\bgo\b/.test(t)) return "ready";
  return "unknown";
}

/**
 * Open a run. The run leaves `idle` and gates on spoken consent: the
 * first Turn spoken is the `consent` prompt.
 */
export function startRun(fixture: string): FlowState {
  return {
    fixture,
    stage: "awaiting_consent",
    last_intent: null,
    last_turn: CONSENT_TURN,
    capturesPurged: false,
    decision: null,
    tier: null,
  };
}

/**
 * Handle one subject utterance. Speech resolves consent/capture prompts
 * but never advances capture, reading, comparison or decided stages —
 * only `signal()` moves those.
 */
export function say(s: FlowState, text: string): FlowState {
  const intent = matchIntent(text);
  const base: FlowState = { ...s, last_intent: intent };
  switch (intent) {
    case "affirm":
    case "ready":
      if (s.stage === "awaiting_consent" || s.stage === "idle") {
        return {
          ...base,
          stage: "awaiting_doc_front",
          last_turn: instructTurn(s.fixture, "front"),
        };
      }
      return { ...base, last_turn: instructTurn(s.fixture, "front") };
    case "deny":
      // Lightweight purge; full capture purge lands in Task 6 session API.
      return {
        ...base,
        stage: "idle",
        capturesPurged: true,
        last_turn: {
          kind: "abort_confirm",
          text: "Okay — stopping here. Your captures are discarded. Say ready any time to start over.",
        },
      };
    case "repeat":
      return {
        ...base,
        last_turn: {
          kind: "replay",
          text: s.last_turn?.text ?? "Let me repeat that. Hold your document up to the camera.",
        },
      };
    case "help": {
      // Context-aware: when the run is waiting on the back of the card,
      // re-instruct the back capture (Card Number), not the front.
      const needsBack =
        s.stage === "awaiting_doc_back" || s.stage === "reading_back";
      return {
        ...base,
        last_turn: instructTurn(s.fixture, needsBack ? "back" : "front"),
      };
    }
    case "unknown":
      return {
        ...base,
        last_turn: {
          kind: "re-ask",
          text: "I didn't catch that. Say — I consent — to start, or ready when your card is in frame.",
        },
      };
  }
}

/** Demo run date (ISO); expiry comparisons baseline here, not wall-clock. */
const RUN_TODAY = "2026-10-31";

/** Build check-engine measurements from fixture ground truth (demo only). */
function measurementsFor(fixtureId: string): Measurements {
  const fx = loadFixture(fixtureId);
  if (fx.kind === "au_passport") {
    const parsed = parseTD3(fx.mrz_lines[0], fx.mrz_lines[1]);
    return {
      kind: "au_passport",
      mrz_lines: fx.mrz_lines,
      viz: {
        passportNumber: parsed.passportNumber,
        dob: parsed.dob,
        expiry: parsed.expiry,
      },
      dl: null,
      today: RUN_TODAY,
      image_quality_inconclusive: false,
      portrait_present: true,
      splice_found: false,
      face: { similarity: 0.81, band: "high", certified: false },
      challenge_completed: true,
    };
  }
  return {
    kind: "au_dl",
    mrz_lines: null,
    viz: null,
    dl: parseNSWDL(fx.front, fx.back),
    today: RUN_TODAY,
    image_quality_inconclusive: false,
    portrait_present: true,
    splice_found: false,
    face: { similarity: 0.81, band: "high", certified: false },
    challenge_completed: true,
  };
}

/** True when this DL run is missing its mandatory back capture. */
function backMissing(s: FlowState): boolean {
  try {
    const fx = loadFixture(s.fixture);
    return fx.kind === "au_dl" && fx.back === null;
  } catch {
    return false;
  }
}

function isPassport(s: FlowState): boolean {
  try {
    return loadFixture(s.fixture).kind === "au_passport";
  } catch {
    return false;
  }
}

/** Run the deterministic pipeline on entering `comparing`. */
function enterComparing(s: FlowState): FlowState {
  const m = measurementsFor(s.fixture);
  const results = runChecks(m);
  const decision = decide(results);
  const dvs = verifyDVS({ fixture: s.fixture });
  const tiered = tier(decision, dvs, [], { ocrConfidence: 1 });
  return {
    ...s,
    stage: "comparing",
    decision,
    tier: tiered,
    last_turn: { kind: "progress", text: "Checking your details now…" },
  };
}

function resultTurn(s: FlowState): Turn {
  if (s.decision === "verified") {
    return {
      kind: "result",
      text: "Verified. Your ID passed all checks including the DVS match. Details are on screen if you want them.",
    };
  }
  return {
    kind: "result",
    text: "Your verification needs manual review. We will be in touch shortly.",
  };
}

/**
 * Handle one backend event. Only these signals advance Stage; speech
 * cannot. Unknown events and out-of-order events leave Stage unchanged.
 */
export function signal(s: FlowState, ev: string): FlowState {
  switch (s.stage) {
    case "awaiting_doc_front":
      if (ev === "front_captured") {
        const reading: FlowState = {
          ...s,
          stage: "reading_front",
          last_turn: {
            kind: "progress",
            text: "Good framing. Hold still one second… captured front.",
          },
        };
        // Missing back: park at awaiting_doc_back; the tier pipeline is
        // unreachable from there (fail-closed, Task 4 ruling).
        if (backMissing(s)) {
          return {
            ...reading,
            stage: "awaiting_doc_back",
            last_turn: instructTurn(s.fixture, "back"),
          };
        }
        return reading;
      }
      return s;
    case "reading_front":
      if (ev === "frames_done" || ev === "ocr_done") {
        if (isPassport(s)) {
          return {
            ...s,
            stage: "awaiting_challenge",
            last_turn: {
              kind: "instruct",
              text: "Look at the camera, turn your head slowly left… and back.",
            },
          };
        }
        if (backMissing(s)) return { ...s, stage: "awaiting_doc_back" };
        return {
          ...s,
          stage: "awaiting_doc_back",
          last_turn: instructTurn(s.fixture, "back"),
        };
      }
      return s;
    case "awaiting_doc_back":
      // Parked while the back is missing: no signal moves past here, so
      // the check/tier pipeline is never reached for missing-back runs.
      if (backMissing(s)) return s;
      if (ev === "back_captured") {
        return {
          ...s,
          stage: "reading_back",
          last_turn: {
            kind: "progress",
            text: "Got the back. Checking the Card Number…",
          },
        };
      }
      return s;
    case "reading_back":
      if (ev === "frames_done" || ev === "ocr_done") {
        return {
          ...s,
          stage: "awaiting_challenge",
          last_turn: {
            kind: "instruct",
            text: "Look at the camera, turn your head slowly left… and back.",
          },
        };
      }
      return s;
    case "awaiting_challenge":
      if (ev === "challenge_done") {
        return {
          ...s,
          stage: "awaiting_selfie",
          last_turn: {
            kind: "instruct",
            text: "Hold still for your selfie… captured.",
          },
        };
      }
      return s;
    case "awaiting_selfie":
      if (ev === "selfie_captured") return enterComparing(s);
      return s;
    case "comparing":
      if (ev === "tier_done" || ev === "report_ready") {
        return { ...s, stage: "decided", last_turn: resultTurn(s) };
      }
      return s;
    case "decided":
    case "awaiting_consent":
    case "idle":
      return s;
  }
}
