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
// Goal 2: every fired Turn carries its generated panel (Turn-bound UI);
// unknown utterances in capture stages acknowledge-and-hold so the
// typed-description alternative path functions without client-driven
// advance; `camera_denied` parks capture stages with guidance.
import { decide, runChecks } from "./checks.js";
import type { Decision } from "./checks.js";
import { loadFixture } from "./fixtures.js";
import { buildMeasurements } from "./measurements.js";
import { verifyDVS } from "./dvs.js";
import { tier } from "./fraud.js";
import type { TierResult } from "./fraud.js";
import { coach } from "./telemetry.js";
import { DEFAULT_LIMITATIONS, generatePanel } from "./panels.js";
import type { Panel, PanelData } from "./panels.js";

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
  /** Generated panel for this fired Turn (Goal 2, Turn-bound UI). */
  panel?: Panel;
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

/** Stages where the camera is (or should be) live. */
export const CAPTURE_STAGES: ReadonlySet<Stage> = new Set([
  "awaiting_doc_front",
  "awaiting_doc_back",
  "awaiting_challenge",
  "awaiting_selfie",
]);

/**
 * Attach the generated panel to a fired Turn. The panel always binds to
 * this Turn kind + stage — panels for Turns that never fired are a bug.
 */
export function withPanel(turn: Turn, stage: Stage, data: PanelData = {}): Turn {
  return {
    ...turn,
    panel: generatePanel(turn.kind, stage, {
      ...data,
      text: data.text ?? turn.text,
    }),
  };
}

const CONSENT_TEXT =
  "I'm Aria. I'll guide you by voice to verify your ID. Nothing is uploaded until you say so. Say — I consent — to start.";

function consentTurn(): Turn {
  return withPanel({ kind: "consent", text: CONSENT_TEXT }, "awaiting_consent");
}

/**
 * Typed-description alternative: acknowledge the description and hold.
 * Coaching color rotates across approved surface variants (front set is
 * golden) so repeats never sound canned; the noun follows the stage so a
 * hold on the back never says "front". Deterministic round-robin keyed by
 * the last spoken hold — never random, never the same twice in a row.
 */
const HOLD_NOUN: Partial<Record<Stage, string>> = {
  awaiting_doc_front: "front",
  awaiting_doc_back: "back",
  awaiting_challenge: "challenge",
  awaiting_selfie: "selfie",
};

function holdVariants(stage: Stage): readonly [string, string, string] {
  const noun = HOLD_NOUN[stage] ?? "capture";
  return [
    `Still on the ${noun} — hold steady.`,
    "With you, same capture. Hold there.",
    "Stay with this one — nearly there.",
  ];
}

/** Next hold variant for the stage: one past the last spoken, else first. */
function nextHoldVariant(stage: Stage, lastText: string | undefined): string {
  const variants = holdVariants(stage);
  const idx = lastText ? variants.indexOf(lastText) : -1;
  return variants[(idx + 1) % variants.length];
}

/** Camera-denied park guidance: explains + names the stand-in path. */
const CAMERA_DENIED_TEXT =
  "I can't reach your camera, so this run is parked here. We'll use the stand-in capture path when you're ready — nothing moves on without a capture.";

const CHALLENGE_TEXT =
  "Look at the camera, turn your head slowly left… and back.";

const SELFIE_TEXT = "Hold still for your selfie… captured.";

function instructTurn(
  fixtureId: string,
  which: "front" | "back",
  stage: Stage,
): Turn {
  if (which === "back") {
    return withPanel(
      {
        kind: "instruct",
        text: "Now flip the card over so I can grab your Card Number on the back.",
      },
      stage,
    );
  }
  let hasBack = true;
  try {
    const kind = loadFixture(fixtureId).kind;
    hasBack = kind !== "au_passport";
    if (kind === "au_passport") {
      return withPanel(
        {
          kind: "instruct",
          text: "Open to the photo page. I need the two-line code at the bottom fully visible.",
        },
        stage,
        { hasBack },
      );
    }
  } catch {
    // Unknown fixture: fall through to the licence prompt.
  }
  return withPanel(
    {
      kind: "instruct",
      text: "Hold your licence up, front facing the camera. Fill the frame.",
    },
    stage,
    { hasBack },
  );
}

