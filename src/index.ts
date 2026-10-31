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
// Avoid: not liveness, not forgery proof, not certified matching — the
// limitations below are negations, the only permitted form (spec §1).
import { Hono } from "hono";
import { decide, runChecks } from "./checks.js";
import type { CheckResult, Decision } from "./checks.js";
import { verifyDVS } from "./dvs.js";
import { loadFixture } from "./fixtures.js";
import { say, signal, startRun } from "./flow.js";
import type { FlowState } from "./flow.js";
import { buildMeasurements } from "./measurements.js";
import { configuredProviders, narrate } from "./providers.js";
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

interface TranscriptLine {
  who: "system" | "you";
  text: string;
  kind?: string;
}

interface Session {
  flow: FlowState;
  fixture: string;
  /** Capture refs (synthetic fixture ids). Deny/revoke deletes them. */
  captures: string[];
  /** Mirrors every Turn plus every subject utterance. */
  transcript: TranscriptLine[];
}

const sessions = new Map<string, Session>();

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

app.get("/api/run/:id", (c) => {
  const id = c.req.param("id");
  try {
    loadFixture(id);
  } catch {
    return c.json({ error: "unknown_fixture", id }, 404);
  }
  return c.json(evaluateFixture(id));
});

app.get("/api/providers", (c) => c.json(configuredProviders(processEnv())));

app.post("/api/session", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { fixtureId?: string };
  const fixtureId = body.fixtureId ?? RUN_IDS[0];
  try {
    loadFixture(fixtureId);
  } catch {
    return c.json({ error: "unknown_fixture", id: fixtureId }, 404);
  }

  const id = sessionId();
  const flow = startRun(fixtureId);
  const session: Session = { flow, fixture: fixtureId, captures: [], transcript: [] };
  pushTurn(session, "system", flow.last_turn?.text ?? "", flow.last_turn?.kind);
  sessions.set(id, session);

  const narration = await narrated(
    flow.last_turn?.kind ?? "consent",
    flow.last_turn?.text ?? "",
  );
  return c.json({
    sessionId: id,
    stage: flow.stage,
    turn: flow.last_turn?.kind ?? null,
    text: flow.last_turn?.text ?? "",
    intent: null,
    advanced: true,
    narration,
    transcript: session.transcript,
    captures: session.captures,
    capturesPurged: flow.capturesPurged,
    report: null,
  });
});

function reportFor(session: Session): Report | null {
  if (session.flow.stage !== "decided") return null;
  return evaluateFixture(session.fixture);
}

app.post("/api/session/:id/say", async (c) => {
  const session = sessions.get(c.req.param("id"));
  if (!session) return c.json({ error: "unknown_session" }, 404);

  const body = (await c.req.json().catch(() => ({}))) as { utterance?: string };
  const utterance = body.utterance ?? "";
  const before = session.flow.stage;
  const next = say(session.flow, utterance);
  session.flow = next;
  // Full deny purge: captures are deleted on deny/revoke, not flagged.
  if (next.last_intent === "deny") session.captures = [];

  pushTurn(session, "you", utterance);
  pushTurn(session, "system", next.last_turn?.text ?? "", next.last_turn?.kind);
  const narration = await narrated(next.last_turn?.kind ?? "re-ask", next.last_turn?.text ?? "");
  return c.json({
    sessionId: c.req.param("id"),
    stage: next.stage,
    turn: next.last_turn?.kind ?? null,
    text: next.last_turn?.text ?? "",
    intent: next.last_intent,
    advanced: next.stage !== before,
    narration,
    transcript: session.transcript,
    captures: session.captures,
    capturesPurged: next.capturesPurged,
    report: reportFor(session),
  });
});

