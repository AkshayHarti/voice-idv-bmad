import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import app from "../dist/index.js";

// Aria naming: page chrome, transcript labels, consent intro, API key-set
// stability. Label assertions target the label node / mapping only — never
// page-wide `system`/`aria` substrings (the page legitimately mentions both
// elsewhere, e.g. "browser synthesis", stored `who` values in script).
// Precondition: `npm run build` (this file imports `../dist`).

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const CONSENT =
  "I'll guide you by voice to verify your ID. Nothing is uploaded until you say so. Say — I consent — to start.";
const INTRO =
  "Hi, I'm Aria, your voice onboarding agent. I'll walk you through your ID check, one step at a time.";
const PAGE_TITLE = "Aria — Voice onboarding agent";
const SUBMISSION_TITLE =
  "# Aria — Voice-First IDV — Cerebral Valley submission (indie track)";
const LIMITATIONS_BLOCK = `## What this does not claim

Not liveness certification — motion confirms responsiveness only. Not
forgery proof — splice-not-found is not authenticity. Uncertified match —
face similarity is a value + band, uncertified. Enforced in code and UI copy.`;

async function post(path, body) {
  const response = await app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function get(path) {
  const response = await app.request(path);
  return { status: response.status, body: await response.json() };
}

async function getPage() {
  const response = await app.request("/page");
  assert.equal(response.status, 200);
  return response.text();
}

/** Unique `<tag>…</tag>` inner text (node-targeted, not page-wide). */
function tagText(html, tag) {
  const matches = [...html.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, "g"))];
  assert.equal(matches.length, 1, `expected exactly one <${tag}> node`);
  return matches[0][1];
}

/** The `.turn .who` CSS rule body (label styling only). */
function whoRule(html) {
  const matches = [...html.matchAll(/\.turn \.who \{([^}]*)\}/g)];
  assert.equal(matches.length, 1, "expected exactly one .turn .who rule");
  return matches[0][1];
}

/** The assistant-only `.who` override rule body. */
function scopedWhoRule(html) {
  const matches = [...html.matchAll(/\.turn:not\(\.you\) \.who \{([^}]*)\}/g)];
  assert.equal(matches.length, 1, "expected exactly one assistant .who override");
  return matches[0][1];
}

/**
 * The render-time label mapping, extracted from `renderTranscript` and
 * executed for a given stored `who` value. Stored payloads keep
 * `system`/`you`; only this mapping renders the product name.
 */
function renderLabel(html, who) {
  const matches = [...html.matchAll(/label\.textContent = ([^;]+);/g)];
  assert.equal(matches.length, 1, "expected exactly one label-mapping statement");
  return new Function("line", `return (${matches[0][1]});`)({ who });
}

test("page chrome names Aria once (title, h1, no sub-line)", async () => {
  const html = await getPage();
  assert.equal(tagText(html, "title"), PAGE_TITLE);
  assert.equal(tagText(html, "h1"), PAGE_TITLE);
  assert.ok(!html.includes('<p class="sub">'), "no duplicate sub-line under the h1");
  // Decision headings moved behind the customer token gate (test/result.test.js):
  // the end-user page renders the verdict moment only.
  for (const heading of ["checks — failures first", "limitations", "attack surface"]) {
    assert.ok(
      !html.includes(heading),
      `end-user page stripped of decision heading: ${heading}`,
    );
  }
});

test("transcript label node renders exactly Aria / you", async () => {
  const html = await getPage();
  assert.equal(renderLabel(html, "system"), "Aria");
  assert.equal(renderLabel(html, "you"), "you");
  assert.equal(renderLabel(html, "intruder"), "you");
  assert.ok(
    whoRule(html).includes("text-transform:uppercase"),
    ".who base rule keeps uppercase subject labels",
  );
  assert.ok(
    scopedWhoRule(html).includes("text-transform:none"),
    "assistant .who renders with text-transform:none",
  );
});

