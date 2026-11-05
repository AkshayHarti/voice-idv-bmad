import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generatePanel,
  isPanel,
  panelFor,
  validatePanel,
} from "../dist/panels.js";

// Goal 2 UI generator: every Turn kind binds, unknown fails closed,
// provider tags thread. Precondition: `npm run build`.

const KINDS = [
  "intro",
  "consent",
  "instruct",
  "re-ask",
  "replay",
  "progress",
  "warn",
  "result",
  "abort_confirm",
  "review",
];

test("every Turn kind binds exactly one primitive panel", () => {
  const expected = {
    intro: "text",
    consent: "choice-list",
    instruct: "progress-steps",
    "re-ask": "choice-list",
    replay: "confirm-row",
    progress: "progress-steps",
    warn: "choice-list",
    result: "evidence-peek",
    abort_confirm: "choice-list",
    review: "review-confirm",
  };
  for (const kind of KINDS) {
    const panel = generatePanel(kind, "awaiting_doc_front", { text: "hello" });
    assert.equal(panel.primitive, expected[kind], kind);
    assert.equal(panel.text, "hello", kind);
    assert.ok(isPanel(panel), `${kind} validates`);
  }
});

test("review binds rows plus the confirm pair; empty rows stay valid", () => {
  const panel = generatePanel("review", "awaiting_review", {
    text: "check",
    rows: [{ label: "Name", value: "ALEX" }],
  });
  assert.equal(panel.primitive, "review-confirm");
  assert.deepEqual(panel.rows, [{ label: "Name", value: "ALEX" }]);
  assert.deepEqual(
    panel.choices.map((c) => c.id),
    ["confirm", "startover"],
  );
  assert.ok(isPanel(panel));
  const empty = generatePanel("review", "awaiting_review", { text: "check" });
  assert.deepEqual(empty.rows, []);
  assert.ok(isPanel(empty), "unread details still validate");
  assert.equal(
    isPanel({
      primitive: "review-confirm",
      title: "t",
      text: "x",
      provider: "local templates",
      rows: [],
      choices: [],
    }),
    false,
    "a review without an acting pair is malformed",
  );
});

test("pending progress binds the retake pair with keep/retake", () => {
  const panel = generatePanel("progress", "awaiting_doc_front", {
    text: "captured",
    pending: true,
    ref: "cap_1_ab12cd",
  });
  assert.equal(panel.primitive, "retake-pair");
  assert.equal(panel.ref, "cap_1_ab12cd");
  assert.deepEqual(
    panel.choices.map((c) => c.id),
    ["keep", "retake"],
  );
  assert.ok(isPanel(panel));
});

test("panel schema carries no image field; the snapshot stays client-side", () => {
  for (const kind of KINDS) {
    const panel = generatePanel(kind, "awaiting_doc_front", {
      text: "t",
      pending: true,
      ref: "cap_1_ab12cd",
    });
    assert.ok(!("image" in panel), `${kind} carries no image field`);
  }
});

test("unknown kinds and shapes fail closed to text-only", () => {
  const unknown = generatePanel("bogus-kind", "awaiting_doc_front", {
    text: "fallback twin",
  });
  assert.equal(unknown.primitive, "text");
  assert.equal(unknown.text, "fallback twin");
  assert.ok(isPanel(unknown));
  assert.equal(panelFor("nope", "idle", { text: "t" }).primitive, "text");
});

test("validator rejects malformed panels", () => {
  assert.equal(isPanel(null), false);
  assert.equal(isPanel({}), false);
  assert.equal(
    isPanel({ primitive: "choice-list", title: "t", text: "x", provider: "local templates" }),
    false,
  );
  assert.equal(
    isPanel({
      primitive: "choice-list",
      title: "t",
      text: "x",
      provider: "local templates",
      choices: [],
    }),
    false,
  );
  assert.equal(
    isPanel({
      primitive: "choice-list",
      title: "t",
      text: "x",
      provider: "mystery",
      choices: [{ id: "a", label: "A", utterance: "a" }],
    }),
    false,
  );
  assert.equal(validatePanel(null), false);
});

test("provider tags thread; templates are the honest default", () => {
  const local = generatePanel("consent", "awaiting_consent", { text: "hi" });
  assert.equal(local.provider, "local templates");
  const spark = generatePanel("consent", "awaiting_consent", {
    text: "hi",
    provider: "Spark",
  });
  assert.equal(spark.provider, "Spark");
  assert.ok(isPanel(spark));
});

test("warn panel offers describe only (no dead retry)", () => {
  const panel = generatePanel("warn", "awaiting_doc_front", { text: "stuck" });
  assert.equal(panel.primitive, "choice-list");
  assert.deepEqual(
    panel.choices.map((c) => c.id),
    ["describe"],
  );
  assert.equal(panel.choices[0].label, "Describe what you see");
});

test("result panel preserves evidence order, tier, and limitations", () => {
  const evidence = [
    { id: "b", result: "pass", evidence: "ok b" },
    { id: "a", result: "fail", evidence: "bad a" },
  ];
  const panel = generatePanel("result", "decided", {
    text: "done",
    evidence,
    verdict: "rejected",
    tier: "manual_review",
    userMessage: "Manual review.",
    limitations: ["Not liveness certification."],
  });
  assert.equal(panel.primitive, "evidence-peek");
  assert.deepEqual(panel.evidence, evidence);
  assert.equal(panel.verdict, "rejected");
  assert.equal(panel.tier, "manual_review");
  assert.equal(panel.userMessage, "Manual review.");
  assert.deepEqual(panel.limitations, ["Not liveness certification."]);
  assert.ok(!("queue" in panel), "queue reasons never reach the panel");
});

test("choice panels carry tappable text equivalents", () => {
  const consent = generatePanel("consent", "awaiting_consent", { text: "c" });
  assert.deepEqual(
    consent.choices.map((c) => c.utterance),
    ["I consent", "not ready"],
  );
  const abort = generatePanel("abort_confirm", "idle", { text: "s" });
  assert.deepEqual(
    abort.choices.map((c) => c.utterance),
    ["ready"],
  );
  const reask = generatePanel("re-ask", "awaiting_doc_front", { text: "g" });
  assert.deepEqual(
    reask.choices.map((c) => c.utterance),
    ["repeat that", "help"],
  );
});

test("instruct steps track stage progress; passports omit the back step", () => {
  const front = generatePanel("instruct", "awaiting_doc_front", { text: "go" });
  assert.deepEqual(
    front.steps.map((s) => s.id),
    ["front", "back", "challenge", "selfie"],
  );
  assert.deepEqual(
    front.steps.map((s) => s.state),
    ["active", "todo", "todo", "todo"],
  );
  const back = generatePanel("instruct", "awaiting_doc_back", { text: "go" });
  assert.deepEqual(
    back.steps.map((s) => s.state),
    ["done", "active", "todo", "todo"],
  );
  const challenge = generatePanel("instruct", "awaiting_challenge", { text: "go" });
  assert.deepEqual(
    challenge.steps.map((s) => s.state),
    ["done", "done", "active", "todo"],
  );
  const passport = generatePanel("instruct", "awaiting_doc_front", {
    text: "go",
    hasBack: false,
  });
  assert.deepEqual(
    passport.steps.map((s) => s.id),
    ["front", "challenge", "selfie"],
  );
});
