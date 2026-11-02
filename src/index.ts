// Session API + single page (AU voice-IDV demo slice, spec §§2/4/7).
// Routes: POST /api/session, POST /api/session/:id/say,
// POST /api/session/:id/signal, GET /api/runs, GET /api/run/:id
// (same shape as voice-idv). Consumes Tasks 1–5: fixtures, runChecks +
// decide + redact (Task 3), verifyDVS + tier (Task 4), startRun + say +
// signal (Task 5), provider chains (this task, src/providers.ts).
// Consent gates every run out of idle; deny/revoke purges captures fully
// (deleted, not flagged — Task 5 left a lightweight flag only). The Decision
// screen lists checks failures-first with Evidence plus the limitations
// block; hard-flag runs show the generic user string while the real reasons
// live only in the queue object (Task 4 ruling). Transcript mirrors every
// Turn on one single page.
// Goal 2: live Capture surface behind a telemetry/coach loop
// (POST /api/session/:id/telemetry), lock/keep/retake capture flow, and
// Turn-bound generated panels on every step. The fixture stand-in stays
// behind Capture for denied/unavailable cameras and projection.
// Avoid: not liveness, not forgery proof, not certified matching — the
// limitations below are negations, the only permitted form (spec §1).
import { Hono } from "hono";
import { generateAudit } from "./audit.js";
import type { AuditDeps } from "./audit.js";
import { decide, runChecks } from "./checks.js";
import type { CheckResult, Decision } from "./checks.js";
import { verifyDVS } from "./dvs.js";
import { loadFixture } from "./fixtures.js";
import { CAPTURE_STAGES, captureInstruct, say, signal, startRun, withPanel } from "./flow.js";
import type { FlowState, Stage } from "./flow.js";
import { buildMeasurements } from "./measurements.js";
import { spendTotal } from "./meta-models.js";
import { generatePanel } from "./panels.js";
import { configuredProviders, narrate, segment, templateNarration } from "./providers.js";
import type { ProviderName } from "./providers.js";
import { coach, FAULT_KEYS, faultKey, isLockReady } from "./telemetry.js";
import type { FaultKey, Telemetry } from "./telemetry.js";
import { tier } from "./fraud.js";
import type { Tier } from "./fraud.js";

export function hello(): string {
  return "hello";
}

/** Works under Node and Workers without pulling in @types/node. */
export function processEnv(): Record<string, string | undefined> {
  const global = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return global.process?.env ?? {};
}

const app = new Hono();

app.get("/", (c) => c.text(hello()));

/** Fixture ids served by this demo slice (100% synthetic). */
const RUN_IDS = [
  "aus-passport-clean",
  "aus-passport-tampered-digit",
  "nsw-dl-clean",
  "nsw-dl-missing-back",
];

/**
 * Limitations block (approved vocabulary only — negations). Mirrors the
 * spec §1 non-claims: motion confirms responsiveness; splice-not-found is
 * not authenticity; face similarity is a value + band, uncertified.
 */
const LIMITATIONS = [
  "Not liveness certification — motion confirms responsiveness only.",
  "Not forgery proof — splice-not-found is not authenticity.",
  "Uncertified match — face similarity is a value + band, uncertified.",
];

function rankOutcome(r: CheckResult["result"]): number {
  if (r === "fail") return 0;
  if (r === "inconclusive") return 1;
  return 2;
}

export interface Report {
  run_id: string;
  fixture: string;
  decision: Decision;
  /** All checks, failures first (Decision screen order). */
  failedFirst: CheckResult[];
  dvs: { match: boolean; fields_matched: string[]; fields_mismatched: string[] };
  tier: Tier;
  /** Generic caller-facing string — never carries signal names or numbers. */
  userMessage: string;
  /** Real reasons live here only (queue reviewers, never the caller). */
  queue: { reasons: string[] };
  limitations: string[];
  /** Adversarial audit; present on the --meta path only (annotation, never a check input). */
  audit?: { hypotheses: [string, string, string]; provider: ProviderName };
}

/**
 * Deterministic report for a fixture: checks + conjunction decision + DVS
 * stub + risk tier. Narration-free, so --no-meta parity holds by
 * construction (providers never feed this path).
 */
export function evaluateFixture(fixtureId: string): Report {
  const checks = runChecks(buildMeasurements(fixtureId));
  const decision = decide(checks);
  const dvs = verifyDVS({ fixture: fixtureId });
  const tiered = tier(decision, dvs, [], { ocrConfidence: 1 });
  return {
    run_id: fixtureId,
    fixture: fixtureId,
    decision,
    failedFirst: [...checks].sort((a, b) => rankOutcome(a.result) - rankOutcome(b.result)),
    dvs: {
      match: dvs.match,
      fields_matched: [...dvs.fields_matched],
      fields_mismatched: [...dvs.fields_mismatched],
    },
    tier: tiered.tier,
    userMessage: tiered.userMessage,
    queue: { reasons: [...tiered.queue.reasons] },
    limitations: [...LIMITATIONS],
  };
}

export interface MetaReport extends Report {
  audit: { hypotheses: [string, string, string]; provider: ProviderName };
  meta: {
    narration: { provider: ProviderName; skipped: string[] };
    segmentation: { provider: ProviderName; skipped: string[] };
  };
  spend: { total: number };
}

/**
 * The `--meta` path: the deterministic report plus live narration,
 * segmentation, and the 3-hypothesis adversarial audit. Decisions come
 * from the same `evaluateFixture` core, so `--meta` and `--no-meta`
 * decide identically by construction; models only annotate.
 */
export async function evaluateFixtureMeta(
  fixtureId: string,
  deps: AuditDeps = {},
): Promise<MetaReport> {
  const report = evaluateFixture(fixtureId);
  const bound = { env: deps.env ?? processEnv(), fetcher: deps.fetcher };
  const [audit, narration, segmentation] = await Promise.all([
    generateAudit(report.failedFirst, report.decision, bound),
    narrate(
      { turn: "result", text: `Decision for ${fixtureId}: ${report.decision}.` },
      bound,
    ),
    segment({ label: "document quad" }, [], bound),
  ]);
  return {
    ...report,
    audit: { hypotheses: audit.hypotheses, provider: audit.provider },
    meta: {
      narration: { provider: narration.provider, skipped: narration.skipped },
      segmentation: { provider: segmentation.provider, skipped: segmentation.skipped },
    },
    spend: { total: spendTotal() },
  };
}

interface TranscriptLine {
  who: "system" | "you";
  text: string;
  kind?: string;
}

interface Session {
  flow: FlowState;
  fixture: string;
  /** Capture refs (synthetic fixture ids / opaque lock refs). Deny/revoke deletes them. */
  captures: string[];
  /** Mirrors every Turn plus every subject utterance. */
  transcript: TranscriptLine[];
  /** Consecutive-sample streak per fault (drives warn escalation). */
  faultCounts: Record<FaultKey, number>;
  /** Persistent moiré-flag counter (seam for deferred fraud inputs). */
  moireFlags: number;
  /** Last announced coach text (repeat-episode suppression). */
  lastCoachText: string | null;
  /** Latest telemetry sample this stage (feeds the lock quality verdict). */
  lastSample: Telemetry | null;
  /** Locked capture awaiting Keep/Retake (opaque server-generated ref). */
  pendingCapture: string | null;
  captureSeq: number;
}

const sessions = new Map<string, Session>();

function zeroFaultCounts(): Record<FaultKey, number> {
  return {
    screenshot: 0,
    moire: 0,
    missingBack: 0,
    glare: 0,
    finger: 0,
    skew: 0,
    dark: 0,
  };
}

/**
 * Full deny/revoke purge: captures and the pending lock are deleted, and
 * the coach streak + suppression state reset so an in-session restart
 * never inherits a streak toward an instant warn. Fraud flags
 * (moireFlags) are kept: Rev 2 §8 purges captures and crops, not flags.
 */
function purgeCaptures(session: Session): void {
  session.captures = [];
  session.pendingCapture = null;
  session.faultCounts = zeroFaultCounts();
  session.lastCoachText = null;
  session.lastSample = null;
}

function newSession(fixtureId: string): Session {
  return {
    flow: startRun(fixtureId),
    fixture: fixtureId,
    captures: [],
    transcript: [],
    faultCounts: zeroFaultCounts(),
    moireFlags: 0,
    lastCoachText: null,
    lastSample: null,
    pendingCapture: null,
    captureSeq: 0,
  };
}

/**
 * Session ids: Web Crypto UUID primary; a UUIDv4-shaped Math.random id
 * where Web Crypto is unavailable (same 8-4-4-4-12 string shape, so
 * callers never branch on the source).
 */
function sessionId(): string {
  try {
    const webCrypto = (
      globalThis as unknown as { crypto?: { randomUUID?: () => string } }
    ).crypto;
    const uuid = webCrypto?.randomUUID?.();
    if (typeof uuid === "string" && uuid.length > 0) return uuid;
  } catch {
    // Fall through to the shaped fallback below.
  }
  return fallbackId();
}

/** UUIDv4-shaped id (version + variant bits set) without Web Crypto. */
function fallbackId(): string {
  const hex = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  );
  hex[12] = "4";
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

