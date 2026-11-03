import { test } from "node:test";
import assert from "node:assert/strict";
import app from "../dist/index.js";

// Customer result view: token-gated evidence page, verdict-only end user.
// Locks the audience split: /page renders the verdict moment only (banner
// + spoken confirmation + customer link), while /result/:token renders the
// full deterministic report for one run. Precondition: build.

async function post(path, body) {
  const response = await app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function getPage(path) {
  const response = await app.request(path);
  assert.equal(response.status, 200);
  return response.text();
}

const AUTO_SIGNAL = {
  awaiting_doc_front: "front_captured",
  reading_front: "frames_done",
  awaiting_doc_back: "back_captured",
  reading_back: "frames_done",
  awaiting_challenge: "challenge_done",
  awaiting_selfie: "selfie_captured",
  comparing: "tier_done",
};

async function createRun(fixtureId) {
  const created = await post("/api/session", { fixtureId });
  assert.equal(created.status, 200);
  return created.body;
}

async function driveToDecided(sessionId) {
  let step = await post(`/api/session/${sessionId}/say`, { utterance: "I consent" });
  for (let i = 0; i < 12 && step.body.stage !== "decided"; i++) {
    const event = AUTO_SIGNAL[step.body.stage];
    assert.ok(event, `no auto signal for stage ${step.body.stage}`);
    step = await post(`/api/session/${sessionId}/signal`, { event });
  }
  assert.equal(step.body.stage, "decided");
  assert.ok(step.body.report, "the decided step must carry the report");
  return step.body;
}

const UUID_LINK = /^\/result\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const CHECK_IDS = [
  "line_count",
  "char_set",
  "td3_length",
  "check_digit_docnum",
  "check_digit_dob",
  "check_digit_expiry",
  "check_digit_composite",
  "mrz_viz_match",
  "expiry_vs_today",
  "card_number_present",
  "address_sticker_match",
  "image_quality",
  "portrait_region_present",
  "portrait_splice_artifact",
  "face_match",
  "challenge_compliance",
];

const REPORT_KEYS = [
  "failedFirst",
  "userMessage",
  "fields_matched",
  "fields_mismatched",
];

test("end-user page: verdict moment only, zero check/evidence/audit content", async () => {
  const html = await getPage("/page");
  for (const id of CHECK_IDS) {
    assert.ok(!html.includes(id), `end-user page leaks check id ${id}`);
  }
  for (const marker of [
    "checks — failures first",
    "attack surface",
    "3 attack hypotheses",
    "Run adversarial audit",
    "n/a for",
    "vs printed",
    ...REPORT_KEYS,
  ]) {
    assert.ok(!html.includes(marker), `end-user page leaks evidence marker ${marker}`);
  }
  // The verdict moment stays: banner node, spoken line, link slot.
  for (const kept of [
    'id="decision"',
    'id="spoken"',
    'id="customerLink"',
    "renderDecisionFromPanel",
    "setSpoken",
  ]) {
    assert.ok(html.includes(kept), `verdict moment keeps ${kept}`);
  }
});

test("link delivery: decided step carries a copyable customer link", async () => {
  const created = await createRun("aus-passport-clean");
  assert.match(created.customerLink, UUID_LINK);
  const decided = await driveToDecided(created.sessionId);
  assert.match(decided.customerLink, UUID_LINK);
  assert.equal(decided.customerLink, created.customerLink, "one run keeps one link");

  const html = await getPage("/page");
  for (const marker of [
    "Customer result link:",
    "Open result",
    "Copy link",
    "navigator.clipboard.writeText",
    "latestCustomerLink",
  ]) {
    assert.ok(html.includes(marker), `link delivery renders ${marker}`);
  }
  for (const site of [
    "renderDecisionFromPanel(step.panel, step.report, step.customerLink)",
    "latestCustomerLink = step.customerLink ?? null",
    "renderDecisionFromPanel(panel, null, latestCustomerLink)",
  ]) {
    assert.ok(html.includes(site), `link call site pinned: ${site}`);
  }
});

test("customer token is distinct from the session id (no auth aliasing)", async () => {
  const created = await createRun("aus-passport-clean");
  const token = created.customerLink.replace("/result/", "");
  assert.notEqual(token, created.sessionId);
  const aliasSay = await post(`/api/session/${token}/say`, { utterance: "I consent" });
  assert.equal(aliasSay.status, 404);
  assert.deepEqual(aliasSay.body, { error: "unknown_session" });
  assert.equal((await app.request(`/result/${created.sessionId}`)).status, 404);
  assert.equal((await app.request(`/api/result/${created.sessionId}`)).status, 404);
});

test("deny revokes the customer link", async () => {
  const created = await createRun("nsw-dl-clean");
  const link = created.customerLink;
  assert.equal((await app.request(link)).status, 200);
  await post(`/api/session/${created.sessionId}/say`, { utterance: "I do not consent" });
  assert.equal((await app.request(link)).status, 404);
  assert.equal((await app.request(link.replace("/result/", "/api/result/"))).status, 404);
});

test("customer view: valid token renders the run's full evidence", async () => {
  const created = await createRun("aus-passport-clean");
  const decided = await driveToDecided(created.sessionId);
  assert.equal(decided.report.decision, "verified");

  const response = await app.request(decided.customerLink);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-robots-tag"), "noindex");
  const html = await response.text();
  assert.ok(html.includes("verified"), "verdict renders");
  assert.ok(html.includes(decided.report.userMessage), "tier message renders");
  assert.ok(html.includes("checks — failures first"), "evidence heading renders");
  for (const id of ["line_count", "mrz_viz_match", "face_match"]) {
    assert.ok(html.includes(id), `evidence renders check ${id}`);
  }
  assert.ok(html.includes("2 mrz lines present"), "evidence values render");
  assert.ok(html.includes("charset A-Z0-9&lt; only"), "evidence is HTML-escaped");
  assert.ok(!html.includes("charset A-Z0-9< only"), "raw angle brackets never render");
  assert.ok(html.includes("limitations"), "limitations heading renders");
  assert.ok(
    html.includes("Not liveness certification — motion confirms responsiveness only."),
    "limitation lines render",
  );
  assert.ok(html.includes("attack surface"), "attack surface renders");
  assert.ok(html.includes("3 attack hypotheses"), "audit summary renders");
  assert.ok(html.includes("Screen replay"), "audit hypotheses render");
  assert.ok(html.includes("aus-passport-clean"), "page names its run");
});

test("customer view: failures-first order matches the report", async () => {
  const created = await createRun("aus-passport-tampered-digit");
  const decided = await driveToDecided(created.sessionId);
  assert.equal(decided.report.decision, "rejected");

  const html = await getPage(decided.customerLink);
  const failedId = decided.report.failedFirst[0].id;
  assert.equal(decided.report.failedFirst[0].result, "fail");
  const passedId = decided.report.failedFirst.find((c) => c.result === "pass").id;
  assert.ok(
    html.indexOf(failedId) >= 0 && html.indexOf(failedId) < html.indexOf(passedId),
    `failing ${failedId} renders before passing ${passedId}`,
  );
});

test("customer view: gated JSON serves the same report (no second path)", async () => {
  const created = await createRun("nsw-dl-clean");
  const decided = await driveToDecided(created.sessionId);
  const apiPath = decided.customerLink.replace("/result/", "/api/result/");

  const response = await app.request(apiPath);
  assert.equal(response.status, 200);
  // Same builder, one deliberate difference: the gated twin additionally
  // carries the OCR section the verdict-only session feed omits.
  const { ocr, ...rest } = await response.json();
  assert.deepEqual(rest, decided.report);
  assert.ok(ocr, "twin carries the gated OCR section");
});

test("wrong token: nothing run-specific renders, no report keys leak", async () => {
  const response = await app.request("/result/00000000-0000-4000-8000-000000000000");
  assert.equal(response.status, 404);
  const html = await response.text();
  for (const marker of [
    "verified",
    "rejected",
    "not_verified",
    "decision",
    "tier",
    "attack",
    "limitations",
    "n/a for",
    ...CHECK_IDS,
    ...REPORT_KEYS,
  ]) {
    assert.ok(!html.includes(marker), `404 page leaks ${marker}`);
  }

  const api = await app.request("/api/result/00000000-0000-4000-8000-000000000000");
  assert.equal(api.status, 404);
  assert.deepEqual(await api.json(), { error: "unknown_result" });
});

test("expired token: same as wrong token after one day", async () => {
  const created = await createRun("nsw-dl-clean");
  await driveToDecided(created.sessionId);
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 23 * 60 * 60 * 1000;
    assert.equal((await app.request(created.customerLink)).status, 200);
    assert.equal(
      (await app.request(created.customerLink.replace("/result/", "/api/result/"))).status,
      200,
    );
    Date.now = () => realNow() + 25 * 60 * 60 * 1000;
    const expired = await app.request(created.customerLink);
    assert.equal(expired.status, 404);
    const html = await expired.text();
    for (const marker of ["verified", "decision", "line_count", ...REPORT_KEYS]) {
      assert.ok(!html.includes(marker), `expired page leaks ${marker}`);
    }
    const expiredApi = await app.request(
      created.customerLink.replace("/result/", "/api/result/"),
    );
    assert.equal(expiredApi.status, 404);
    assert.deepEqual(await expiredApi.json(), { error: "unknown_result" });
  } finally {
    Date.now = realNow;
  }
  assert.equal(
    (await app.request(created.customerLink)).status,
    404,
    "expired tokens stay dead after the clock restores",
  );
});