app.post("/api/session/:id/signal", async (c) => {
  const session = sessions.get(c.req.param("id"));
  if (!session) return c.json({ error: "unknown_session" }, 404);

  const body = (await c.req.json().catch(() => ({}))) as { event?: string };
  const event = body.event ?? "";
  const before = session.flow.stage;
  const next = signal(session.flow, event);
  session.flow = next;
  // Captures attach on backend capture events only (speech never captures).
  if (next.stage !== before) {
    if (event === "front_captured") session.captures.push(`front:${session.fixture}`);
    if (event === "back_captured") session.captures.push(`back:${session.fixture}`);
    if (event === "selfie_captured") session.captures.push(`selfie:${session.fixture}`);
  }

  pushTurn(session, "system", next.last_turn?.text ?? "", next.last_turn?.kind);
  const narration = await narrated(next.last_turn?.kind ?? "progress", next.last_turn?.text ?? "");
  return c.json({
    sessionId: c.req.param("id"),
    stage: next.stage,
    turn: next.last_turn?.kind ?? null,
    text: next.last_turn?.text ?? "",
    intent: null,
    advanced: next.stage !== before,
    narration,
    transcript: session.transcript,
    captures: session.captures,
    capturesPurged: next.capturesPurged,
    report: reportFor(session),
  });
});

app.get("/page", (c) => c.html(PAGE));

export default app;