/** Opaque server-generated capture ref (never accepted back for verify). */
function lockRef(session: Session): string {
  session.captureSeq += 1;
  const hex = Array.from({ length: 6 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");
  return `cap_${session.captureSeq}_${hex}`;
}

function pushTurn(s: Session, who: "system" | "you", text: string, kind?: string): void {
  s.transcript.push({ who, text, kind });
}

async function narrated(turn: string, text: string) {
  const { text: spoken, provider, skipped } = await narrate(
    { turn, text },
    { env: processEnv() },
  );
  return { text: spoken, provider, skipped };
}

/** Capture-stage → backend signal (the stage advance behind Keep). */
const CAPTURE_EVENT: Partial<Record<Stage, string>> = {
  awaiting_doc_front: "front_captured",
  awaiting_doc_back: "back_captured",
  awaiting_challenge: "challenge_done",
  awaiting_selfie: "selfie_captured",
};

/** Lock-confirm spoken text per capture stage (always announced). */
const LOCK_TEXT: Record<string, string> = {
  awaiting_doc_front: "Good framing — captured front. Keep it, or retake?",
  awaiting_doc_back: "Got the back — captured. Keep it, or retake?",
  awaiting_challenge: "Challenge frames captured. Keep them, or retake?",
  awaiting_selfie: "Selfie captured. Keep it, or retake?",
};

/** Voice equivalents for the retake pair while a lock is pending. */
const KEEP_UTTERANCE = /^\s*keep(\s+it)?\s*\.?\s*$/i;
const RETAKE_UTTERANCE = /^\s*(retake|take (it |that )?again)\s*\.?\s*$/i;

/** Near-miss targets: the same closed pair phrasing, typo-tolerant. */
const KEEP_TARGETS = ["keep", "keep it"];
const RETAKE_TARGETS = ["retake", "take again", "take it again", "take that again"];
/** Confident resolve at ≤2 edits (≤1 for 4-char "keep"); ≤4 re-asks. */
const RESOLVE_BAND = 2;
const REASK_BAND = 4;
/**
 * Fixed low-confidence nudge: a re-ask says this short line, never a
 * verbatim repeat of the full standing question (functional prompts stay
 * fixed-wording; this is the one fixed form).
 */
const REASK_NUDGE = "Sorry, I didn't catch that — keep it, or retake?";

function normalizeUtterance(utterance: string): string {
  return utterance
    .toLowerCase()
    .replace(/[.…?!]+$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const sub = diag + (a[i - 1] === b[j - 1] ? 0 : 1);
      diag = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, sub);
    }
  }
  return prev[b.length];
}

function minDistance(normalized: string, targets: string[]): number {
  return Math.min(...targets.map((t) => levenshtein(normalized, t)));
}

type PairResolution =
  | { kind: "keep" }
  | { kind: "retake" }
  | { kind: "reask" }
  | { kind: "none" };

/**
 * Recognition-tolerant pair resolution for an open lock. Exact phrasing
 * wins first; a near-miss ("kep it") resolves to the strictly closer
 * side; a low-confidence near-miss re-asks with the pair held open;
 * anything further falls through to the existing chatter handling.
 */
function resolvePair(utterance: string): PairResolution {
  if (KEEP_UTTERANCE.test(utterance)) return { kind: "keep" };
  if (RETAKE_UTTERANCE.test(utterance)) return { kind: "retake" };
  const normalized = normalizeUtterance(utterance);
  if (normalized.length === 0) return { kind: "none" };
  const dk = minDistance(normalized, KEEP_TARGETS);
  const dr = minDistance(normalized, RETAKE_TARGETS);
  const keepConfident = KEEP_TARGETS.some(
    (t) => levenshtein(normalized, t) <= (t.length <= 4 ? 1 : RESOLVE_BAND),
  );
  const retakeConfident = RETAKE_TARGETS.some(
    (t) => levenshtein(normalized, t) <= RESOLVE_BAND,
  );
  if (keepConfident && dk < dr) return { kind: "keep" };
  if (retakeConfident && dr < dk) return { kind: "retake" };
  if (Math.min(dk, dr) <= REASK_BAND) return { kind: "reask" };
  return { kind: "none" };
}

/** Capture name per stage for verdicts, echoes, and accessible names. */
const CAPTURE_NAME: Record<string, string> = {
  awaiting_doc_front: "Front",
  awaiting_doc_back: "Back",
  awaiting_challenge: "Challenge frames",
  awaiting_selfie: "Selfie",
};

/**
 * Quality-verdict turn for a lock, composed from the latest telemetry
 * sample this stage: lock-ready frames earn the full verdict, anything
 * else (no sample, faulted frame) the generic fallback. Fixed wording
 * per shape — verdicts never rotate.
 */
function qualityVerdict(stage: Stage, lastSample: Telemetry | null): string {
  const name = CAPTURE_NAME[stage] ?? "Capture";
  if (lastSample !== null && isLockReady(lastSample)) {
    const detail =
      stage === "awaiting_challenge" || stage === "awaiting_selfie"
        ? "sharp, face centered."
        : "sharp, all four corners in.";
    return `${name} captured: ${detail}`;
  }
  return `${name} captured.`;
}

/** Near-miss resolution echo ("Keeping the front.") per stage + choice. */
function pairEcho(stage: Stage, kind: "keep" | "retake"): string {
  const name = (CAPTURE_NAME[stage] ?? "capture").toLowerCase();
  return kind === "keep" ? `Keeping the ${name}.` : `Retaking the ${name}.`;
}

app.get("/api/runs", (c) =>
  c.json(
    RUN_IDS.map((id) => {
      const fx = loadFixture(id);
      return {
        id: fx.id,
        kind: fx.kind,
        state: fx.kind === "au_dl" ? fx.state : null,
      };
    }),
  ),
);

app.get("/api/run/:id", async (c) => {
  const id = c.req.param("id");
  try {
    loadFixture(id);
  } catch {
    return c.json({ error: "unknown_fixture", id }, 404);
  }
  if (c.req.query("meta")) return c.json(await evaluateFixtureMeta(id));
  return c.json(evaluateFixture(id));
});

app.get("/api/providers", (c) => c.json(configuredProviders(processEnv())));

/** Standard step body: Turn payload plus its generated panel. */
async function stepBody(
  session: Session,
  id: string,
  intent: FlowState["last_intent"] | null,
  advanced: boolean,
  templateNarrationOnly = false,
) {
  const turn = session.flow.last_turn;
  const kind = turn?.kind ?? "progress";
  const text = turn?.text ?? "";
  // Suppressed telemetry repeats never touch the model chain: the client
  // discards their narration, so template text is the honest response.
  const narration = templateNarrationOnly
    ? {
        text: templateNarration(kind, text),
        provider: "local" as const,
        skipped: ["model: suppressed repeat-episode"],
      }
    : await narrated(kind, text);
  return {
    sessionId: id,
    stage: session.flow.stage,
    turn: turn?.kind ?? null,
    text,
    intent,
    advanced,
    narration,
    transcript: session.transcript,
    captures: session.captures,
    capturesPurged: session.flow.capturesPurged,
    report: reportFor(session),
    panel: turn?.panel ?? generatePanel(kind, session.flow.stage, { text }),
    pendingCapture: session.pendingCapture,
  };
}

app.post("/api/session", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { fixtureId?: string };
  const fixtureId = body.fixtureId ?? RUN_IDS[0];
  try {
    loadFixture(fixtureId);
  } catch {
    return c.json({ error: "unknown_fixture", id: fixtureId }, 404);
  }

  const id = sessionId();
  const session = newSession(fixtureId);
  pushTurn(session, "system", session.flow.last_turn?.text ?? "", session.flow.last_turn?.kind);
  sessions.set(id, session);
  return c.json(await stepBody(session, id, null, true));
});

function reportFor(session: Session): Report | null {
  if (session.flow.stage !== "decided") return null;
  return evaluateFixture(session.fixture);
}

/** Near-miss resolution echo: heard form, resolved choice, spoken echo. */
interface PairEcho {
  heard: string;
  resolved: "keep" | "retake";
  text: string;
}

/** Keep the pending lock: stage-verified, then the backend signal advances. */
async function doKeep(
  session: Session,
  id: string,
  viaVoice: string | null,
  echo: PairEcho | null = null,
) {
  if (session.pendingCapture === null) {
    return { status: 409 as const, body: { error: "nothing_to_keep" } };
  }
  const event = CAPTURE_EVENT[session.flow.stage];
  if (!event) {
    return {
      status: 409 as const,
      body: { error: "wrong_stage", stage: session.flow.stage },
    };
  }
  session.captures.push(session.pendingCapture);
  session.pendingCapture = null;
  if (echo !== null) {
    pushTurn(session, "you", `${echo.heard} → ${echo.resolved}`);
    pushTurn(session, "system", echo.text, "progress");
  } else {
    pushTurn(session, "you", viaVoice ?? "Keep");
  }
  const before = session.flow.stage;
  session.flow = signal(session.flow, event);
  if (session.flow.stage !== before) {
    session.lastCoachText = null;
    session.lastSample = null;
  }
  pushTurn(
    session,
    "system",
    session.flow.last_turn?.text ?? "",
    session.flow.last_turn?.kind,
  );
  const body = await stepBody(session, id, null, session.flow.stage !== before);
  return {
    status: 200 as const,
    body: echo !== null ? { ...body, echo: echo.text } : body,
  };
}