test("token reuse: same report both times, read-only", async () => {
  const created = await createRun("aus-passport-clean");
  const decided = await driveToDecided(created.sessionId);
  const first = await getPage(decided.customerLink);
  const second = await getPage(decided.customerLink);
  assert.equal(second, first);

  const apiPath = decided.customerLink.replace("/result/", "/api/result/");
  const again = await app.request(apiPath);
  assert.equal(again.status, 200);
  assert.deepEqual(await again.json(), decided.report);

  const mutation = await app.request(decided.customerLink, { method: "POST" });
  assert.equal(mutation.status, 404, "no state-mutating route under the token");
  const still = await getPage(decided.customerLink);
  assert.equal(still, first, "reads leave the report untouched");
});

test("undecided run: valid token renders a pending state naming the stage", async () => {
  const created = await createRun("nsw-dl-clean");
  const response = await app.request(created.customerLink);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes("Result not ready"), "pending state renders");
  assert.ok(html.includes("awaiting_consent"), "pending state names the stage");
  for (const marker of ["line_count", "attack surface", "3 attack hypotheses", ...REPORT_KEYS]) {
    assert.ok(!html.includes(marker), `pending page leaks ${marker}`);
  }

  const api = await app.request(created.customerLink.replace("/result/", "/api/result/"));
  assert.equal(api.status, 200);
  assert.deepEqual(await api.json(), { status: "pending", stage: "awaiting_consent" });

  const decided = await driveToDecided(created.sessionId);
  const landed = await getPage(decided.customerLink);
  assert.ok(landed.includes(decided.report.decision), "evidence lands at decision");
  assert.ok(landed.includes("card_number_present"), "run evidence renders after decision");
});