/**
 * Stage-appropriate re-instruct for a retake (stage unchanged). Doc stages
 * reuse the capture prompts; challenge/selfie reuse their guidance lines.
 */
export function captureInstruct(s: FlowState): Turn {
  switch (s.stage) {
    case "awaiting_doc_back":
      return instructTurn(s.fixture, "back", s.stage);
    case "awaiting_challenge":
      return withPanel({ kind: "instruct", text: CHALLENGE_TEXT }, s.stage);
    case "awaiting_selfie":
      return withPanel(
        { kind: "instruct", text: "Hold still for your selfie." },
        s.stage,
      );
    case "awaiting_doc_front":
    default:
      return instructTurn(s.fixture, "front", s.stage);
  }
}

/** Deterministic keyword match; model only for `unknown` (out of slice). */
export function matchIntent(text: string): Intent {
  const t = text.toLowerCase();
  if (/\brepeat\b|\bagain\b|say again|pardon|come again/.test(t)) return "repeat";
  if (/\bhelp\b|\bhow\b|confused|what do i|don't understand/.test(t)) return "help";
  if (
    /\bnot ready\b|\bnot yet\b|\bno\b|\bdeny\b|\bdon't\b|\bdo not\b|\bstop\b|\bcancel\b|not consent|\brevoke\b|\bwithdraw\b|\bdelete\b/.test(
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
    last_turn: consentTurn(),
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
          last_turn: instructTurn(s.fixture, "front", "awaiting_doc_front"),
        };
      }
      return { ...base, last_turn: instructTurn(s.fixture, "front", s.stage) };
    case "deny":
      // Lightweight purge; full capture purge lands in Task 6 session API.
      return {
        ...base,
        stage: "idle",
        capturesPurged: true,
        last_turn: withPanel(
          {
            kind: "abort_confirm",
            text: "Okay — stopping here. Your captures are discarded. Say ready any time to start over.",
          },
          "idle",
        ),
      };
    case "repeat":
      return {
        ...base,
        last_turn: withPanel(
          {
            kind: "replay",
            text: s.last_turn?.text ?? "Let me repeat that. Hold your document up to the camera.",
          },
          s.stage,
        ),
      };
    case "help": {
      // Context-aware: when the run is waiting on the back of the card,
      // re-instruct the back capture (Card Number), not the front.
      const needsBack =
        s.stage === "awaiting_doc_back" || s.stage === "reading_back";
      return {
        ...base,
        last_turn: instructTurn(s.fixture, needsBack ? "back" : "front", s.stage),
      };
    }
    case "unknown":
      // Typed-description alternative path: in capture stages a description
      // is acknowledged and the run holds (no advance, no pass) while
      // telemetry coaching continues. Elsewhere keep the consent re-ask.
      if (CAPTURE_STAGES.has(s.stage)) {
        return {
          ...base,
          last_turn: withPanel(
            { kind: "re-ask", text: nextHoldVariant(s.stage, s.last_turn?.text) },
            s.stage,
          ),
        };
      }
      return {
        ...base,
        last_turn: withPanel(
          {
            kind: "re-ask",
            text: "I didn't catch that. Say — I consent — to start, or ready when your card is in frame.",
          },
          s.stage,
        ),
      };
  }
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
  const m = buildMeasurements(s.fixture);
  const results = runChecks(m);
  const decision = decide(results);
  const dvs = verifyDVS({ fixture: s.fixture });
  const tiered = tier(decision, dvs, [], { ocrConfidence: 1 });
  return {
    ...s,
    stage: "comparing",
    decision,
    tier: tiered,
    last_turn: withPanel(
      { kind: "progress", text: "Checking your details now…" },
      "comparing",
    ),
  };
}