/** Retake the pending lock: discard it, re-instruct, hold the stage. */
async function doRetake(
  session: Session,
  id: string,
  viaVoice: string | null,
  echo: PairEcho | null = null,
) {
  if (session.pendingCapture === null) {
    // No phantom Turn, no last_turn clobber — just the conflict.
    return { status: 409 as const, body: { error: "nothing_to_retake" } };
  }
  session.pendingCapture = null;
  // Fresh guidance episode: the next lock verdicts from new samples only.
  session.lastSample = null;
  if (echo !== null) {
    pushTurn(session, "you", `${echo.heard} → ${echo.resolved}`);
    pushTurn(session, "system", echo.text, "progress");
  } else {
    pushTurn(session, "you", viaVoice ?? "Retake");
  }
  const turn = captureInstruct(session.flow);
  session.flow = { ...session.flow, last_turn: turn };
  pushTurn(session, "system", turn.text, turn.kind);
  const body = await stepBody(session, id, null, false);
  return {
    status: 200 as const,
    body: echo !== null ? { ...body, echo: echo.text } : body,
  };
}

app.post("/api/session/:id/say", async (c) => {
  const session = sessions.get(c.req.param("id"));
  if (!session) return c.json({ error: "unknown_session" }, 404);

  const body = (await c.req.json().catch(() => ({}))) as { utterance?: string };
  const utterance = String(body.utterance ?? "");
  // Voice equivalents for the open retake pair (closed intents untouched;
  // the advance still runs through the backend signal inside doKeep).
  // Near-misses resolve with an echo; low-confidence re-asks hold the
  // pair open without touching the lock turn.
  if (session.pendingCapture !== null) {
    const resolved = resolvePair(utterance);
    if (resolved.kind === "keep" || resolved.kind === "retake") {
      const exact =
        resolved.kind === "keep"
          ? KEEP_UTTERANCE.test(utterance)
          : RETAKE_UTTERANCE.test(utterance);
      const echo: PairEcho | null = exact
        ? null
        : {
            heard: utterance,
            resolved: resolved.kind,
            text: pairEcho(session.flow.stage, resolved.kind),
          };
      const done =
        resolved.kind === "keep"
          ? await doKeep(session, c.req.param("id"), utterance, echo)
          : await doRetake(session, c.req.param("id"), utterance, echo);
      return c.json(done.body, done.status);
    }
    if (resolved.kind === "reask") {
      pushTurn(session, "you", utterance);
      // Fixed nudge with the pair panel re-attached: the pair stays open
      // and keeps its card, but Aria says the short nudge instead of
      // re-speaking the full standing question with no transcript twin.
      const nudge = {
        kind: "re-ask" as const,
        text: REASK_NUDGE,
        panel: generatePanel("progress", session.flow.stage, {
          text: REASK_NUDGE,
          pending: true,
          ref: session.pendingCapture ?? "",
        }),
      };
      session.flow = { ...session.flow, last_turn: nudge };
      pushTurn(session, "system", nudge.text, nudge.kind);
      return c.json(await stepBody(session, c.req.param("id"), null, false));
    }
  }
  // Embedded or negated pair phrasing ("don't retake") holds the pair open:
  // no advance, no discard, no lock-turn clobber — and it never reaches
  // matchIntent, where "don't" would read as deny and purge the run.
  if (
    session.pendingCapture !== null &&
    /retake|take\s+(it\s+|that\s+)?again/i.test(utterance)
  ) {
    pushTurn(session, "you", utterance);
    return c.json(await stepBody(session, c.req.param("id"), null, false));
  }
  const before = session.flow.stage;
  const next = say(session.flow, utterance);
  session.flow = next;
  // Full deny purge: captures are deleted on deny/revoke, not flagged.
  if (next.last_intent === "deny") purgeCaptures(session);
  if (next.stage !== before) {
    session.lastCoachText = null;
    session.lastSample = null;
  }

  pushTurn(session, "you", utterance);
  pushTurn(session, "system", next.last_turn?.text ?? "", next.last_turn?.kind);
  return c.json(await stepBody(session, c.req.param("id"), next.last_intent, next.stage !== before));
});

app.post("/api/session/:id/signal", async (c) => {
  const session = sessions.get(c.req.param("id"));
  if (!session) return c.json({ error: "unknown_session" }, 404);

  const body = (await c.req.json().catch(() => ({}))) as { event?: string };
  const event = body.event ?? "";
  const before = session.flow.stage;
  const next = signal(session.flow, event);
  session.flow = next;
  // A dead camera invalidates earlier frames: the stand-in lock verdicts
  // generic, never from a stale live sample.
  if (event === "camera_denied") session.lastSample = null;
  // Captures attach on backend capture events only (speech never captures).
  if (next.stage !== before) {
    if (event === "front_captured") session.captures.push(`front:${session.fixture}`);
    if (event === "back_captured") session.captures.push(`back:${session.fixture}`);
    if (event === "selfie_captured") session.captures.push(`selfie:${session.fixture}`);
    // A stage advance retires the old guidance (same fault re-announces)
    // and any lock the advance left behind (fail-closed, UI-unreachable).
    session.lastCoachText = null;
    session.lastSample = null;
    session.pendingCapture = null;
  }

  pushTurn(session, "system", next.last_turn?.text ?? "", next.last_turn?.kind);
  return c.json(await stepBody(session, c.req.param("id"), null, next.stage !== before));
});

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/**
 * Telemetry/coach loop. One client-computed sample in; coached Turn,
 * lock-readiness, and the announced flag out. Speech is throttled to one
 * instruction per fault episode (repeats return announced:false and leave
 * the transcript alone); the 3rd consecutive fault escalates to `warn`.
 * Telemetry never advances the stage — the run parks under warn.
 */
async function handleTelemetry(c: {
  req: {
    param: (name: string) => string;
    json: () => Promise<unknown>;
  };
  json: (body: unknown, status?: number) => Response;
}) {
  const session = sessions.get(c.req.param("id"));
  if (!session) return c.json({ error: "unknown_session" }, 404);

  const body = ((await c.req.json().catch(() => ({}))) ?? {}) as Record<
    string,
    unknown
  >;
  if (body.denied || body.cameraDenied) {
    const next = signal(session.flow, "camera_denied");
    session.flow = next;
    session.lastSample = null;
    pushTurn(session, "system", next.last_turn?.text ?? "", next.last_turn?.kind);
    const step = await stepBody(session, c.req.param("id"), null, false);
    return c.json({
      ...step,
      announced: true,
      lockReady: false,
      fault: null,
      faultCounts: { ...session.faultCounts },
      moireFlags: session.moireFlags,
    });
  }
  const sample: Telemetry = {
    glare: num(body.glare),
    finger: num(body.finger),
    occlusion: num(body.occlusion),
    skew: num(body.skew),
    dark: num(body.dark),
    blur: num(body.blur),
    moire: num(body.moire),
    screenshot: body.screenshot as Telemetry["screenshot"],
    missingBack: body.missingBack as Telemetry["missingBack"],
  };
  // Latest sample this stage — the lock verdict reads it, then it dies
  // on advance, retake, deny, or camera loss (never a stale verdict).
  session.lastSample = { ...sample };
  const fault: FaultKey | null = faultKey(sample);
  if (fault === null) {
    session.faultCounts = zeroFaultCounts();
  } else {
    for (const key of FAULT_KEYS) {
      session.faultCounts[key] = key === fault ? session.faultCounts[key] + 1 : 0;
    }
  }
  // Moiré-flag seam for the deferred fraud-matrix inputs (§7).
  if (fault === "moire") session.moireFlags += 1;

  const consecutive = fault === null ? 0 : session.faultCounts[fault];
  const fired = withPanel(coach({ ...sample, turns: consecutive }), session.flow.stage);
  const lockReady = isLockReady(sample);
  const announced = fired.text !== session.lastCoachText;
  if (announced) {
    session.lastCoachText = fired.text;
    session.flow = { ...session.flow, last_turn: fired };
    pushTurn(session, "system", fired.text, fired.kind);
  }
  const step = await stepBody(session, c.req.param("id"), null, false, !announced);
  return c.json({
    ...step,
    turn: fired.kind,
    text: fired.text,
    panel: fired.panel ?? generatePanel(fired.kind, session.flow.stage, { text: fired.text }),
    announced,
    lockReady,
    fault,
    faultCounts: { ...session.faultCounts },
    moireFlags: session.moireFlags,
  });
}

app.post("/api/session/:id/telemetry", (c) => handleTelemetry(c));
app.post("/api/session/:id/sample", (c) => handleTelemetry(c));

/** Lock the current frame: stores an opaque ref behind the retake pair. */
async function handleLock(c: {
  req: { param: (name: string) => string };
  json: (body: unknown, status?: number) => Response;
}) {
  const session = sessions.get(c.req.param("id"));
  if (!session) return c.json({ error: "unknown_session" }, 404);
  if (!CAPTURE_STAGES.has(session.flow.stage)) {
    return c.json({ error: "wrong_stage", stage: session.flow.stage }, 409);
  }
  const ref = lockRef(session);
  session.pendingCapture = ref;
  // Verdict turn first, then the fixed keep/retake question: two separate
  // turns, so the non-visual review path hears quality before the choice.
  const verdict = qualityVerdict(session.flow.stage, session.lastSample);
  pushTurn(session, "system", verdict, "progress");
  const text = LOCK_TEXT[session.flow.stage] ?? "Captured. Keep it, or retake?";
  const fired = {
    kind: "progress" as const,
    text,
    panel: generatePanel("progress", session.flow.stage, {
      text,
      pending: true,
      ref,
    }),
  };
  session.flow = { ...session.flow, last_turn: fired };
  pushTurn(session, "system", text, fired.kind);
  const body = await stepBody(session, c.req.param("id"), null, false);
  return c.json({ ...body, verdict });
}

app.post("/api/session/:id/lock", (c) => handleLock(c));
app.post("/api/session/:id/capture/lock", (c) => handleLock(c));

