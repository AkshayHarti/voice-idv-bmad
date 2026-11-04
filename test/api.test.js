import { test } from "node:test";
import assert from "node:assert/strict";
import app from "../dist/index.js";
import { narrate } from "../dist/providers.js";

async function post(path, body) {
  const response = await app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

const AUTO_SIGNAL = {
  awaiting_doc_front: "front_captured",
  reading_front: "frames_done",
  awaiting_doc_back: "back_captured",
  reading_back: "frames_done",
  awaiting_challenge: "challenge_done",
  awaiting_selfie: "selfie_captured",
  awaiting_review: "review_confirmed",
  comparing: "tier_done",
};

/**
 * Walk a full run the way the page does: consent by voice, then backend
 * signals across the capture stages to the Decision screen. Narration is
 * exercised first: with meta, keys are offered but the network is offline,
 * so the chain must fall back to local templates (template-first floor).
 * Decisions never flow through narration, so both modes decide identically.
 */
async function runFixture(fixtureId, { meta }) {
  const offline = async () => { throw new Error("offline"); };
  const env = meta
    ? { META_API_KEY: "test-key", OPENROUTER_API_KEY: "test-key" }
    : {};
  const spoken = await narrate(
    { turn: "progress", text: "Checking your details now…" },
    { env, fetcher: offline },
  );
  assert.equal(spoken.provider, "local");
  assert.ok(spoken.text.length > 0);

  const created = await post("/api/session", { fixtureId });
  assert.equal(created.status, 200);
  const id = created.body.sessionId;
  assert.ok(created.body.narration.text.length > 0, "every step carries narration text");

  let step = await post(`/api/session/${id}/say`, { utterance: "I consent" });
  assert.equal(step.body.stage, "awaiting_doc_front");
  for (let i = 0; i < 12 && step.body.stage !== "decided"; i++) {
    const event = AUTO_SIGNAL[step.body.stage];
    assert.ok(event, `no auto signal for stage ${step.body.stage}`);
    step = await post(`/api/session/${id}/signal`, { event });
    assert.ok(step.body.narration.text.length > 0, `narration text at ${step.body.stage}`);
  }
  assert.equal(step.body.stage, "decided");
  assert.ok(step.body.report, "the decided step must carry the report");
  return { decision: step.body.report.decision, report: step.body.report };
}

test("clean verifies, tampered rejects, no-meta parity", async () => {
  const clean = await runFixture("aus-passport-clean", {meta: false});
  const tamp = await runFixture("aus-passport-tampered-digit", {meta: false});
  assert.equal(clean.decision, "verified");
  assert.equal(tamp.decision, "rejected");
  const withMeta = await runFixture("aus-passport-clean", {meta: true});
  assert.equal(withMeta.decision, clean.decision);
});

test("API default session opens on vic-dl-clean; runs list leads with VIC", async () => {
  const runs = await app.request("/api/runs");
  assert.equal(runs.status, 200);
  const list = await runs.json();
  assert.equal(list[0].id, "vic-dl-clean");

  const created = await post("/api/session", {});
  assert.equal(created.status, 200);
  const id = created.body.sessionId;
  let step = await post(`/api/session/${id}/say`, { utterance: "I consent" });
  assert.equal(step.body.stage, "awaiting_doc_front");
  for (let i = 0; i < 12 && step.body.stage !== "decided"; i++) {
    const event = AUTO_SIGNAL[step.body.stage];
    assert.ok(event, `no auto signal for stage ${step.body.stage}`);
    step = await post(`/api/session/${id}/signal`, { event });
  }
  assert.equal(step.body.stage, "decided");
  assert.equal(step.body.report.fixture, "vic-dl-clean");
  assert.equal(step.body.report.decision, "verified");
});

test("unknown fixture id still 404s with the existing error shape", async () => {
  const created = await post("/api/session", { fixtureId: "qld-dl-clean" });
  assert.equal(created.status, 404);
  assert.equal(created.body.error, "unknown_fixture");
  assert.equal(created.body.id, "qld-dl-clean");
});

test("revoke consent normalises to deny and purges captures", async () => {
  const created = await post("/api/session", { fixtureId: "nsw-dl-clean" });
  assert.equal(created.status, 200);
  const id = created.body.sessionId;
  await post(`/api/session/${id}/say`, { utterance: "I consent" });
  await post(`/api/session/${id}/signal`, { event: "front_captured" });
  await post(`/api/session/${id}/signal`, { event: "frames_done" });
  const revoked = await post(`/api/session/${id}/say`, { utterance: "revoke consent" });
  assert.equal(revoked.body.intent, "deny");
  assert.equal(revoked.body.stage, "idle");
  assert.deepEqual(revoked.body.captures, []);
  assert.equal(revoked.body.capturesPurged, true);
});

test("session decisions equal report decisions per fixture (shared measurements)", async () => {
  for (const fixtureId of ["aus-passport-clean", "aus-passport-tampered-digit", "nsw-dl-clean"]) {
    const viaSession = await runFixture(fixtureId, { meta: false });
    const res = await app.request(`/api/run/${fixtureId}`);
    assert.equal(res.status, 200);
    const viaReport = await res.json();
    assert.equal(viaSession.decision, viaReport.decision);
    assert.equal(viaSession.report.tier, viaReport.tier);
  }
});

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("session creation works without WebCrypto (shaped fallback id)", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", {
    value: undefined,
    configurable: true,
    writable: true,
  });
  try {
    const created = await post("/api/session", { fixtureId: "aus-passport-clean" });
    assert.equal(created.status, 200);
    assert.match(created.body.sessionId, UUID_SHAPE);
    const said = await post(`/api/session/${created.body.sessionId}/say`, { utterance: "I consent" });
    assert.equal(said.body.stage, "awaiting_doc_front");
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor);
  }
  const primary = await post("/api/session", { fixtureId: "aus-passport-clean" });
  assert.equal(primary.status, 200);
  assert.match(primary.body.sessionId, UUID_SHAPE);
});