function rankOutcome(r: "pass" | "fail" | "inconclusive"): number {
  if (r === "fail") return 0;
  if (r === "inconclusive") return 1;
  return 2;
}

/**
 * Evidence binding for the decided panel. Re-runs the deterministic
 * pipeline (same inputs as the report path, so the order matches
 * `failedFirst` exactly); negligible cost, and the throw path is
 * unreachable (decided implies a known-good fixture).
 */
function decidedData(s: FlowState): PanelData {
  try {
    const results = runChecks(buildMeasurements(s.fixture));
    const decision = decide(results);
    const dvs = verifyDVS({ fixture: s.fixture });
    const tiered = tier(decision, dvs, [], { ocrConfidence: 1 });
    return {
      evidence: [...results].sort(
        (a, b) => rankOutcome(a.result) - rankOutcome(b.result),
      ),
      verdict: decision,
      tier: tiered.tier,
      userMessage: tiered.userMessage,
      limitations: [...DEFAULT_LIMITATIONS],
    };
  } catch {
    return { evidence: [], verdict: s.decision ?? "not_verified" };
  }
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
 * `camera_denied` parks capture stages with guidance (never advances).
 */
export function signal(s: FlowState, ev: string): FlowState {
  if (ev === "camera_denied") {
    if (!CAPTURE_STAGES.has(s.stage)) return s;
    return {
      ...s,
      last_turn: withPanel({ kind: "warn", text: CAMERA_DENIED_TEXT }, s.stage),
    };
  }
  switch (s.stage) {
    case "awaiting_doc_front":
      if (ev === "front_captured") {
        const reading: FlowState = {
          ...s,
          stage: "reading_front",
          last_turn: withPanel(
            {
              kind: "progress",
              text: "Good framing. Hold still one second… captured front.",
            },
            "reading_front",
          ),
        };
        // Missing back: park at awaiting_doc_back; the tier pipeline is
        // unreachable from there (fail-closed, Task 4 ruling).
        if (backMissing(s)) {
          return {
            ...reading,
            stage: "awaiting_doc_back",
            last_turn: instructTurn(s.fixture, "back", "awaiting_doc_back"),
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
            last_turn: withPanel(
              {
                kind: "instruct",
                text: CHALLENGE_TEXT,
              },
              "awaiting_challenge",
            ),
          };
        }
        if (backMissing(s)) return { ...s, stage: "awaiting_doc_back" };
        return {
          ...s,
          stage: "awaiting_doc_back",
          last_turn: instructTurn(s.fixture, "back", "awaiting_doc_back"),
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
          last_turn: withPanel(
            {
              kind: "progress",
              text: "Got the back. Checking the Card Number…",
            },
            "reading_back",
          ),
        };
      }
      return s;
    case "reading_back":
      if (ev === "frames_done" || ev === "ocr_done") {
        return {
          ...s,
          stage: "awaiting_challenge",
          last_turn: withPanel(
            {
              kind: "instruct",
              text: CHALLENGE_TEXT,
            },
            "awaiting_challenge",
          ),
        };
      }
      return s;
    case "awaiting_challenge":
      if (ev === "challenge_done") {
        return {
          ...s,
          stage: "awaiting_selfie",
          last_turn: withPanel(
            {
              kind: "instruct",
              text: SELFIE_TEXT,
            },
            "awaiting_selfie",
          ),
        };
      }
      return s;
    case "awaiting_selfie":
      if (ev === "selfie_captured") return enterComparing(s);
      return s;
    case "comparing":
      if (ev === "tier_done" || ev === "report_ready") {
        return {
          ...s,
          stage: "decided",
          last_turn: withPanel(resultTurn(s), "decided", decidedData(s)),
        };
      }
      return s;
    case "decided":
    case "awaiting_consent":
    case "idle":
      return s;
  }
}