app.post("/api/session/:id/keep", async (c) => {
  const session = sessions.get(c.req.param("id"));
  if (!session) return c.json({ error: "unknown_session" }, 404);
  const kept = await doKeep(session, c.req.param("id"), null);
  return c.json(kept.body, kept.status);
});
app.post("/api/session/:id/capture/keep", async (c) => {
  const session = sessions.get(c.req.param("id"));
  if (!session) return c.json({ error: "unknown_session" }, 404);
  const kept = await doKeep(session, c.req.param("id"), null);
  return c.json(kept.body, kept.status);
});

app.post("/api/session/:id/retake", async (c) => {
  const session = sessions.get(c.req.param("id"));
  if (!session) return c.json({ error: "unknown_session" }, 404);
  const retaken = await doRetake(session, c.req.param("id"), null);
  return c.json(retaken.body, retaken.status);
});
app.post("/api/session/:id/capture/retake", async (c) => {
  const session = sessions.get(c.req.param("id"));
  if (!session) return c.json({ error: "unknown_session" }, 404);
  const retaken = await doRetake(session, c.req.param("id"), null);
  return c.json(retaken.body, retaken.status);
});

/** Action-form capture alias: { action: "lock" | "keep" | "retake" }. */
app.post("/api/session/:id/capture", async (c) => {
  const session = sessions.get(c.req.param("id"));
  if (!session) return c.json({ error: "unknown_session" }, 404);
  const body = (await c.req.json().catch(() => ({}))) as { action?: string };
  const action = body.action ?? "lock";
  if (action === "keep") {
    const kept = await doKeep(session, c.req.param("id"), null);
    return c.json(kept.body, kept.status);
  }
  if (action === "retake") {
    const retaken = await doRetake(session, c.req.param("id"), null);
    return c.json(retaken.body, retaken.status);
  }
  if (action === "lock") return handleLock(c);
  return c.json({ error: "unknown_action", action }, 400);
});

app.get("/page", (c) => c.html(PAGE));

export default app;