test("one link views one run only", async () => {
  const passport = await createRun("aus-passport-clean");
  const licence = await createRun("nsw-dl-clean");
  assert.notEqual(passport.customerLink, licence.customerLink);
  await driveToDecided(passport.sessionId);
  await driveToDecided(licence.sessionId);

  const passportHtml = await getPage(passport.customerLink);
  assert.ok(passportHtml.includes("aus-passport-clean"));
  assert.ok(!passportHtml.includes("nsw-dl-clean"));
  const licenceHtml = await getPage(licence.customerLink);
  assert.ok(licenceHtml.includes("nsw-dl-clean"));
  assert.ok(!licenceHtml.includes("aus-passport-clean"));
});

test("customer page: silent, read-only, no transcript", async () => {
  const created = await createRun("aus-passport-clean");
  const decided = await driveToDecided(created.sessionId);
  const html = await getPage(decided.customerLink);
  for (const marker of [
    "<script",
    "speechSynthesis",
    "SpeechRecognition",
    "getUserMedia",
    "<form",
    "fetch(",
    'id="transcript"',
    "I consent",
  ]) {
    assert.ok(!html.includes(marker), `customer page must not carry ${marker}`);
  }
  const pending = await createRun("nsw-dl-clean");
  const pendingHtml = await getPage(pending.customerLink);
  assert.ok(!pendingHtml.includes("<script"), "pending page ships no script either");
});

test("spoken quality verdicts stay on the voice path (not check evidence)", async () => {
  const created = await createRun("nsw-dl-clean");
  const id = created.sessionId;
  await post(`/api/session/${id}/say`, { utterance: "I consent" });
  const sampled = await post(`/api/session/${id}/telemetry`, {});
  assert.equal(sampled.body.lockReady, true);
  const locked = await post(`/api/session/${id}/lock`, {});
  assert.equal(locked.status, 200);
  assert.equal(locked.body.verdict, "Front captured: sharp, all four corners in.");
});