const PAGE = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AU Voice IDV — demo slice</title>
<style>
  :root { color-scheme: dark; --ok:#4ade80; --bad:#f87171; --meh:#fbbf24; --dim:#8b93a1;
          --line:#1b2230; --panel:#11161e; }
  * { box-sizing:border-box; }
  body { margin:0; padding:2rem 1.5rem 4rem; background:#0c0f14; color:#e6e9ef;
         font:17px/1.55 ui-sans-serif,-apple-system,system-ui,sans-serif; max-width:58rem; }
  h1 { font-size:1.3rem; margin:0 0 .2rem; letter-spacing:-.01em; }
  .sub { color:var(--dim); font-size:.85rem; margin:0 0 1.5rem; }
  .row { display:flex; flex-wrap:wrap; gap:.4rem; margin:0 0 .75rem; align-items:center; }
  button { background:var(--panel); color:inherit; border:1px solid #262d38; border-radius:.45rem;
           padding:.55rem .8rem; font:inherit; font-size:.82rem; cursor:pointer; }
  button:hover:not(:disabled) { border-color:#3b4554; }
  button[aria-pressed="true"] { border-color:#4b6ea8; color:#cfe0ff; }
  button.primary { background:#1b2740; border-color:#35507e; font-weight:600; }
  button:disabled { opacity:.45; cursor:default; }
  #stage { font-size:.72rem; letter-spacing:.09em; text-transform:uppercase; color:var(--dim); }
  #transcript { margin:1.5rem 0 1rem; display:flex; flex-direction:column; gap:.6rem; }
  .turn { padding:.7rem .9rem; border-left:2px solid #2a3444; background:#0e131b; border-radius:0 .4rem .4rem 0; }
  .turn.you { border-left-color:#3f6fbf; background:#0d1420; }
  .turn.warn { border-left-color:#a2601f; }
  .turn .who { font-size:.66rem; letter-spacing:.1em; text-transform:uppercase; color:var(--dim); }
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
  #tiermsg { font-size:1rem; margin:.4rem 0; }
</style>

<h1>AU Voice IDV — demo slice</h1>
<p class="sub">Voice-guided capture. Deterministic checks decide; voice narrates, never decides.</p>

<div class="row" id="fixtures" role="group" aria-label="Choose a fixture"></div>
<div class="row">
  <button class="primary" id="start" disabled>Start run</button>
  <span id="stage">idle</span>
</div>

<div id="transcript" aria-live="polite"></div>
<div id="listen"></div>

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

let fixtureId = null;
let sessionId = null;
let busy = false;
let micBroken = false;
let silentStreak = 0;

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
    label.textContent = line.who === 'you' ? 'you' : 'system';
    const body = document.createElement('div');
    body.className = 'what';
    body.textContent = line.text;             // textContent only: never innerHTML
    wrap.append(label, body);
    transcriptEl.append(wrap);
  }
  transcriptEl.lastChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function speak(text) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis || !text) return resolve();
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
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
  if (!res.ok) throw new Error(path + ' -> ' + res.status);
  return res.json();
}

function renderReport(report) {
  decisionEl.textContent = report.decision;
  decisionEl.className = report.decision === 'verified' ? 'pass'
    : report.decision === 'rejected' ? 'fail' : 'inconclusive';

  tierEl.textContent = report.userMessage;

  checksEl.replaceChildren();
  const h = document.createElement('h2');
  h.textContent = 'checks — failures first';
  const ul = document.createElement('ul');
  for (const check of report.failedFirst) {
    const li = document.createElement('li');
    const mark = document.createElement('span');
    mark.className = check.result === 'pass' ? 'pass' : check.result === 'fail' ? 'fail' : 'inconclusive';
    mark.textContent = check.result === 'pass' ? '\\u2713' : check.result === 'fail' ? '\\u2717' : '?';
    const name = document.createElement('span');
    name.className = 'id';
    name.textContent = check.id;
    const evidence = document.createElement('span');
    evidence.className = 'ev';
    evidence.textContent = check.evidence;
    li.append(mark, name, evidence);
    ul.append(li);
  }
  checksEl.append(h, ul);

  const limits = document.createElement('h2');
  limits.textContent = 'limitations';
  checksEl.append(limits);
  const lulum = document.createElement('ul');
  for (const line of report.limitations) {
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
}

function pause(ms) { return new Promise(r => setTimeout(r, ms)); }

async function drive(step) {
  stageEl.textContent = step.stage;
  renderTranscript(step.transcript);
  await speak(step.narration.text);

  if (step.report) { renderReport(step.report); listenEl.textContent = ''; return; }
  if (step.stage === 'decided') return;

  // The demo has no camera, so the fixture stands in for the capture and
  // the backend signal is the honest stage boundary.
  if (READING_SIGNAL[step.stage]) {
    listenEl.textContent = step.stage === 'comparing' ? 'comparing...' : 'reading...';
    await pause(900);
    return drive(await post('/api/session/' + sessionId + '/signal', { event: READING_SIGNAL[step.stage] }));
  }
  if (CAPTURE_SIGNAL[step.stage]) {
    listenEl.textContent = 'capturing...';
    await pause(700);
    const next = await post('/api/session/' + sessionId + '/signal', { event: CAPTURE_SIGNAL[step.stage] });
    return drive(next);
  }

  listen();
}

function listen() {
  inputEl.focus({ preventScroll: true });
  if (!SR || micBroken) {
    listenEl.textContent = micBroken
      ? 'Microphone unavailable. Type your answer, then press Send.'
      : 'Type your answer, then press Send.';
    return;
  }

  const recognition = new SR();
  recognition.lang = 'en-AU';
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  let settled = false;
  listenEl.textContent = 'Listening...';

  const settle = (text) => {
    if (settled) return;
    settled = true;
    clearTimeout(watchdog);
    listenEl.textContent = '';
    if (text === null) {
      micBroken = true;
      listen();
      return;
    }
    if (text === '') {
      silentStreak += 1;
      // One silent window is a re-ask. Two in a row means the microphone is
      // not working, and asking again would spin forever.
      if (silentStreak >= 2) {
        micBroken = true;
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
    if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(event.error)) {
      settle(null);
      return;
    }
    settle('');
  };
  recognition.onend = () => settle('');

  try { recognition.start(); } catch { settle(null); }
}

async function respond(utterance) {
  if (busy) return;
  busy = true;
  inputEl.value = '';

  let step;
  try {
    step = await post('/api/session/' + sessionId + '/say', { utterance });
  } catch {
    busy = false;
    listenEl.textContent = 'Could not reach the server.';
    return;
  }
  busy = false;
  await drive(step);
}

startBtn.addEventListener('click', async () => {
  if (!fixtureId) return;
  sessionId = null;
  transcriptEl.replaceChildren();
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
  if (value) respond(value);
});
</script>
</html>`;