const PAGE = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Aria — AU Voice IDV demo</title>
<style>
  :root { color-scheme: dark;
          --base:#0B0E13; --raised:#12161D; --overlay:#1A2130;
          --ink:#EDEFF4; --ink2:#9AA3B2; --inkfaint:#5B6472;
          --voice:#7DD3FC; --guide:#38BDF8;
          --ok:#4ADE80; --bad:#F87171; --meh:#FBBF24;
          --line:#1b2230; --panel:#11161e; --hairline:#222B3A;
          --dim:#8b93a1; }
  * { box-sizing:border-box; }
  body { margin:0; padding:2rem 1.5rem 4rem; background:#0B0E13; color:#EDEFF4;
         font:17px/1.55 ui-sans-serif,-apple-system,system-ui,sans-serif; max-width:56rem; }
  h1 { font-size:1.3rem; margin:0 0 .2rem; letter-spacing:-.01em; }
  .sub { color:var(--ink2); font-size:.85rem; margin:0 0 1.5rem; }
  .row { display:flex; flex-wrap:wrap; gap:.4rem; margin:0 0 .75rem; align-items:center; }
  button { background:var(--raised); color:inherit; border:1px solid #262d38; border-radius:.45rem;
           padding:.55rem .8rem; font:inherit; font-size:.82rem; cursor:pointer; min-height:44px; }
  button:hover:not(:disabled) { border-color:#3b4554; }
  button[aria-pressed="true"] { border-color:#4b6ea8; color:#cfe0ff; }
  button.primary { background:#1b2740; border-color:#35507e; font-weight:600; }
  button:disabled { opacity:.45; cursor:default; }
  #stage { font-size:.72rem; letter-spacing:.09em; text-transform:uppercase; color:var(--ink2); }
  #orbRow { display:flex; gap:1rem; align-items:flex-start; margin:1rem 0; }
  #orb { flex:none; width:2.6rem; height:2.6rem; border-radius:9999px;
         border:2px solid #5B6472; margin-top:.2rem; }
  #orb.listening, #orb.speaking { border-color:#7DD3FC;
         box-shadow:0 0 18px rgba(125,211,252,.35); }
  #spoken { font-size:28px; font-weight:600; line-height:1.3; letter-spacing:-.01em;
            color:#EDEFF4; min-height:1.3em; }
  #captureWrap { margin:1rem 0; }
  #captureWrap[hidden] { display:none; }
  #dockZone { margin:1rem 0; }
  #dockZone:empty { display:none; }
  #captureFrame { position:relative; border-radius:16px; overflow:hidden;
                  background:#000; aspect-ratio:4/3; max-height:60vh; }
  #viewfinder { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
  #guides { position:absolute; inset:0; width:100%; height:100%; }
  #captureFrame.locked { box-shadow:0 0 0 2px #4ADE80, 0 0 24px rgba(74,222,128,.3); }
  #captureMeta { font-size:.72rem; letter-spacing:.09em; text-transform:uppercase;
                 color:var(--ink2); margin:.5rem 0; }
  #coach { background:#12161D; border:1px solid #222B3A; border-radius:10px;
           padding:.8rem 1rem; margin:.5rem 0 .75rem; min-height:2.6em; }
  #coach:empty { display:none; }
  #panel { margin:1rem 0; }
  #panel:empty { display:none; }
  #panel .card, #dockZone .card { background:#12161D; border:1px solid #222B3A; border-radius:10px;
                 padding:.8rem 1rem; }
  #panel .ptitle, #dockZone .ptitle { font-size:.72rem; letter-spacing:.09em; text-transform:uppercase;
                   color:var(--ink2); margin-bottom:.4rem; }
  #panel .ptext, #dockZone .ptext { margin-bottom:.6rem; }
  #panel .pverdict, #dockZone .pverdict { font-size:.85rem; color:var(--ink2); margin:.4rem 0 .6rem; }
  #panel .confirm-card img.confirm-img, #dockZone .confirm-card img.confirm-img { width:100%; border-radius:6px; margin:.4rem 0; display:block; }
  #panel .standin-label, #dockZone .standin-label { font-size:.85rem; color:var(--ink2); border:1px dashed #2b4a5e;
                          border-radius:6px; padding:.6rem .8rem; margin:.4rem 0; }
  #spoken:focus, #panel .ptitle:focus, #dockZone .ptitle:focus { outline:2px solid #35507e; outline-offset:2px; }
  #panel .ptag { font-size:.66rem; letter-spacing:.08em; text-transform:uppercase;
                 color:var(--inkfaint); margin-top:.6rem; }
  #panel ol.steps { list-style:none; padding:0; margin:0; display:flex; gap:.5rem; flex-wrap:wrap; }
  #panel ol.steps li { font-size:.78rem; padding:.3rem .6rem; border:1px solid #222B3A;
                       border-radius:6px; color:var(--ink2); display:block; border-bottom:1px solid #222B3A; }
  #panel ol.steps li.done { color:#4ADE80; border-color:#1f4d33; }
  #panel ol.steps li.active { color:#7DD3FC; border-color:#2b4a5e; }
  #panel dl.rows { margin:0; font-size:.85rem; }
  #panel dl.rows dt { color:var(--ink2); font-size:.72rem; text-transform:uppercase;
                      letter-spacing:.08em; }
  #panel dl.rows dd { margin:.1rem 0 .6rem; }
  #transcript { margin:1.5rem 0 1rem; display:flex; flex-direction:column; gap:.6rem; }
  .turn { padding:.7rem .9rem; border-left:2px solid #2a3444; background:#0e131b; border-radius:0 .4rem .4rem 0; }
  .turn.you { border-left-color:#3f6fbf; background:#0d1420; }
  .turn.warn { border-left-color:#a2601f; }
  .turn .who { font-size:.66rem; letter-spacing:.1em; text-transform:uppercase; color:var(--dim); }
  .turn:not(.you) .who { text-transform:none; }
  .turn .what { margin-top:.15rem; }
  #listen { font-size:.8rem; color:#9fc3ff; min-height:1.2em; }
  #decision { font-size:1.9rem; font-weight:650; letter-spacing:-.02em; margin:1.5rem 0 .2rem; }
  .pass { color:var(--ok); } .fail { color:var(--bad); } .inconclusive { color:var(--meh); }
  h2 { font-size:.72rem; text-transform:uppercase; letter-spacing:.1em; color:var(--dim); margin:1.4rem 0 .3rem; }
  ul { list-style:none; padding:0; margin:0; }
  li { display:grid; grid-template-columns:1.1rem 14rem 1fr; gap:.7rem; padding:.3rem 0;
       border-bottom:1px solid var(--line); font-size:.82rem; align-items:baseline; }
  .id { font-family:ui-monospace,monospace; font-size:.76rem; }
  .ev { color:var(--dim); font-family:ui-monospace,monospace; font-size:.72rem; }
  form { display:flex; gap:.5rem; margin-top:1rem; }
  input { flex:1; background:var(--panel); border:1px solid #262d38; border-radius:.45rem;
          color:inherit; padding:.6rem .8rem; font:inherit; font-size:.85rem; }
  input:focus { outline:2px solid #35507e; outline-offset:1px; }
  .note { color:var(--dim); font-size:.78rem; margin-top:2rem; border-top:1px solid var(--line); padding-top:1rem; }
  details { font-size:.85rem; margin-top:.4rem; }
  summary { cursor:pointer; }
  details ol { list-style:decimal; padding-left:1.4rem; }
  details li { display:list-item; border-bottom:1px solid var(--line); padding:.3rem 0; }
  #tiermsg { font-size:1rem; margin:.4rem 0; }
  @media (prefers-reduced-motion: reduce) {
    #orb.listening, #orb.speaking { box-shadow:none; }
    #captureFrame.locked { box-shadow:0 0 0 2px #4ADE80; }
  }
</style>

<h1>Aria — AU Voice IDV demo</h1>
<p class="sub">Voice-guided capture with Aria. Deterministic checks decide; voice narrates, never decides.</p>

<div class="row" id="fixtures" role="group" aria-label="Choose a fixture"></div>
<div class="row">
  <button class="primary" id="start" disabled>Start run</button>
  <button id="voiceToggle" aria-pressed="false" title="Self-voicing: auto follows screen-reader detection">Voice: auto</button>
  <span id="stage">idle</span>
</div>

<div id="assistant">
  <div id="orbRow">
    <div id="orb" role="img" aria-label="Assistant voice state: idle"></div>
    <div id="spoken" aria-live="polite" tabindex="-1"></div>
  </div>
  <div id="captureWrap" hidden>
    <div id="captureFrame">
      <video id="viewfinder" playsinline muted></video>
      <canvas id="guides"></canvas>
    </div>
    <div id="captureMeta">capturing…</div>
    <div id="coach" aria-live="polite"></div>
    <div class="row">
      <button class="primary" id="lockBtn" disabled>Lock capture</button>
      <button id="standinBtn" hidden>Use stand-in capture</button>
    </div>
  </div>
  <div id="panel"></div>
</div>

<div id="transcript" aria-live="polite"></div>
<div id="listen" aria-live="polite"></div>
<div id="dockZone"></div>

<form id="typed">
  <input id="utterance" autocomplete="off" placeholder="Or type what you would say" aria-label="Typed input">
  <button type="submit">Send</button>
</form>

<div id="decision"></div>
<div id="tiermsg"></div>
<div id="checks"></div>
<p class="note" id="note"></p>

<script type="module">
const $ = (id) => document.getElementById(id);
const fixturesEl = $('fixtures'), transcriptEl = $('transcript'), stageEl = $('stage');
const listenEl = $('listen'), decisionEl = $('decision'), tierEl = $('tiermsg');
const checksEl = $('checks');
const noteEl = $('note'), startBtn = $('start'), inputEl = $('utterance');
const orbEl = $('orb'), spokenEl = $('spoken'), panelEl = $('panel');
const captureWrap = $('captureWrap'), captureFrame = $('captureFrame');
const videoEl = $('viewfinder'), guidesEl = $('guides'), coachEl = $('coach');
const captureMeta = $('captureMeta'), lockBtn = $('lockBtn'), standinBtn = $('standinBtn');
const dockZone = $('dockZone');
const voiceToggle = $('voiceToggle');
const frameHome = captureWrap.parentNode, frameHomeNext = captureWrap.nextSibling;
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

const CAPTURE_SIGNAL = {
  awaiting_doc_front: 'front_captured',
  awaiting_doc_back: 'back_captured',
  awaiting_challenge: 'challenge_done',
  awaiting_selfie: 'selfie_captured',
};
const READING_SIGNAL = {
  reading_front: 'frames_done',
  reading_back: 'frames_done',
  comparing: 'tier_done',
};
const CAPTURE_LABEL = {
  awaiting_doc_front: 'Capture, document front, guidance active',
  awaiting_doc_back: 'Capture, document back, guidance active',
  awaiting_challenge: 'Capture, challenge, guidance active',
  awaiting_selfie: 'Capture, selfie, guidance active',
};
const CAPTURE_NOUN = {
  awaiting_doc_front: 'document front',
  awaiting_doc_back: 'document back',
  awaiting_challenge: 'challenge frames',
  awaiting_selfie: 'selfie',
};
// Snapshot-failed fallback: the card still pairs a generic verdict caption
// with Keep/Retake when the frame grab fails on live video.
const GENERIC_VERDICT = {
  awaiting_doc_front: 'Front captured.',
  awaiting_doc_back: 'Back captured.',
  awaiting_challenge: 'Challenge frames captured.',
  awaiting_selfie: 'Selfie captured.',
};

let fixtureId = null;
let sessionId = null;
let busy = false;
let micParked = null;
let silentStreak = 0;
// Shared recovery tail for all three parked-mic remedies.
const START_RETRY_SUFFIX = ', then press Start to try voice again.';
let activeRecognition = null;
let voiceGen = 0;
let silenceParked = false;
let pendingRef = null;
// Confirm-card review state: device-local snapshot (data URL, never posted),
// server verdict caption, stand-in flag, and whether the card is on screen.
let pendingSnapshot = null;
let pendingVerdict = null;
let pendingStandin = false;
let cardOpen = false;
let confirmCardEl = null;
let captureStream = null;
let captureStage = null;
let sampling = false;
let sampleInflight = false;
let sampleFails = 0;
let sampleDownUntil = 0;
let sampleTimer = null;
let lockBusy = false;
// TTS/SR arbitration: keyboard-first use signals a screen reader, and
// self-voicing yields to its live-region announcements; the Voice toggle
// overrides (null = auto, true = forced on, false = forced off).
let srDetected = false;
let voiceOverride = null;
window.addEventListener('keydown', (e) => {
  if (e && e.key === 'Tab') srDetected = true;
});

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

fetch('/api/providers').then(r => r.json()).then(p => {
  noteEl.textContent = 'Narration: ' + (p.meta ? 'Meta Model API' : p.openrouter ? 'OpenRouter' : 'local templates')
    + ' · Speech in: ' + (SR ? 'browser recognition' : 'typed only')
    + ' · Speech out: browser synthesis';
});

fetch('/api/runs').then(r => r.json()).then(runs => {
  for (const run of runs) {
    const b = document.createElement('button');
    b.textContent = run.id;
    b.title = run.kind;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      fixtureId = run.id;
      for (const other of fixturesEl.children) other.setAttribute('aria-pressed', String(other === b));
      startBtn.disabled = false;
    });
    fixturesEl.append(b);
  }
});

function renderTranscript(lines) {
  transcriptEl.replaceChildren();
  for (const line of lines) {
    const wrap = document.createElement('div');
    wrap.className = 'turn' + (line.who === 'you' ? ' you' : line.kind === 'warn' ? ' warn' : '');
    const label = document.createElement('div');
    label.className = 'who';
    label.textContent = line.who === 'system' ? 'Aria' : 'you';
    const body = document.createElement('div');
    body.className = 'what';
    body.textContent = line.text;             // textContent only: never innerHTML
    wrap.append(label, body);
    transcriptEl.append(wrap);
  }
  transcriptEl.lastChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/** Exactly one live spoken line; the verdict announces assertively, once. */
function setSpoken(text, assertive) {
  spokenEl.textContent = text;
  spokenEl.setAttribute('aria-live', assertive === true ? 'assertive' : 'polite');
}

/** One coach card; a new instruction replaces the old, never stacks. */
function setCoach(text) {
  coachEl.replaceChildren();
  if (text) coachEl.textContent = text;       // textContent only: never innerHTML
}

function setOrb(state) {
  orbEl.classList.toggle('listening', state === 'listening');
  orbEl.classList.toggle('speaking', state === 'speaking');
  orbEl.setAttribute('aria-label', 'Assistant voice state: ' + state);
}

/** Friendly-female voice preference; null falls back to the default voice. */
const FEMALE_VOICE_HINT = /female|samantha|zira|aria|jenny|sonia|neerja|kate|serena|victoria/i;
function pickVoice() {
  try {
    const voices = speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;
    const en = voices.filter((v) => (v.lang || '').toLowerCase().startsWith('en'));
    const pool = en.length > 0 ? en : voices;
    return pool.find((v) => FEMALE_VOICE_HINT.test(v.name || '')) ?? null;
  } catch {
    return null;
  }
}
// Prime the engine's voice list at load so the preferred voice is ready
// sooner; Chrome populates getVoices() asynchronously after first call.
try { speechSynthesis.getVoices(); } catch { /* no TTS - speak() guards */ }
/** Voice toggle: auto → on → off. Overrides SR detection either way. */
voiceToggle.addEventListener('click', () => {
  voiceOverride = voiceOverride === null ? true : voiceOverride === true ? false : null;
  voiceToggle.textContent = voiceOverride === null ? 'Voice: auto' : voiceOverride ? 'Voice: on' : 'Voice: off';
  voiceToggle.setAttribute('aria-pressed', String(voiceOverride === true));
});
function speak(text) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis || !text) return resolve();
    // SR arbitration: when a screen reader carries the live regions,
    // self-voicing stays silent unless the user forced it on.
    if (voiceOverride === false || (voiceOverride === null && srDetected === true)) {
      return resolve();
    }
    setOrb('speaking');
    let done = false;
    const finish = () => { if (!done) { done = true; setOrb('idle'); resolve(); } };
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    u.pitch = 1.1;
    const voice = pickVoice();
    if (voice) {
      u.voice = voice;
      if (voice.lang) u.lang = voice.lang;
    }
    u.onend = finish;
    u.onerror = finish;
    speechSynthesis.speak(u);
    // Some engines never fire onend (headless, or a voice that failed to load).
    // Without this the whole run would stop dead on a silent sentence.
    setTimeout(finish, Math.min(9000, 1500 + text.length * 60));
  });
}

