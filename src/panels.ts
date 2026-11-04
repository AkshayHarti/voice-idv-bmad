// Generated-UI fenced generator (Goal 2, Rev 2 §§3/5 + Generated UI Contract).
// Pure function of (Turn kind, stage, data) → schema-validated panel tree.
// Primitives only; unknown shapes fail closed to text-only. Template-only in
// this build, so the skeleton-stands rule holds vacuously; any future model
// polish reuses the narrate chain and threads the provider tag.
import type { Stage, TurnKind } from "./flow.js";

export type PanelPrimitive =
  | "confirm-row"
  | "choice-list"
  | "progress-steps"
  | "evidence-peek"
  | "retake-pair"
  | "review-confirm"
  | "text";

export type PanelProvider = "local templates" | "Spark";

export interface PanelChoice {
  id: string;
  label: string;
  utterance: string;
}

export interface PanelStep {
  id: string;
  label: string;
  state: "done" | "active" | "todo";
}

export interface PanelRow {
  label: string;
  value: string;
}

export interface PanelEvidence {
  id: string;
  result: string;
  evidence: string;
  value?: number;
  band?: "high" | "medium" | "low";
  certified?: boolean;
}

export interface Panel {
  primitive: PanelPrimitive;
  title: string;
  text: string;
  provider: PanelProvider;
  choices?: PanelChoice[];
  steps?: PanelStep[];
  rows?: PanelRow[];
  evidence?: PanelEvidence[];
  verdict?: string;
  tier?: string;
  userMessage?: string;
  limitations?: string[];
  ref?: string;
}

export interface PanelData {
  text?: string;
  provider?: PanelProvider;
  /** False for passports (no back-capture step). Defaults true. */
  hasBack?: boolean;
  /** True when a capture is locked and awaiting Keep/Retake. */
  pending?: boolean;
  /** Opaque capture ref for the retake pair. */
  ref?: string;
  evidence?: PanelEvidence[];
  verdict?: string;
  tier?: string;
  userMessage?: string;
  limitations?: string[];
  steps?: PanelStep[];
  choices?: PanelChoice[];
  rows?: PanelRow[];
}

/**
 * Review-gate pair: Confirm advances the run to the checks (via the
 * review_confirmed signal, never speech itself); Start over reads as
 * deny and purges. Utterances are voice equivalents for the same gate.
 */
export const REVIEW_CHOICES: readonly PanelChoice[] = [
  { id: "confirm", label: "Confirm", utterance: "yes, confirm" },
  { id: "startover", label: "Start over", utterance: "stop, start over" },
];

/**
 * Limitations block (approved vocabulary only — negations). Mirrors the
 * spec §1 non-claims; same strings as the report path in index.ts.
 */
export const DEFAULT_LIMITATIONS: readonly string[] = [
  "Not liveness certification — motion confirms responsiveness only.",
  "Not forgery proof — splice-not-found is not authenticity.",
  "Uncertified match — face similarity is a value + band, uncertified.",
];

const PRIMITIVES: readonly string[] = [
  "confirm-row",
  "choice-list",
  "progress-steps",
  "evidence-peek",
  "retake-pair",
  "review-confirm",
  "text",
];

/** Rank stages for step-state derivation. */
function stageRank(stage: Stage): number {
  switch (stage) {
    case "idle":
    case "awaiting_consent":
      return 0;
    case "awaiting_doc_front":
      return 1;
    case "reading_front":
      return 2;
    case "awaiting_doc_back":
      return 3;
    case "reading_back":
      return 4;
    case "awaiting_challenge":
      return 5;
    case "awaiting_selfie":
      return 6;
    case "awaiting_review":
      return 7;
    case "comparing":
      return 8;
    case "decided":
      return 9;
  }
}

function stepState(
  rank: number,
  startRank: number,
  doneRank: number,
): PanelStep["state"] {
  if (rank >= doneRank) return "done";
  if (rank >= startRank) return "active";
  return "todo";
}