test("intro turn opens the run; consent follows byte-identical and replay repeats it", async () => {
  const created = await post("/api/session", { fixtureId: "aus-passport-clean" });
  assert.equal(created.status, 200);
  assert.equal(created.body.turn, "intro");
  assert.equal(created.body.text, INTRO);
  assert.equal(created.body.transcript[0].text, INTRO);
  assert.equal(created.body.transcript[0].who, "system");
  assert.ok(INTRO.includes("Aria") && INTRO.includes("onboarding agent"));

  const consented = await post(`/api/session/${created.body.sessionId}/signal`, {
    event: "intro_done",
  });
  assert.equal(consented.body.turn, "consent");
  assert.equal(consented.body.text, CONSENT);
  assert.equal(consented.body.stage, "awaiting_consent");
  assert.ok(CONSENT.includes("I consent"));
  assert.ok(!CONSENT.includes("Aria"), "no redundant self-naming after the intro");
  assert.deepEqual(
    consented.body.transcript.map((l) => l.text),
    [INTRO, CONSENT],
  );
  assert.deepEqual(keyShape(consented.body.panel), PANEL_CHOICE_LIST);

  const replay = await post(`/api/session/${created.body.sessionId}/say`, {
    utterance: "repeat that",
  });
  assert.equal(replay.body.text, CONSENT);
  assert.equal(replay.body.turn, "replay");
});

test("consent gate holds from the intro: affirm advances, deny purges", async () => {
  const affirmed = await post("/api/session", { fixtureId: "aus-passport-clean" });
  const said = await post(`/api/session/${affirmed.body.sessionId}/say`, {
    utterance: "I consent",
  });
  assert.equal(said.body.stage, "awaiting_doc_front");
  assert.deepEqual(said.body.captures, []);

  const denied = await post("/api/session", { fixtureId: "aus-passport-clean" });
  const purged = await post(`/api/session/${denied.body.sessionId}/say`, {
    utterance: "no, stop",
  });
  assert.equal(purged.body.stage, "idle");
  assert.equal(purged.body.capturesPurged, true);
  // The gate holds after the auto-advance too: affirm still advances.
  const advanced = await post("/api/session", { fixtureId: "aus-passport-clean" });
  await post(`/api/session/${advanced.body.sessionId}/signal`, { event: "intro_done" });
  const saidAfter = await post(`/api/session/${advanced.body.sessionId}/say`, {
    utterance: "I consent",
  });
  assert.equal(saidAfter.body.stage, "awaiting_doc_front");
});

test("stray intro_done after an answer neither re-serves nor duplicates", async () => {
  const created = await post("/api/session", { fixtureId: "aus-passport-clean" });
  const id = created.body.sessionId;
  const said = await post(`/api/session/${id}/say`, { utterance: "I consent" });
  assert.equal(said.body.turn, "instruct");
  const stray = await post(`/api/session/${id}/signal`, { event: "intro_done" });
  assert.equal(stray.body.turn, "instruct");
  assert.equal(stray.body.stage, "awaiting_doc_front");
  assert.equal(stray.body.transcript.length, said.body.transcript.length);
});

/**
 * Normalized key-shape: objects collapse to sorted key maps, arrays to
 * sorted distinct element shapes (length-independent, so transcript and
 * check-list growth does not churn the snapshot, but any added, removed,
 * or renamed key at any depth fails).
 */
function keyShape(value) {
  if (Array.isArray(value)) {
    const sigs = [...new Set(value.map((el) => JSON.stringify(keyShape(el))))].sort();
    return { array: sigs.map((s) => JSON.parse(s)) };
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = keyShape(value[k]);
    return out;
  }
  return typeof value;
}

const NARRATION_SHAPE = {
  provider: "string",
  skipped: { array: ["string"] },
  text: "string",
};
const TURN_SHAPE = { kind: "string", text: "string", who: "string" };
const SUBJECT_LINE_SHAPE = { text: "string", who: "string" };

function stepShape(transcriptShapes, reportShape, intentShape = "object", capturesShape = { array: ["string"] }, panelShape, pendingShape = "object") {
  return {
    advanced: "boolean",
    captures: capturesShape,
    capturesPurged: "boolean",
    customerLink: "string",
    intent: intentShape,
    narration: NARRATION_SHAPE,
    panel: panelShape,
    pendingCapture: pendingShape,
    report: reportShape,
    sessionId: "string",
    stage: "string",
    text: "string",
    transcript: { array: transcriptShapes },
    turn: "string",
  };
}