async function post(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = new Error(path + ' -> ' + res.status);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * One honest message per failure kind: an expired session needs Start,
 * anything else is the network.
 */
function postError(err) {
  return err && err.status === 404
    ? 'Session expired — press Start to begin again.'
    : 'Could not reach the server.';
}

function pause(ms) { return new Promise(r => setTimeout(r, ms)); }
function auditPanel(audit) {
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = '3 attack hypotheses (' + (audit.provider === 'meta' ? 'Spark' : 'local templates') + ')';
  details.append(summary);
  const list = document.createElement('ol');
  for (const h of audit.hypotheses) {
    const li = document.createElement('li');
    li.textContent = h;                 // textContent only: never innerHTML
    list.append(li);
  }
  details.append(list);
  const note = document.createElement('p');
  note.className = 'note';
  note.textContent = 'Annotations only — the Decision above comes from deterministic checks.';
  details.append(note);
  return details;
}

/** Decision screen, data-bound to the generated evidence panel. */
function renderDecisionFromPanel(panel, report) {
  const verdict = (panel && panel.verdict) || (report && report.decision) || '';
  const panelEvidence = panel && panel.evidence;
  const evidence = (panelEvidence && panelEvidence.length > 0 ? panelEvidence : null) || (report && report.failedFirst) || [];
  const userMessage = (panel && panel.userMessage) || (report && report.userMessage) || '';
  const limitations = (panel && panel.limitations) || (report && report.limitations) || [];
  const fixture = (report && report.fixture) || fixtureId;

  decisionEl.textContent = verdict;
  decisionEl.className = verdict === 'verified' ? 'pass'
    : verdict === 'rejected' ? 'fail' : 'inconclusive';

  tierEl.textContent = userMessage;

  checksEl.replaceChildren();
  const h = document.createElement('h2');
  h.textContent = 'checks — failures first';
  const ul = document.createElement('ul');
  for (const check of evidence) {
    const li = document.createElement('li');
    const mark = document.createElement('span');
    mark.className = check.result === 'pass' ? 'pass' : check.result === 'fail' ? 'fail' : 'inconclusive';
    mark.textContent = check.result === 'pass' ? '\u2713' : check.result === 'fail' ? '\u2717' : '?';
    const name = document.createElement('span');
    name.className = 'id';
    name.textContent = check.id;
    const ev = document.createElement('span');
    ev.className = 'ev';
    ev.textContent = check.evidence;
    li.append(mark, name, ev);
    ul.append(li);
  }
  checksEl.append(h, ul);

  const limits = document.createElement('h2');
  limits.textContent = 'limitations';
  checksEl.append(limits);
  const lulum = document.createElement('ul');
  for (const line of limitations) {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.textContent = '–';
    const what = document.createElement('span');
    what.textContent = line;
    const spacer = document.createElement('span');
    li.append(dot, what, spacer);
    lulum.append(li);
  }
  checksEl.append(lulum);

  const auditH = document.createElement('h2');
  auditH.textContent = 'attack surface';
  checksEl.append(auditH);
  const auditBox = document.createElement('div');
  checksEl.append(auditBox);
  if (report && report.audit) {
    auditBox.append(auditPanel(report.audit));
  } else {
    // On-demand so a slow model call never delays the Decision screen.
    const b = document.createElement('button');
    b.textContent = 'Run adversarial audit';
    b.addEventListener('click', async () => {
      b.disabled = true;
      b.textContent = 'Auditing…';
      try {
        const res = await fetch('/api/run/' + fixture + '?meta=1');
        if (!res.ok) throw new Error('audit -> ' + res.status);
        const meta = await res.json();
        auditBox.replaceChildren(auditPanel(meta.audit));
      } catch {
        b.disabled = false;
        b.textContent = 'Run adversarial audit';
      }
    });
    auditBox.append(b);
  }
}

/**
 * Generated-panel renderer. One panel per Turn, replaced on Turn close;
 * unknown shapes fail closed to the text twin. Every choice acts — there
 * are no dead controls.
 */
/** Remove the docked confirm card node, if present (never the live frame). */
function dropConfirmCard() {
  if (confirmCardEl !== null) { confirmCardEl.remove(); confirmCardEl = null; }
}
function renderPanel(panel, fallbackText) {
  panelEl.replaceChildren();
  dropConfirmCard();
  if (!panel || typeof panel !== 'object') {
    if (fallbackText) panelEl.textContent = fallbackText;
    return;
  }
  if (panel.primitive === 'evidence-peek') {
    renderDecisionFromPanel(panel, null);
    return;
  }
  const card = document.createElement('div');
  const isConfirm = panel.primitive === 'retake-pair';
  card.className = isConfirm ? 'card confirm-card' : 'card';
  if (isConfirm) {
    card.setAttribute('role', 'alertdialog');
    card.setAttribute('aria-label', panel.title || 'Confirm capture');
  }
  const title = document.createElement(isConfirm ? 'h2' : 'div');
  title.className = 'ptitle';
  if (isConfirm) {
    title.id = 'confirmHeading';
    title.tabIndex = -1;
  }
  title.textContent = panel.title || 'Update';
  card.append(title);
  // Confirm card: device-local snapshot (decorative img, never uploaded),
  // fixture label on the stand-in path, and the quality-verdict caption.
  // textContent + createElement only: never innerHTML.
  if (isConfirm) {
    if (pendingSnapshot !== null) {
      const img = document.createElement('img');
      img.className = 'confirm-img';
      img.src = pendingSnapshot;
      img.alt = '';
      card.append(img);
    } else if (pendingStandin === true) {
      const standin = document.createElement('div');
      standin.className = 'standin-label';
      standin.textContent = 'Stand-in capture' + (fixtureId ? ' — ' + fixtureId : '');
      card.append(standin);
    }
    if (pendingVerdict) {
      const caption = document.createElement('div');
      caption.className = 'pverdict';
      caption.textContent = pendingVerdict;
      card.append(caption);
    }
    cardOpen = true;
  }
  if (panel.text) {
    const twin = document.createElement('div');
    twin.className = 'ptext';
    twin.textContent = panel.text;            // textContent only: never innerHTML
    card.append(twin);
  }
  if ((panel.primitive === 'choice-list' || panel.primitive === 'retake-pair') && Array.isArray(panel.choices)) {
    const row = document.createElement('div');
    row.className = 'row';
    // Keep/Retake accessible names carry the capture ("Keep document front").
    const noun = isConfirm ? CAPTURE_NOUN[captureStage] : null;
    for (const choice of panel.choices) {
      const b = document.createElement('button');
      b.textContent = choice.label;           // textContent only: never innerHTML
      if (noun && (choice.id === 'keep' || choice.id === 'retake')) {
        b.setAttribute('aria-label', (choice.id === 'keep' ? 'Keep ' : 'Retake ') + noun);
      }
      b.addEventListener('click', () => onChoice(choice));
      row.append(b);
    }
    card.append(row);
  } else if (panel.primitive === 'progress-steps' && Array.isArray(panel.steps)) {
    const ol = document.createElement('ol');
    ol.className = 'steps';
    for (const step of panel.steps) {
      const li = document.createElement('li');
      li.className = step.state;
      li.textContent = step.label;            // textContent only: never innerHTML
      ol.append(li);
    }
    card.append(ol);
  } else if (panel.primitive === 'confirm-row' && Array.isArray(panel.rows)) {
    const dl = document.createElement('dl');
    dl.className = 'rows';
    for (const row of panel.rows) {
      const dt = document.createElement('dt');
      dt.textContent = row.label;
      const dd = document.createElement('dd');
      dd.textContent = row.value;             // textContent only: never innerHTML
      dl.append(dt, dd);
    }
    card.append(dl);
  } else if (panel.primitive !== 'text') {
    // Unknown shape: fail closed to the text twin (already rendered above).
  }
  if (panel.provider) {
    const tag = document.createElement('div');
    tag.className = 'ptag';
    tag.textContent = panel.provider === 'Spark' ? 'Spark' : 'local templates';
    card.append(tag);
  }
  // The confirm card docks above the input with the frame's view-follows
  // behavior; every other panel renders in the middle region.
  if (isConfirm) {
    dockZone.append(card);
    confirmCardEl = card;
    try {
      card.scrollIntoView({ block: 'nearest', behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
    } catch { /* older browsers: the dock still lands */ }
  } else {
    panelEl.append(card);
  }
}

function onChoice(choice) {
  if (!choice || typeof choice !== 'object') return;
  if (choice.id === 'keep') return doKeep();
  if (choice.id === 'retake') return doRetake();
  if (choice.id === 'describe') {
    listenEl.textContent = 'Type a short description of what you see, then press Send.';
    inputEl.focus({ preventScroll: true });
    return;
  }
  if (choice.utterance) return respond(choice.utterance);
  inputEl.focus({ preventScroll: true });
}

async function doKeep() {
  if (busy) return;
  busy = true;
  try {
    const step = await post('/api/session/' + sessionId + '/keep', {});
    busy = false;
    await drive(step);
  } catch (err) {
    busy = false;
    listenEl.textContent = postError(err);
  }
}

async function doRetake() {
  if (busy) return;
  busy = true;
  try {
    const step = await post('/api/session/' + sessionId + '/retake', {});
    busy = false;
    // Back to guidance blue: the lock flash must not survive a retake.
    captureFrame.classList.remove('locked');
    drawGuides(captureStage, false);
    await drive(step);
  } catch (err) {
    busy = false;
    listenEl.textContent = postError(err);
  }
}
/**
 * Placement C: at capture start the frame node docks above the input so
 * the viewfinder meets the user at the chat; it returns home when the
 * stage closes. Moving the live <video> within the document keeps playing.
 */
function dockFrame(on) {
  if (on) {
    dockZone.appendChild(captureWrap);
    try {
      captureWrap.scrollIntoView({ block: 'nearest', behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
    } catch { /* older browsers: the dock still lands */ }
  } else if (captureWrap.parentNode === dockZone) {
    frameHome.insertBefore(captureWrap, frameHomeNext);
  }
}
function showCapture(on, stage) {
  captureWrap.hidden = !on;
  dockFrame(on);
  if (on && stage && CAPTURE_LABEL[stage]) {
    captureWrap.setAttribute('aria-label', CAPTURE_LABEL[stage]);
    captureMeta.textContent = 'capturing…';
  }
}

/** Guide overlay: corner brackets for documents, oval for faces. */
function drawGuides(stage, locked) {
  const frame = captureFrame.getBoundingClientRect();
  const w = Math.max(2, Math.round(frame.width));
  const h = Math.max(2, Math.round(frame.height));
  guidesEl.width = w;
  guidesEl.height = h;
  const ctx = guidesEl.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = locked === true ? '#4ADE80' : '#38BDF8';
  ctx.lineWidth = 3;
  const face = stage === 'awaiting_challenge' || stage === 'awaiting_selfie';
  if (face) {
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w * 0.28, h * 0.34, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    const m = Math.min(w, h) * 0.1, len = Math.min(w, h) * 0.12;
    const corners = [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]];
    ctx.beginPath();
    for (const [x, y, dx, dy] of corners) {
      ctx.moveTo(x + len * dx, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + len * dy);
    }
    ctx.stroke();
  }
}

function stopCaptureTracks() {
  try {
    if (captureStream) for (const t of captureStream.getTracks()) t.stop();
  } catch { /* already stopped */ }
  captureStream = null;
  try { videoEl.srcObject = null; } catch { /* no video */ }
}

function stopCapture() {
  sampling = false;
  sampleInflight = false;
  sampleFails = 0;
  setCoach('');
  clearReviewState();
  stopCaptureTracks();
  captureStage = null;
  if (sampleTimer !== null) { clearInterval(sampleTimer); sampleTimer = null; }
  captureFrame.classList.remove('locked');
  showCapture(false);
  lockBtn.disabled = true;
  standinBtn.hidden = true;
}

async function ensureCapture(stage) {
  showCapture(true, stage);
  if (captureStream !== null && captureStage === stage) {
    sampling = true;
    return;
  }
  stopCaptureTracks();
  captureStage = stage;
  await startCapture(stage);
}

/** Open the live viewfinder for a capture stage (camera-first path). */
async function startCapture(stage) {
  setCoach('Opening camera…');
  captureFrame.classList.remove('locked');
  const docStage = stage === 'awaiting_doc_front' || stage === 'awaiting_doc_back';
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('no camera');
    }
    // Documents use the rear camera; challenge/selfie face the user.
    captureStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: docStage ? 'environment' : 'user' },
      audio: false,
    });
  } catch (err) {
    await cameraDenied(stage);
    return;
  }
  const track = captureStream.getVideoTracks()[0];
  if (track) track.onended = () => cameraDenied(captureStage);
  videoEl.srcObject = captureStream;
  try { await videoEl.play(); } catch { /* sampling guards readiness */ }
  drawGuides(stage, false);
  sampling = true;
  sampleInflight = false;
  sampleFails = 0;
  if (sampleTimer === null) sampleTimer = setInterval(sampleTick, 200);
  lockBtn.disabled = pendingRef !== null;
}