/** Capture-pipeline steps for instruct turns, data-bound to stage. */
function captureSteps(stage: Stage, hasBack: boolean): PanelStep[] {
  const rank = stageRank(stage);
  const steps: PanelStep[] = [
    { id: "front", label: "Document front", state: stepState(rank, 1, 3) },
  ];
  if (hasBack) {
    steps.push({
      id: "back",
      label: "Document back",
      state: stepState(rank, 3, 5),
    });
  }
  steps.push(
    { id: "challenge", label: "Challenge", state: stepState(rank, 5, 6) },
    { id: "selfie", label: "Selfie", state: stepState(rank, 6, 7) },
  );
  return steps;
}

/** Pipeline steps for progress turns, data-bound to stage. */
function pipelineSteps(stage: Stage): PanelStep[] {
  const rank = stageRank(stage);
  return [
    {
      id: "capture",
      label: "Capture",
      state: rank >= 7 ? "done" : "active",
    },
    {
      id: "checks",
      label: "Checks",
      state: rank >= 8 ? "done" : rank >= 2 ? "active" : "todo",
    },
    { id: "decision", label: "Decision", state: "todo" },
  ];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isChoice(v: unknown): v is PanelChoice {
  return (
    isRecord(v) &&
    typeof v.id === "string" &&
    typeof v.label === "string" &&
    typeof v.utterance === "string"
  );
}

function isStep(v: unknown): v is PanelStep {
  return (
    isRecord(v) &&
    typeof v.id === "string" &&
    typeof v.label === "string" &&
    (v.state === "done" || v.state === "active" || v.state === "todo")
  );
}

function isRow(v: unknown): v is PanelRow {
  return (
    isRecord(v) && typeof v.label === "string" && typeof v.value === "string"
  );
}

function isEvidence(v: unknown): v is PanelEvidence {
  if (!isRecord(v)) return false;
  if (
    typeof v.id !== "string" ||
    typeof v.result !== "string" ||
    typeof v.evidence !== "string"
  ) {
    return false;
  }
  if (v.value !== undefined && typeof v.value !== "number") return false;
  if (
    v.band !== undefined &&
    v.band !== "high" &&
    v.band !== "medium" &&
    v.band !== "low"
  ) {
    return false;
  }
  if (v.certified !== undefined && typeof v.certified !== "boolean") {
    return false;
  }
  return true;
}

/**
 * Schema-validate a panel tree. Unknown primitives, missing base fields,
 * or malformed per-primitive payloads fail closed (caller renders text).
 */
export function isPanel(v: unknown): v is Panel {
  if (!isRecord(v)) return false;
  if (
    typeof v.primitive !== "string" ||
    !PRIMITIVES.includes(v.primitive) ||
    typeof v.title !== "string" ||
    typeof v.text !== "string" ||
    (v.provider !== "local templates" && v.provider !== "Spark")
  ) {
    return false;
  }
  switch (v.primitive) {
    case "choice-list":
      return (
        Array.isArray(v.choices) &&
        v.choices.length > 0 &&
        v.choices.every(isChoice)
      );
    case "retake-pair":
      return (
        Array.isArray(v.choices) &&
        v.choices.length > 0 &&
        v.choices.every(isChoice) &&
        typeof v.ref === "string"
      );
    case "progress-steps":
      return (
        Array.isArray(v.steps) &&
        v.steps.length > 0 &&
        v.steps.every(isStep)
      );
    case "confirm-row":
      return (
        Array.isArray(v.rows) && v.rows.length > 0 && v.rows.every(isRow)
      );
    case "review-confirm":
      // Rows may be empty (nothing readable); the pair must always act.
      return (
        Array.isArray(v.rows) &&
        v.rows.every(isRow) &&
        Array.isArray(v.choices) &&
        v.choices.length > 0 &&
        v.choices.every(isChoice)
      );
    case "evidence-peek":
      return Array.isArray(v.evidence) && v.evidence.every(isEvidence);
    case "text":
      return true;
    default:
      return false;
  }
}

/** Alias for `isPanel`. */
export const validatePanel = isPanel;

const DESCRIBE_CHOICE: PanelChoice = {
  id: "describe",
  label: "Describe what you see",
  utterance: "",
};

function textPanel(text: string, provider: PanelProvider): Panel {
  return { primitive: "text", title: "Update", text, provider };
}

/**
 * Generate the panel for one fired Turn. Every closed Turn kind binds to
 * exactly one primitive; anything unknown fails closed to text-only.
 * A progress Turn with `pending` binds the retake pair (Keep/Retake for
 * the locked capture); all other progress Turns bind pipeline steps.
 */
export function generatePanel(
  kind: TurnKind,
  stage: Stage,
  data: PanelData = {},
): Panel {
  const provider = data.provider ?? "local templates";
  const text = data.text ?? "";
  let panel: Panel;
  switch (kind) {
    case "consent":
      panel = {
        primitive: "choice-list",
        title: "Consent",
        text,
        provider,
        choices: data.choices ?? [
          { id: "consent", label: "I consent", utterance: "I consent" },
          { id: "deny", label: "Not ready", utterance: "not ready" },
        ],
      };
      break;
    case "instruct":
      panel = {
        primitive: "progress-steps",
        title: "Capture progress",
        text,
        provider,
        steps: data.steps ?? captureSteps(stage, data.hasBack ?? true),
      };
      break;
    case "re-ask":
      panel = {
        primitive: "choice-list",
        title: "Guidance",
        text,
        provider,
        choices: data.choices ?? [
          { id: "repeat", label: "Repeat that", utterance: "repeat that" },
          { id: "help", label: "Help", utterance: "help" },
        ],
      };
      break;
    case "replay":
      panel = {
        primitive: "confirm-row",
        title: "Heard",
        text,
        provider,
        rows: [{ label: "Heard", value: text }],
      };
      break;
    case "progress":
      if (data.pending === true) {
        panel = {
          primitive: "retake-pair",
          title: "Keep this capture?",
          text,
          provider,
          ref: data.ref ?? "",
          choices: data.choices ?? [
            { id: "keep", label: "Keep", utterance: "keep" },
            { id: "retake", label: "Retake", utterance: "retake" },
          ],
        };
      } else {
        panel = {
          primitive: "progress-steps",
          title: "Working",
          text,
          provider,
          steps: data.steps ?? pipelineSteps(stage),
        };
      }
      break;
    case "warn":
      // Describe stays the alternative path; no dead retry choice.
      panel = {
        primitive: "choice-list",
        title: "Having trouble?",
        text,
        provider,
        choices: data.choices ?? [DESCRIBE_CHOICE],
      };
      break;
    case "result":
      panel = {
        primitive: "evidence-peek",
        title: "Decision",
        text,
        provider,
        evidence: data.evidence ?? [],
        verdict: data.verdict ?? "",
        tier: data.tier ?? "",
        userMessage: data.userMessage ?? "",
        limitations: data.limitations ?? [],
      };
      break;
    case "abort_confirm":
      panel = {
        primitive: "choice-list",
        title: "Stopped",
        text,
        provider,
        choices: data.choices ?? [
          { id: "startover", label: "Start over", utterance: "ready" },
        ],
      };
      break;
    case "review":
      panel = {
        primitive: "review-confirm",
        title: "Review",
        text,
        provider,
        rows: data.rows ?? [],
        choices: data.choices ?? [...REVIEW_CHOICES],
      };
      break;
    default:
      return textPanel(text, provider);
  }
  return isPanel(panel) ? panel : textPanel(text, provider);
}

/** Alias for `generatePanel`. */
export const panelFor = generatePanel;