const CHECK_SHAPE = { evidence: "string", id: "string", result: "string" };
const FACE_CHECK_SHAPE = {
  band: "string",
  certified: "boolean",
  evidence: "string",
  id: "string",
  result: "string",
  value: "number",
};
const REPORT_SHAPE = {
  decision: "string",
  dvs: {
    fields_matched: { array: ["string"] },
    fields_mismatched: { array: [] },
    match: "boolean",
  },
  failedFirst: { array: [CHECK_SHAPE, FACE_CHECK_SHAPE].sort((a, b) =>
    JSON.stringify(a) < JSON.stringify(b) ? -1 : 1,
  ) },
  fixture: "string",
  limitations: { array: ["string"] },
  queue: { reasons: { array: [] } },
  run_id: "string",
  tier: "string",
  userMessage: "string",
};

// Goal 2 additive panel shapes (deliberate: every step carries its
// Turn-bound generated panel plus the pending-capture ref).
const PANEL_BASE = {
  primitive: "string",
  provider: "string",
  text: "string",
  title: "string",
};
const PANEL_CHOICE = { id: "string", label: "string", utterance: "string" };
const PANEL_STEP = { id: "string", label: "string", state: "string" };
const PANEL_CHOICE_LIST = {
  ...PANEL_BASE,
  choices: { array: [PANEL_CHOICE] },
};
const PANEL_STEPS = {
  ...PANEL_BASE,
  steps: { array: [PANEL_STEP] },
};
const PANEL_EVIDENCE = {
  ...PANEL_BASE,
  evidence: { array: [CHECK_SHAPE, FACE_CHECK_SHAPE].sort((a, b) =>
    JSON.stringify(a) < JSON.stringify(b) ? -1 : 1,
  ) },
  limitations: { array: ["string"] },
  tier: "string",
  userMessage: "string",
  verdict: "string",
};

test("API key sets stable: session create + say + signal", async () => {
  const created = await post("/api/session", { fixtureId: "aus-passport-clean" });
  // Fresh session: empty captures; intent/report null. The opening turn is
  // the text-only intro panel; the consent choice-list follows via intro_done.
  assert.deepEqual(
    keyShape(created.body),
    stepShape([TURN_SHAPE], "object", "object", { array: [] }, PANEL_BASE),
  );

  const id = created.body.sessionId;
  const said = await post(`/api/session/${id}/say`, { utterance: "I consent" });
  assert.deepEqual(
    keyShape(said.body),
    stepShape([TURN_SHAPE, SUBJECT_LINE_SHAPE].sort((a, b) =>
      JSON.stringify(a) < JSON.stringify(b) ? -1 : 1,
    ), "object", "string", { array: [] }, PANEL_STEPS),
  );

  const signaled = await post(`/api/session/${id}/signal`, { event: "front_captured" });
  assert.deepEqual(
    keyShape(signaled.body),
    stepShape([TURN_SHAPE, SUBJECT_LINE_SHAPE].sort((a, b) =>
      JSON.stringify(a) < JSON.stringify(b) ? -1 : 1,
    ), "object", "object", undefined, PANEL_STEPS),
  );
});

test("API key sets stable: decided step carries the full report shape", async () => {
  const created = await post("/api/session", { fixtureId: "aus-passport-clean" });
  const id = created.body.sessionId;
  await post(`/api/session/${id}/say`, { utterance: "I consent" });
  let step = null;
  for (const event of [
    "front_captured",
    "frames_done",
    "challenge_done",
    "selfie_captured",
    "review_confirmed",
    "tier_done",
  ]) {
    step = await post(`/api/session/${id}/signal`, { event });
  }
  assert.equal(step.body.stage, "decided");
  assert.deepEqual(keyShape(step.body.report), REPORT_SHAPE);
  assert.deepEqual(
    keyShape(step.body),
    stepShape([TURN_SHAPE, SUBJECT_LINE_SHAPE].sort((a, b) =>
      JSON.stringify(a) < JSON.stringify(b) ? -1 : 1,
    ), REPORT_SHAPE, "object", undefined, PANEL_EVIDENCE),
  );
});