/**
 * Camera-denied park path: the coach card explains, the run parks, and
 * the fixture stand-in waits for an explicit user confirm — the run
 * never auto-continues without a capture.
 */
async function cameraDenied(stage) {
  stopCaptureTracks();
  sampling = false;
  captureMeta.textContent = 'camera unavailable — run parked';
  let parked = null;
  try {
    parked = await post('/api/session/' + sessionId + '/signal', { event: 'camera_denied' });
  } catch { /* offline: local card only */ }
  const text = (parked && parked.text) || "I can't reach your camera, so this run is parked here.";
  setSpoken(text, false);
  setCoach(text);
  if (parked) {
    stageEl.textContent = parked.stage;
    renderTranscript(parked.transcript);
    renderPanel(parked.panel, parked.text);
  }
  standinBtn.hidden = false;
  lockBtn.disabled = true;
  await speak((parked && parked.narration && parked.narration.text) || text);
}

let standinBusy = false;
standinBtn.addEventListener('click', async () => {
  if (standinBusy || !sessionId || !captureStage || !CAPTURE_SIGNAL[captureStage]) return;
  standinBusy = true;
  standinBtn.hidden = true;
  const standinSession = sessionId;
  try {
    // Stand-in locks like live video: the confirm card shows the fixture
    // label instead of a photo, with the server's generic verdict (no live
    // samples exist while the camera is down), then the pair opens.
    const res = await post('/api/session/' + sessionId + '/lock', {});
    if (sessionId !== standinSession) return;   // restart won the race: drop it
    sampling = false;   // hold while Keep/Retake is open
    pendingRef = res.pendingCapture;
    pendingSnapshot = null;
    pendingStandin = true;
    pendingVerdict = res.verdict || GENERIC_VERDICT[captureStage] || 'Captured.';
    renderTranscript(res.transcript);
    renderPanel(res.panel, res.text);
    focusConfirmHeading();
    setSpoken(pendingVerdict, false);
    await speak(pendingVerdict);
    if (sessionId !== standinSession) return;   // restart won the race: drop it
    setSpoken(res.text, false);
    await announceLock(res.text);
  } catch (err) {
    standinBtn.hidden = false;
    listenEl.textContent = postError(err);
  } finally {
    standinBusy = false;
  }
});

lockBtn.addEventListener('click', async () => {
  if (lockBusy || !sessionId) return;
  lockBusy = true;
  lockBtn.disabled = true;
  const lockSession = sessionId;
  try {
    const res = await post('/api/session/' + sessionId + '/lock', {});
    if (sessionId !== lockSession) return;   // restart won the race: drop it
    sampling = false;   // hold the frame while Keep/Retake is open
    pendingRef = res.pendingCapture;
    // Snapshot between the race guard and the card render; a failed grab
    // still offers the pair with a generic verdict caption.
    pendingSnapshot = takeSnapshot();
    pendingStandin = false;
    pendingVerdict = pendingSnapshot !== null
      ? (res.verdict || GENERIC_VERDICT[captureStage] || 'Captured.')
      : (GENERIC_VERDICT[captureStage] || 'Captured.');
    // Card first, then the verdict turn, then the keep/retake question —
    // separate turns, always in that order; the flash lands with the
    // question while the card itself is the immediate tap feedback.
    renderTranscript(res.transcript);
    renderPanel(res.panel, res.text);
    focusConfirmHeading();
    setSpoken(pendingVerdict, false);
    await speak(pendingVerdict);
    if (sessionId !== lockSession) return;   // restart won the race: drop it
    setSpoken(res.text, false);
    await announceLock(res.text);
  } catch (err) {
    // Wrong-stage means a stale in-flight lock: stay disabled instead of
    // inviting another failing tap. Other failures re-enable for a retry.
    if (err && err.status === 409) {
      lockBtn.disabled = true;
    } else {
      lockBtn.disabled = pendingRef !== null;
      listenEl.textContent = postError(err);
    }
  } finally {
    lockBusy = false;
  }
});

/** Lock flash + haptic (no speech — verdict and question speak separately). */
function flashLock() {
  captureFrame.classList.add('locked');
  drawGuides(captureStage, true);
  if (navigator.vibrate) { try { navigator.vibrate(15); } catch { /* no haptics */ } }
}

/** Every lock is announced: guide flash + haptic + spoken confirm. */
async function announceLock(text) {
  flashLock();
  await speak(text);
}

/** Focus the confirm-card heading on appearance (it is tabindex=-1). */
function focusConfirmHeading() {
  const heading = document.getElementById('confirmHeading');
  if (heading && heading.focus) {
    try { heading.focus(); } catch { /* older browsers: card still renders */ }
  }
}

/** Retire the confirm card: drop the node, clear state, focus the spoken line. */
function retireCard() {
  dropConfirmCard();
  cardOpen = false;
  pendingSnapshot = null;
  pendingVerdict = null;
  pendingStandin = false;
  try { spokenEl.focus({ preventScroll: true }); } catch { /* focus stays put */ }
}

/** Clear review state silently (stop/restart — no focus move). */
function clearReviewState() {
  dropConfirmCard();
  cardOpen = false;
  pendingSnapshot = null;
  pendingVerdict = null;
  pendingStandin = false;
}

// 32px luma peek for the coarse client-side heuristics.
const peek = document.createElement('canvas');
peek.width = 32;
peek.height = 32;

// Full-frame snapshot canvas for the confirm card (separate from the peek).
const snap = document.createElement('canvas');

/**
 * Device-local frame grab for the confirm card. The data URL lives in a
 * JS variable and an <img> only — like telemetry, it is never posted,
 * uploaded, or stored, and it clears on keep/retake/stop. Null when the
 * viewfinder has no frame (stand-in path) or the grab fails.
 */
function takeSnapshot() {
  try {
    if (captureStream === null || videoEl.readyState < 2) return null;
    const w = videoEl.videoWidth || 640;
    const h = videoEl.videoHeight || 480;
    if (!w || !h) return null;
    snap.width = w;
    snap.height = h;
    const ctx = snap.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(videoEl, 0, 0, w, h);
    return snap.toDataURL('image/jpeg', 0.82);
  } catch {
    return null;
  }
}

/**
 * Client-side telemetry: brightness/glare/variance over the 32px peek.
 * Only numbers leave the device — no viewfinder frames are uploaded or
 * stored. v1 covers dark/glare/blur live; skew/occlusion/moiré send 0
 * pending the physical-specimen pilot (accepted limitation).
 */
function videoSample() {
  const ctx = peek.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(videoEl, 0, 0, 32, 32);
  const px = ctx.getImageData(0, 0, 32, 32).data;
  const n = px.length / 4;
  let sum = 0, sum2 = 0, blown = 0;
  for (let i = 0; i < px.length; i += 4) {
    const l = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255;
    sum += l;
    sum2 += l * l;
    if (l > 0.985) blown += 1;
  }
  const mean = sum / n;
  const variance = sum2 / n - mean * mean;
  return {
    glare: blown / n > 0.04 ? 0.9 : 0,
    dark: mean < 0.22 ? 0.9 : 0,
    blur: variance < 0.003 ? 0.7 : 0,
    skew: 0,
    finger: 0,
    occlusion: 0,
    moire: 0,
  };
}

/** ~5Hz coach loop: sample the viewfinder, post telemetry, hold or coach. */
async function sampleTick() {
  // Strict guard: only a true sampling flag posts, and only one round-trip
  // is ever in flight — slow responses never double-post or flicker.
  if (!(sampling === true)) return;
  if (sampleInflight === true) return;
  if (captureStream === null || videoEl.readyState < 2) return;
  // Back off while the server is down: one probe ~2s instead of 5Hz hammering.
  if (sampleFails >= 10 && Date.now() < sampleDownUntil) return;
  sampleInflight = true;
  const tickSession = sessionId;
  const tickStage = captureStage;
  try {
    const res = await post('/api/session/' + sessionId + '/telemetry', videoSample());
    if (sampleFails >= 10) setCoach('');
    sampleFails = 0;
    // A stage advance or restart won the race: stale guidance stays out.
    if (sessionId !== tickSession || captureStage !== tickStage) return;
    lockBtn.disabled = !(res.lockReady === true) || pendingRef !== null;
    // Panels for unfired repeat-episode turns are discarded, not shown.
    if (res.announced === true) {
      setSpoken(res.text, false);
      setCoach(res.text);
      renderTranscript(res.transcript);
      renderPanel(res.panel, res.text);
      await speak(res.narration.text);
    }
  } catch {
    // A blip stays silent; a dead server says so after ~2s of failures,
    // then backs off to one probe per ~2s until it recovers.
    sampleFails += 1;
    if (sampleFails >= 10) {
      setCoach('Connection lost — retrying…');
      sampleDownUntil = Date.now() + 2000;
    }
  }
  finally { sampleInflight = false; }
}
async function drive(step) {
  // Never render a malformed step: bail with recovery guidance instead of
  // throwing halfway through and leaving a stuck run.
  if (!step || typeof step !== 'object' || typeof step.stage !== 'string') {
    listenEl.textContent = 'Something went wrong — press Start to begin again.';
    return;
  }
  pendingRef = step.pendingCapture ?? null;
  // The pair closed (keep/retake/deny): retire the card, clear the snapshot,
  // and focus back at the spoken-line region.
  if (cardOpen === true && step.pendingCapture == null) retireCard();
  // Pair closed on a capture stage with no live stream: the stand-in is
  // the only lock path, so re-offer it (covers tap and voice retakes).
  if (step.pendingCapture == null && CAPTURE_SIGNAL[step.stage] && captureStream === null) {
    standinBtn.hidden = false;
  }
  // A near-miss resolution echoes before the resolved turn sounds.
  if (step.echo) {
    setSpoken(step.echo, false);
    await speak(step.echo);
  }
  stageEl.textContent = step.stage;
  setSpoken(step.text, step.stage === 'decided');
  renderTranscript(step.transcript);
  if (!step.report) renderPanel(step.panel, step.text);
  await speak(step.narration.text);

  if (step.report) {
    renderDecisionFromPanel(step.panel, step.report);
    listenEl.textContent = '';
    stopCapture();
    return;
  }
  if (step.stage === 'decided') return;
  if (!CAPTURE_SIGNAL[step.stage]) stopCapture();

  // Reading/comparing are backend work, so the fixture stand-in drives
  // them; capture stages open the live viewfinder instead.
  if (READING_SIGNAL[step.stage]) {
    listenEl.textContent = step.stage === 'comparing' ? 'comparing...' : 'reading...';
    await pause(900);
    try {
      return drive(await post('/api/session/' + sessionId + '/signal', { event: READING_SIGNAL[step.stage] }));
    } catch (err) {
      listenEl.textContent = postError(err);
      return;
    }
  }
  if (CAPTURE_SIGNAL[step.stage]) {
    listenEl.textContent = '';
    await ensureCapture(step.stage);
    return;
  }

  listen();
}

function listen() {
  inputEl.focus({ preventScroll: true });
  if (!SR || micParked) {
    listenEl.textContent = micParked
      ? micParked + ' Type your answer, then press Send.'
      : 'Type your answer, then press Send.';
    return;
  }
  // A re-entrant call means the turn moved on (a typed answer raced live
  // voice): retire the stale recognizer so its late result can't double-feed
  // a second turn, then listen fresh for the current one.
  voiceGen += 1;
  const gen = voiceGen;
  if (activeRecognition) {
    try { activeRecognition.abort(); } catch { /* already gone */ }
    activeRecognition = null;
  }

  const recognition = new SR();
  recognition.lang = 'en-AU';
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  let settled = false;
  listenEl.textContent = 'Listening...';
  setOrb('listening');
  activeRecognition = recognition;

  // Shared turn teardown: each path below ends the turn at most once, and a
  // turn from a previous Start never speaks into the new session.
  const abandon = () => {
    if (settled || gen !== voiceGen) return false;
    settled = true;
    clearTimeout(watchdog);
    if (activeRecognition === recognition) activeRecognition = null;
    setOrb('idle');
    return true;
  };

  // Parking policy: silence, denial, and a missing mic park with a named
  // remedy (typed input carries the turn); only network blips retry next
  // turn, since time alone heals them.
  const settle = (text) => {
    if (!abandon()) return;
    listenEl.textContent = '';
    if (text === '') {
      silentStreak += 1;
      // Three fully silent windows is dead air, not a quiet user: park with
      // a remedy instead of spinning spoken re-asks forever.
      if (silentStreak >= 3) {
        micParked = "I can't hear anything — check your microphone" + START_RETRY_SUFFIX;
        silenceParked = true;
        listen();
        return;
      }
      respond('');
      return;
    }
    silentStreak = 0;
    respond(text);
  };

  const watchdog = setTimeout(() => {
    try { recognition.stop(); } catch { /* already stopped */ }
    settle('');
  }, 10000);

  recognition.onresult = (event) => settle(event.results[0][0].transcript.trim());
  recognition.onerror = (event) => {
    // Recovery needs user action outside the page, so these park until
    // Start; only the network branch below retries next turn. (Evidence, not
    // fear: Chrome and Safari remember denial instead of re-prompting, so a
    // retry loop would be safe — parking is simply calmer, and Start is cheap
    // this early in a run.)
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      if (!abandon()) return;
      micParked = "Microphone is blocked — allow it in your browser's site settings" + START_RETRY_SUFFIX;
      listen();
      return;
    }
    if (event.error === 'audio-capture') {
      if (!abandon()) return;
      micParked = 'No microphone found — connect one' + START_RETRY_SUFFIX;
      listen();
      return;
    }
    if (event.error === 'network') {
      if (!abandon()) return;
      listenEl.textContent = 'Speech service unreachable — check your connection, then type your answer.';
      return;
    }
    settle('');
  };
  recognition.onend = () => settle('');

  try { recognition.start(); } catch { settle(''); }
}

async function respond(utterance) {
  if (busy) return;
  busy = true;
  inputEl.value = '';

  try {
    const step = await post('/api/session/' + sessionId + '/say', { utterance });
    busy = false;
    try {
      await drive(step);
    } catch {
      listenEl.textContent = 'Something went wrong — press Start to begin again.';
    }
  } catch (err) {
    busy = false;
    listenEl.textContent = postError(err);
  }
}

startBtn.addEventListener('click', async () => {
  if (!fixtureId) return;
  sessionId = null;
  pendingRef = null;
  clearReviewState();
  // Fresh run, fresh mic: parked state dies here, the in-flight recognizer
  // is stopped, and its generation retires so a ghost result can never
  // speak into the new session.
  voiceGen += 1;
  if (activeRecognition) {
    try { activeRecognition.abort(); } catch { /* already gone */ }
    activeRecognition = null;
  }
  micParked = null;
  silenceParked = false;
  silentStreak = 0;
  stopCapture();
  transcriptEl.replaceChildren();
  panelEl.replaceChildren();
  setSpoken('', false);
  setCoach('');
  decisionEl.textContent = '';
  decisionEl.className = '';
  tierEl.textContent = '';
  checksEl.replaceChildren();
  startBtn.disabled = true;

  const created = await post('/api/session', { fixtureId });
  sessionId = created.sessionId;
  startBtn.disabled = false;
  await drive(created);
});

$('typed').addEventListener('submit', (event) => {
  event.preventDefault();
  const value = inputEl.value.trim();
  // Typed success breaks a silence streak — and typing proves presence, so
  // it unparks a silence park (denial/device parks still need Start).
  if (value) {
    silentStreak = 0;
    if (silenceParked) {
      silenceParked = false;
      micParked = null;
    }
    respond(value);
  }
});
</script>
</html>`;