test("API key sets stable: runs, run, providers", async () => {
  const runs = await get("/api/runs");
  assert.equal(runs.status, 200);
  // Passports carry state:null, DLs a state string: two element shapes.
  assert.deepEqual(keyShape(runs.body), {
    array: [
      { id: "string", kind: "string", state: "object" },
      { id: "string", kind: "string", state: "string" },
    ],
  });

  const run = await get("/api/run/aus-passport-clean");
  assert.equal(run.status, 200);
  assert.deepEqual(keyShape(run.body), REPORT_SHAPE);

  const meta = await get("/api/run/aus-passport-clean?meta=1");
  assert.equal(meta.status, 200);
  assert.deepEqual(keyShape(meta.body), {
    ...REPORT_SHAPE,
    audit: { hypotheses: { array: ["string"] }, provider: "string" },
    meta: {
      narration: { provider: "string", skipped: { array: ["string"] } },
      segmentation: { provider: "string", skipped: { array: ["string"] } },
    },
    spend: { total: "number" },
  });

  const providers = await get("/api/providers");
  assert.equal(providers.status, 200);
  assert.deepEqual(keyShape(providers.body), {
    local: "boolean",
    meta: "boolean",
    openrouter: "boolean",
    replicate: "boolean",
    tts: "boolean",
  });
});

test("API key sets stable: error shapes", async () => {
  const badFixture = await post("/api/session", { fixtureId: "no-such-fixture" });
  assert.equal(badFixture.status, 404);
  assert.deepEqual(keyShape(badFixture.body), { error: "string", id: "string" });

  const badRun = await get("/api/run/no-such-fixture");
  assert.equal(badRun.status, 404);
  assert.deepEqual(keyShape(badRun.body), { error: "string", id: "string" });

  const badSay = await post("/api/session/no-such-session/say", { utterance: "hi" });
  assert.equal(badSay.status, 404);
  assert.deepEqual(keyShape(badSay.body), { error: "string" });

  const badSignal = await post("/api/session/no-such-session/signal", { event: "x" });
  assert.equal(badSignal.status, 404);
  assert.deepEqual(keyShape(badSignal.body), { error: "string" });

  const fresh = await post("/api/session", { fixtureId: "aus-passport-clean" });
  const noKeep = await post(`/api/session/${fresh.body.sessionId}/keep`, {});
  assert.equal(noKeep.status, 409);
  assert.deepEqual(keyShape(noKeep.body), { error: "string" });
  const noRetake = await post(`/api/session/${fresh.body.sessionId}/retake`, {});
  assert.equal(noRetake.status, 409);
  assert.deepEqual(keyShape(noRetake.body), { error: "string" });
  const wrongStage = await post(`/api/session/${fresh.body.sessionId}/lock`, {});
  assert.equal(wrongStage.status, 409);
  assert.deepEqual(keyShape(wrongStage.body), { error: "string", stage: "string" });
  const badAction = await post(`/api/session/${fresh.body.sessionId}/capture`, { action: "bogus" });
  assert.equal(badAction.status, 400);
  assert.deepEqual(keyShape(badAction.body), { action: "string", error: "string" });
});

test("submission names Aria; limitations block byte-identical", () => {
  const submission = readFileSync(join(ROOT, "docs/submission.md"), "utf8");
  const lines = submission.split("\n");
  assert.equal(lines[0], SUBMISSION_TITLE);
  assert.ok(lines[8].includes("read by Aria"), "line 9 names Aria");
  assert.ok(!lines[8].includes("read by the system"));
  const sectionStart = submission.indexOf("## What this does not claim");
  const sectionEnd = submission.indexOf("\n## ", sectionStart);
  assert.ok(sectionStart >= 0 && sectionEnd > sectionStart);
  assert.equal(
    submission.slice(sectionStart, sectionEnd),
    LIMITATIONS_BLOCK + "\n",
    "limitations section must be byte-identical",
  );

  const spec = readFileSync(join(ROOT, "docs/specs/2026-10-31-au-voice-idv-spec.md"), "utf8");
  const consentRow = spec.split("\n").find((l) => l.startsWith("| consent |"));
  assert.ok(consentRow && consentRow.includes(`"${CONSENT}"`));
});
