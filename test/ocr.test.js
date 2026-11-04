// Server OCR on locked crops, rendered on the customer page.
// Pins the spec edge matrix: happy extraction, fixture-labeled fallback,
// lock robustness (oversize/failure/non-doc), lifecycle purge, display-only
// decisions, and the end-user zero-details split. Precondition: build.
import { test } from "node:test";
import assert from "node:assert/strict";
import app, { evaluateFixture, MAX_CROP_CHARS } from "../dist/index.js";
import { ocrCrop } from "../dist/providers.js";
import { META_MODELS, SPEND_LEDGER } from "../dist/meta-models.js";

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

/** OCR details live on the token-gated JSON twin — never the session feed. */
async function getTwinOcr(customerLink) {
  const twin = await app.request(customerLink.replace("/result/", "/api/result/"));
  assert.equal(twin.status, 200);
  return (await twin.json()).ocr;
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

async function driveSignalsToDecided(sessionId) {
  let step = await post(`/api/session/${sessionId}/say`, { utterance: "I consent" });
  for (let i = 0; i < 12 && step.body.stage !== "decided"; i++) {
    const event = AUTO_SIGNAL[step.body.stage];
    assert.ok(event, `no auto signal for stage ${step.body.stage}`);
    step = await post(`/api/session/${sessionId}/signal`, { event });
  }
  assert.equal(step.body.stage, "decided");
  return step.body;
}

/** Stub Wonder fetcher: asserts the pinned id + crop, returns DL JSON. */
function stubWonder(text, seen = null) {
  return async (_url, opts) => {
    const body = JSON.parse(opts.body);
    assert.equal(body.model, META_MODELS.wonder);
    assert.ok(body.image_base64, "OCR posts the locked crop as image_base64");
    if (seen) seen.push(body.model);
    return { ok: true, json: async () => ({ output_text: text }) };
  };
}

const PIXELS = "A".repeat(120);

const FRONT_JSON = JSON.stringify({
  licence_number: "W1234567",
  full_name: "ALEX JORDAN CITIZEN",
  dob: "1990-01-01",
  address: "7 QUAY ST SYDNEY NSW 2000",
  expiry_date: "2030-01-01",
  injected: "drop me",
});
const BACK_JSON = JSON.stringify({ card_number: "C998877" });

/** Key the server with a stubbed network: Wonder reads, others speak. */
async function withKeyedMeta(fn, { wonderImpl = null, seen = null } = {}) {
  const realFetch = globalThis.fetch;
  const realKey = process.env.META_API_KEY;
  process.env.META_API_KEY = "test";
  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    if (seen) seen.push(body.model);
    if (body.model === META_MODELS.wonder) {
      if (wonderImpl) return wonderImpl(url, opts, body);
      assert.ok(body.image_base64, "OCR posts the locked crop as image_base64");
      const side = String(body.input).includes("licence back") ? "back" : "front";
      return { ok: true, json: async () => ({ output_text: side === "back" ? BACK_JSON : FRONT_JSON }) };
    }
    if (body.model === META_MODELS.sam) return { ok: true, json: async () => ({ regions: [] }) };
    return { ok: true, json: async () => ({ output_text: "Spoken." }) };
  };
  try {
    return await fn();
  } finally {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.META_API_KEY;
    else process.env.META_API_KEY = realKey;
  }
}

test("ocrCrop: Meta-first extraction parses DL JSON, drops unknown keys", async () => {
  const before = SPEND_LEDGER.length;
  const res = await ocrCrop(
    { side: "front", imageBase64: "data:image/jpeg;base64," + PIXELS },
    { env: { META_API_KEY: "test" }, fetcher: stubWonder(`Here you go:\n${FRONT_JSON}\n`) },
  );
  assert.equal(res.provider, "meta");
  assert.deepEqual(res.skipped, []);
  assert.equal(res.fields.side, "front");
  assert.equal(res.fields.licence_number, "W1234567");
  assert.equal(res.fields.expiry_date, "2030-01-01");
  assert.ok(!("injected" in res.fields), "unknown keys dropped");
  assert.equal(SPEND_LEDGER.length, before + 1, "spend logged after success");
  assert.equal(SPEND_LEDGER[SPEND_LEDGER.length - 1].model, META_MODELS.wonder);
});

test("ocrCrop: unkeyed, imageless, failed, and unparseable all fall back, never throw", async () => {
  const before = SPEND_LEDGER.length;
  const unkeyed = await ocrCrop({ side: "front", imageBase64: "AAA" }, { env: {} });
  assert.equal(unkeyed.provider, "local");
  assert.equal(unkeyed.fields, null);
  assert.deepEqual(unkeyed.skipped, ["meta: not configured"]);

  const noImage = await ocrCrop({ side: "back" }, { env: { META_API_KEY: "t" } });
  assert.equal(noImage.fields, null);
  assert.ok(noImage.skipped[0].startsWith("meta: no image"));

  const failing = async () => { throw new Error("boom"); };
  const failed = await ocrCrop(
    { side: "front", imageBase64: "AAA" },
    { env: { META_API_KEY: "t" }, fetcher: failing },
  );
  assert.equal(failed.provider, "local");
  assert.equal(failed.fields, null);
  assert.ok(failed.skipped.some((s) => s.includes("boom")), "skipped records why");

  const garbage = await ocrCrop(
    { side: "front", imageBase64: "AAA" },
    { env: { META_API_KEY: "t" }, fetcher: stubWonder("no json here") },
  );
  assert.equal(garbage.fields, null);
  assert.ok(garbage.skipped.some((s) => s.includes("no fields")));
  assert.equal(SPEND_LEDGER.length, before, "no spend logged without success");

  for (const text of ["{}", JSON.stringify({ foo: 1, bar: "x" })]) {
    const empty = await ocrCrop(
      { side: "front", imageBase64: "AAA" },
      { env: { META_API_KEY: "t" }, fetcher: stubWonder(text) },
    );
    assert.equal(empty.fields, null, `null fields for ${text}`);
    assert.ok(empty.skipped.some((s) => s.includes("no fields")), `skip recorded for ${text}`);
  }
  assert.equal(SPEND_LEDGER.length, before, "no spend for keyless reads");
});

test("HAPPY OCR: locked crops render redacted on the customer twins", async () => {
  await withKeyedMeta(async () => {
    const created = await post("/api/session", { fixtureId: "nsw-dl-clean" });
    const id = created.body.sessionId;
    await post(`/api/session/${id}/say`, { utterance: "I consent" });
    const crop = "data:image/jpeg;base64,CROPMARKERHAPPY" + PIXELS;
    const front = await post(`/api/session/${id}/lock`, { crop });
    assert.equal(front.status, 200);
    assert.equal(front.body.panel.primitive, "retake-pair");
    await post(`/api/session/${id}/keep`, {});
    await post(`/api/session/${id}/signal`, { event: "frames_done" });
    await post(`/api/session/${id}/lock`, { crop });
    await post(`/api/session/${id}/keep`, {});
    await post(`/api/session/${id}/signal`, { event: "frames_done" });
    let step = { body: { stage: "awaiting_challenge" } };
    for (let i = 0; i < 6 && step.body.stage !== "decided"; i++) {
      const event = AUTO_SIGNAL[step.body.stage];
      step = await post(`/api/session/${id}/signal`, { event });
    }
    assert.equal(step.body.stage, "decided");
    assert.equal(step.body.report.decision, "verified");

    const html = await getPage(step.body.customerLink);
    assert.ok(html.includes("document details"), "details section renders");
    assert.ok(html.includes("front · ocr"), "OCR-sourced front labeled");
    assert.ok(html.includes("back · ocr"), "OCR-sourced back labeled");
    assert.ok(html.includes("••••67"), "licence redacted to last two");
    assert.ok(html.includes("••••77"), "card number redacted to last two");
    for (const raw of ["W1234567", "C998877", "CROPMARKERHAPPY"]) {
      assert.ok(!html.includes(raw), `customer HTML leaks ${raw}`);
    }

    assert.ok(!("ocr" in step.body.report), "session feed stays verdict-only");
    const ocr = await getTwinOcr(step.body.customerLink);
    assert.equal(ocr.front.source, "ocr");
    assert.equal(ocr.front.values.licence_number, "••••67");
    assert.equal(ocr.back.values.card_number, "••••77");
    assert.ok(!JSON.stringify(ocr).includes("CROPMARKERHAPPY"), "crop bytes dropped");
  });
});

test("FALLBACK is FIXTURE_LABELED: offline DL runs render labeled fixture fields", async () => {
  const created = await post("/api/session", { fixtureId: "nsw-dl-clean" });
  const decided = await driveSignalsToDecided(created.body.sessionId);
  assert.equal(decided.report.decision, "verified");

  const html = await getPage(decided.customerLink);
  assert.ok(html.includes("document details"), "details section renders offline");
  assert.ok(html.includes("fixture fallback"), "fallback labeled as fixture");
  assert.ok(html.includes("••••78"), "fixture licence redacted (12345678)");
  assert.ok(html.includes("••••21"), "fixture card number redacted (654321)");
  assert.ok(!html.includes("12345678"), "full fixture licence never renders");
  assert.ok(!html.includes("654321"), "full fixture card number never renders");

  const twin = await app.request(decided.customerLink.replace("/result/", "/api/result/"));
  const twinJson = await twin.json();
  assert.equal(twinJson.ocr.front.source, "fixture-fallback");
  assert.equal(twinJson.ocr.front.values.licence_number, "••••78");
  assert.equal(twinJson.ocr.back.source, "fixture-fallback");
  assert.ok(!JSON.stringify(twinJson).includes("12345678"), "twin carries redacted refs only");
});

test("passport runs without OCR keep the report shape unchanged (no section)", async () => {
  const created = await post("/api/session", { fixtureId: "aus-passport-clean" });
  const decided = await driveSignalsToDecided(created.body.sessionId);
  assert.ok(!("ocr" in decided.report), "no ocr key without reads or DL truth");
  const html = await getPage(decided.customerLink);
  assert.ok(!html.includes("document details"), "no details section without fields");
});

test("locks never 4xx for OCR: oversize, Meta failure, and non-doc locks", async () => {
  // Oversize crop: lock succeeds on the standard confirm card.
  const created = await post("/api/session", { fixtureId: "nsw-dl-clean" });
  const id = created.body.sessionId;
  await post(`/api/session/${id}/say`, { utterance: "I consent" });
  const huge = "data:image/jpeg;base64," + "A".repeat(MAX_CROP_CHARS + 1);
  const oversize = await post(`/api/session/${id}/lock`, { crop: huge });
  assert.equal(oversize.status, 200);
  assert.equal(oversize.body.panel.primitive, "retake-pair");
  assert.equal(typeof oversize.body.verdict, "string");

  // Meta failure mid-run: lock succeeds, run completes on fallback.
  await withKeyedMeta(async () => {
    const failing = await post("/api/session", { fixtureId: "nsw-dl-clean" });
    const fid = failing.body.sessionId;
    await post(`/api/session/${fid}/say`, { utterance: "I consent" });
    const locked = await post(`/api/session/${fid}/lock`, { crop: "data:image/jpeg;base64," + PIXELS });
    assert.equal(locked.status, 200);
    assert.equal(locked.body.panel.primitive, "retake-pair");
  }, {
    wonderImpl: async () => { throw new Error("meta down"); },
  });

  // Non-doc lock with pixels attached: no OCR attempted (zero Wonder calls).
  const seen = [];
  await withKeyedMeta(async () => {
    const sid = (await post("/api/session", { fixtureId: "nsw-dl-clean" })).body.sessionId;
    await post(`/api/session/${sid}/say`, { utterance: "I consent" });
    await post(`/api/session/${sid}/signal`, { event: "front_captured" });
    await post(`/api/session/${sid}/signal`, { event: "frames_done" });
    await post(`/api/session/${sid}/signal`, { event: "back_captured" });
    await post(`/api/session/${sid}/signal`, { event: "frames_done" });
    const selfie = await post(`/api/session/${sid}/lock`, { crop: "data:image/jpeg;base64,SELFIEPIX" + PIXELS });
    assert.equal(selfie.status, 200);
    await post(`/api/session/${sid}/keep`, {});
  }, { seen });
  assert.ok(!seen.includes(META_MODELS.wonder), "selfie pixels never reach OCR");
});

test("retake drops pending fields; deny purges kept fields", async () => {
  await withKeyedMeta(async () => {
    // Retake: the pending read dies with the ref; decided shows fallback.
    const rid = (await post("/api/session", { fixtureId: "nsw-dl-clean" })).body.sessionId;
    await post(`/api/session/${rid}/say`, { utterance: "I consent" });
    await post(`/api/session/${rid}/lock`, { crop: "data:image/jpeg;base64," + PIXELS });
    await post(`/api/session/${rid}/retake`, {});
    let step = { body: { stage: "awaiting_doc_front" } };
    for (let i = 0; i < 12 && step.body.stage !== "decided"; i++) {
      const event = AUTO_SIGNAL[step.body.stage];
      step = await post(`/api/session/${rid}/signal`, { event });
    }
    assert.equal((await getTwinOcr(step.body.customerLink)).front.source, "fixture-fallback");

    // Deny: kept reads purge with the captures; the restarted run falls back.
    const did = (await post("/api/session", { fixtureId: "nsw-dl-clean" })).body.sessionId;
    await post(`/api/session/${did}/say`, { utterance: "I consent" });
    await post(`/api/session/${did}/lock`, { crop: "data:image/jpeg;base64," + PIXELS });
    const kept = await post(`/api/session/${did}/keep`, {});
    const revokedLink = kept.body.customerLink;
    const denied = await post(`/api/session/${did}/say`, { utterance: "I do not consent" });
    assert.deepEqual(denied.body.captures, []);
    await post(`/api/session/${did}/say`, { utterance: "I consent" });
    let again = { body: { stage: "awaiting_doc_front" } };
    for (let i = 0; i < 12 && again.body.stage !== "decided"; i++) {
      const event = AUTO_SIGNAL[again.body.stage];
      again = await post(`/api/session/${did}/signal`, { event });
    }
    // Revoked token stays dead; the restarted run mints a live link.
    assert.notEqual(again.body.customerLink, revokedLink);
    const dead = await app.request(revokedLink.replace("/result/", "/api/result/"));
    assert.equal(dead.status, 404);
    const revived = await getTwinOcr(again.body.customerLink);
    assert.equal(revived.front.source, "fixture-fallback");
  });
});

test("OCR is display-only: clean-looking reads never rescue a tampered run", async () => {
  await withKeyedMeta(async () => {
    const created = await post("/api/session", { fixtureId: "aus-passport-tampered-digit" });
    const id = created.body.sessionId;
    await post(`/api/session/${id}/say`, { utterance: "I consent" });
    await post(`/api/session/${id}/lock`, { crop: "data:image/jpeg;base64," + PIXELS });
    await post(`/api/session/${id}/keep`, {});
    let step = { body: { stage: "reading_front" } };
    for (let i = 0; i < 12 && step.body.stage !== "decided"; i++) {
      const event = AUTO_SIGNAL[step.body.stage];
      assert.ok(event, `no auto signal for stage ${step.body.stage}`);
      step = await post(`/api/session/${id}/signal`, { event });
    }
    assert.equal(step.body.report.decision, "rejected");
    assert.equal(step.body.report.decision, evaluateFixture("aus-passport-tampered-digit").decision);
  });
});

test("end-user, pending, and missing views carry zero OCR details", async () => {
  const page = await getPage("/page");
  for (const marker of ["document details", "fixture fallback", "licence_number", "card_number"]) {
    assert.ok(!page.includes(marker), `end-user page leaks ${marker}`);
  }
  const created = await post("/api/session", { fixtureId: "nsw-dl-clean" });
  const pending = await getPage(created.body.customerLink);
  assert.ok(!pending.includes("document details"), "pending page carries no details");
  const missing = await app.request("/result/00000000-0000-4000-8000-000000000000");
  assert.equal(missing.status, 404);
  assert.ok(!(await missing.text()).includes("document details"), "404 carries no details");
});

test("client posts the locked crop on doc stages only, capped", async () => {
  const page = await getPage("/page");
  assert.ok(page.includes("function takeCrop"), "crop grab exists");
  assert.ok(
    page.includes("captureStage === 'awaiting_doc_front' || captureStage === 'awaiting_doc_back'"),
    "crop gated to doc stages",
  );
  assert.ok(page.includes("CROP_MAX_DIM"), "crop downscaled");
  assert.ok(page.includes("url.length > CROP_MAX_CHARS"), "over-cap grabs dropped");
  assert.ok(page.includes("takeSnapshot"), "confirm-card snapshot path untouched");
  assert.ok(page.includes("sayBody.crop = voiceCrop"), "voice lock-now attaches the crop");
  assert.ok(page.includes("Locking — reading document…"), "lock shows progress, never a dead button");
  assert.ok(page.includes("LOCK_TIMEOUT_MS"), "keyed locks bound the wait");
  assert.ok(page.includes("Still working — tap Lock to collect."), "timeout recovers via idempotent re-tap");
});

test("passport doc locks never OCR: photo pages are not licences", async () => {
  const seen = [];
  await withKeyedMeta(async () => {
    const created = await post("/api/session", { fixtureId: "aus-passport-clean" });
    const id = created.body.sessionId;
    await post(`/api/session/${id}/say`, { utterance: "I consent" });
    const locked = await post(`/api/session/${id}/lock`, { crop: "data:image/jpeg;base64," + PIXELS });
    assert.equal(locked.status, 200);
    await post(`/api/session/${id}/keep`, {});
    let step = { body: { stage: "reading_front" } };
    for (let i = 0; i < 12 && step.body.stage !== "decided"; i++) {
      const event = AUTO_SIGNAL[step.body.stage];
      step = await post(`/api/session/${id}/signal`, { event });
    }
    assert.equal(step.body.stage, "decided");
    assert.ok(!("ocr" in step.body.report), "no ocr key on passport runs");
    const html = await getPage(step.body.customerLink);
    assert.ok(!html.includes("document details"), "no details section on passport runs");
  }, { seen });
  assert.ok(!seen.includes(META_MODELS.wonder), "passport pixels never reach OCR");
});

test("partial OCR reads render unread, trimmed, and capped on both twins", async () => {
  const partial = JSON.stringify({ licence_number: "  X9  ", full_name: "A".repeat(300) });
  await withKeyedMeta(async () => {
    const created = await post("/api/session", { fixtureId: "nsw-dl-clean" });
    const id = created.body.sessionId;
    await post(`/api/session/${id}/say`, { utterance: "I consent" });
    await post(`/api/session/${id}/lock`, { crop: "data:image/jpeg;base64," + PIXELS });
    await post(`/api/session/${id}/keep`, {});
    let step = { body: { stage: "reading_front" } };
    for (let i = 0; i < 12 && step.body.stage !== "decided"; i++) {
      const event = AUTO_SIGNAL[step.body.stage];
      step = await post(`/api/session/${id}/signal`, { event });
    }
    const front = (await getTwinOcr(step.body.customerLink)).front;
    assert.equal(front.source, "ocr");
    assert.equal(front.values.licence_number, "••••X9");
    assert.equal(front.values.full_name.length, 200);
    assert.equal(front.values.dob, "unread");
    assert.equal(front.values.address, "unread");
    assert.equal(front.values.expiry_date, "unread");
    const html = await getPage(step.body.customerLink);
    assert.ok(html.includes("••••X9"), "trimmed number redacted");
    assert.ok(html.includes("unread"), "missing fields marked unread");
  }, {
    wonderImpl: async () => ({ ok: true, json: async () => ({ output_text: partial }) }),
  });
});

test("mixed runs label each side: ocr where read, fixture where not", async () => {
  await withKeyedMeta(async () => {
    const created = await post("/api/session", { fixtureId: "nsw-dl-clean" });
    const id = created.body.sessionId;
    await post(`/api/session/${id}/say`, { utterance: "I consent" });
    await post(`/api/session/${id}/lock`, { crop: "data:image/jpeg;base64," + PIXELS });
    await post(`/api/session/${id}/keep`, {});
    await post(`/api/session/${id}/signal`, { event: "frames_done" });
    await post(`/api/session/${id}/signal`, { event: "back_captured" });
    await post(`/api/session/${id}/signal`, { event: "frames_done" });
    let step = { body: { stage: "awaiting_challenge" } };
    for (let i = 0; i < 6 && step.body.stage !== "decided"; i++) {
      const event = AUTO_SIGNAL[step.body.stage];
      step = await post(`/api/session/${id}/signal`, { event });
    }
    const mixed = await getTwinOcr(step.body.customerLink);
    assert.equal(mixed.front.source, "ocr");
    assert.equal(mixed.back.source, "fixture-fallback");
    const html = await getPage(step.body.customerLink);
    assert.ok(html.includes("front · ocr"), "read side labeled ocr");
    assert.ok(html.includes("back · fixture fallback"), "unread side labeled fallback");
  });
});

test("short non-image crops lock cleanly and fall back with zero Wonder calls", async () => {
  const seen = [];
  await withKeyedMeta(async () => {
    const created = await post("/api/session", { fixtureId: "nsw-dl-clean" });
    const id = created.body.sessionId;
    await post(`/api/session/${id}/say`, { utterance: "I consent" });
    const locked = await post(`/api/session/${id}/lock`, { crop: "not-a-data-url" });
    assert.equal(locked.status, 200);
    assert.equal(locked.body.panel.primitive, "retake-pair");
    await post(`/api/session/${id}/keep`, {});
    let step = { body: { stage: "reading_front" } };
    for (let i = 0; i < 12 && step.body.stage !== "decided"; i++) {
      const event = AUTO_SIGNAL[step.body.stage];
      step = await post(`/api/session/${id}/signal`, { event });
    }
    assert.equal((await getTwinOcr(step.body.customerLink)).front.source, "fixture-fallback");
  }, { seen });
  assert.ok(!seen.includes(META_MODELS.wonder), "non-image crops never reach OCR");
});

test("malformed image crops never reach OCR: bare prefix, bad MIME, short payload", async () => {
  const seen = [];
  await withKeyedMeta(async () => {
    for (const crop of [
      "data:image/",
      "data:image/jpeg;base64,!!!not-base64!!!",
      "data:image/svg+xml;base64," + PIXELS,
      "data:image/jpeg;base64,short",
    ]) {
      const created = await post("/api/session", { fixtureId: "nsw-dl-clean" });
      const id = created.body.sessionId;
      await post(`/api/session/${id}/say`, { utterance: "I consent" });
      const locked = await post(`/api/session/${id}/lock`, { crop });
      assert.equal(locked.status, 200, `locks with ${crop.slice(0, 24)}…`);
      assert.equal(locked.body.panel.primitive, "retake-pair");
    }
  }, { seen });
  assert.ok(!seen.includes(META_MODELS.wonder), "garbage crops never reach OCR");
});

test("lock/retake loops cannot drain Meta spend: 3 attempts per stage", async () => {
  const seen = [];
  await withKeyedMeta(async () => {
    const created = await post("/api/session", {});
    const id = created.body.sessionId;
    await post(`/api/session/${id}/say`, { utterance: "I consent" });
    const crop = "data:image/jpeg;base64," + PIXELS;
    for (let i = 0; i < 5; i++) {
      const locked = await post(`/api/session/${id}/lock`, { crop });
      assert.equal(locked.status, 200, `loop lock ${i + 1} lands`);
      await post(`/api/session/${id}/retake`, {});
    }
  }, { seen });
  const wonderCalls = seen.filter((m) => m === META_MODELS.wonder).length;
  assert.equal(wonderCalls, 3, `5 rapid locks bill exactly 3, billed ${wonderCalls}`);
});

test("voice 'lock now' OCRs the locked frame like a tap", async () => {
  const seen = [];
  await withKeyedMeta(async () => {
    const created = await post("/api/session", { fixtureId: "nsw-dl-clean" });
    const id = created.body.sessionId;
    await post(`/api/session/${id}/say`, { utterance: "I consent" });
    const locked = await post(`/api/session/${id}/say`, {
      utterance: "lock now",
      crop: "data:image/jpeg;base64," + PIXELS,
    });
    assert.equal(locked.status, 200);
    assert.ok(locked.body.pendingCapture, "voice lock opens the pair");
    await post(`/api/session/${id}/keep`, {});
    let step = { body: { stage: "reading_front" } };
    for (let i = 0; i < 12 && step.body.stage !== "decided"; i++) {
      const event = AUTO_SIGNAL[step.body.stage];
      step = await post(`/api/session/${id}/signal`, { event });
    }
    assert.equal((await getTwinOcr(step.body.customerLink)).front.source, "ocr");
  }, { seen });
  assert.ok(seen.includes(META_MODELS.wonder), "voice lock reaches Wonder");
});

test("action-form locks carry the crop to OCR", async () => {
  await withKeyedMeta(async () => {
    const created = await post("/api/session", { fixtureId: "nsw-dl-clean" });
    const id = created.body.sessionId;
    await post(`/api/session/${id}/say`, { utterance: "I consent" });
    const locked = await post(`/api/session/${id}/capture`, {
      action: "lock",
      crop: "data:image/jpeg;base64," + PIXELS,
    });
    assert.equal(locked.status, 200);
    assert.ok(locked.body.pendingCapture, "action-form lock opens a pair");
    await post(`/api/session/${id}/keep`, {});
    let step = { body: { stage: "reading_front" } };
    for (let i = 0; i < 12 && step.body.stage !== "decided"; i++) {
      const event = AUTO_SIGNAL[step.body.stage];
      step = await post(`/api/session/${id}/signal`, { event });
    }
    assert.equal((await getTwinOcr(step.body.customerLink)).front.source, "ocr");
  });
});

test("OCR values render HTML-escaped; the JSON twin keeps raw text", async () => {
  const evil = JSON.stringify({
    licence_number: "W1234567",
    full_name: "<img src=x>",
    address: "a&b",
  });
  await withKeyedMeta(async () => {
    const created = await post("/api/session", { fixtureId: "nsw-dl-clean" });
    const id = created.body.sessionId;
    await post(`/api/session/${id}/say`, { utterance: "I consent" });
    await post(`/api/session/${id}/lock`, { crop: "data:image/jpeg;base64," + PIXELS });
    await post(`/api/session/${id}/keep`, {});
    let step = { body: { stage: "reading_front" } };
    for (let i = 0; i < 12 && step.body.stage !== "decided"; i++) {
      const event = AUTO_SIGNAL[step.body.stage];
      step = await post(`/api/session/${id}/signal`, { event });
    }
    const html = await getPage(step.body.customerLink);
    assert.ok(html.includes("&lt;img"), "angle brackets escaped");
    assert.ok(html.includes("a&amp;b"), "ampersand escaped");
    assert.ok(!html.includes("<img src=x>"), "no raw markup renders");
    const twinOcr = await getTwinOcr(step.body.customerLink);
    assert.equal(twinOcr.front.values.full_name, "<img src=x>", "twin keeps raw data");
  }, {
    wonderImpl: async () => ({ ok: true, json: async () => ({ output_text: evil }) }),
  });
});

test("keep during the OCR await attaches the read instead of burning it", async () => {
  let entered = false;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await withKeyedMeta(async () => {
    const created = await post("/api/session", { fixtureId: "nsw-dl-clean" });
    const id = created.body.sessionId;
    await post(`/api/session/${id}/say`, { utterance: "I consent" });
    const lockP = post(`/api/session/${id}/lock`, { crop: "data:image/jpeg;base64," + PIXELS });
    for (let i = 0; i < 100 && !entered; i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.ok(entered, "OCR await entered before keep");
    const kept = await post(`/api/session/${id}/keep`, {});
    assert.equal(kept.status, 200);
    release();
    const abandoned = await lockP;
    assert.equal(abandoned.body.stage, "reading_front", "stale lock turn abandoned");
    assert.equal(abandoned.body.pendingCapture, null);
    let step = { body: { stage: "reading_front" } };
    for (let i = 0; i < 12 && step.body.stage !== "decided"; i++) {
      const event = AUTO_SIGNAL[step.body.stage];
      step = await post(`/api/session/${id}/signal`, { event });
    }
    assert.equal((await getTwinOcr(step.body.customerLink)).front.source, "ocr");
  }, {
    wonderImpl: async () => {
      entered = true;
      await gate;
      return { ok: true, json: async () => ({ output_text: FRONT_JSON }) };
    },
  });
});

test("re-tap during the OCR await collects a renderable pair card", async () => {
  let entered = false;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const seen = [];
  await withKeyedMeta(async () => {
    const created = await post("/api/session", { fixtureId: "nsw-dl-clean" });
    const id = created.body.sessionId;
    await post(`/api/session/${id}/say`, { utterance: "I consent" });
    const lockP = post(`/api/session/${id}/lock`, { crop: "data:image/jpeg;base64," + PIXELS });
    for (let i = 0; i < 100 && !entered; i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.ok(entered, "OCR await entered before re-tap");
    const held = await post(`/api/session/${id}/lock`, {});
    assert.equal(held.body.panel.primitive, "retake-pair", "pair card renderable mid-await");
    assert.match(held.body.text, /Keep it, or retake/);
    assert.ok(held.body.pendingCapture, "held ref present");
    assert.ok(held.body.verdict, "held verdict recomputed, never null");
    release();
    const first = await lockP;
    assert.equal(first.body.pendingCapture, held.body.pendingCapture, "one ref, no double-mint");
  }, {
    seen,
    wonderImpl: async () => {
      entered = true;
      await gate;
      return { ok: true, json: async () => ({ output_text: FRONT_JSON }) };
    },
  });
  const wonderCalls = seen.filter((m) => m === META_MODELS.wonder).length;
  assert.equal(wonderCalls, 1, "racing re-tap burns no second OCR call");
});

test("deny during the OCR await abandons the lock; nothing resurrects", async () => {
  let entered = false;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await withKeyedMeta(async () => {
    const created = await post("/api/session", { fixtureId: "nsw-dl-clean" });
    const id = created.body.sessionId;
    const consented = await post(`/api/session/${id}/say`, { utterance: "I consent" });
    const revokedLink = consented.body.customerLink;
    const lockP = post(`/api/session/${id}/lock`, { crop: "data:image/jpeg;base64," + PIXELS });
    for (let i = 0; i < 100 && !entered; i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.ok(entered, "OCR await entered before deny");
    const denied = await post(`/api/session/${id}/say`, { utterance: "I do not consent" });
    assert.equal(denied.body.stage, "idle");
    release();
    const abandoned = await lockP;
    assert.equal(abandoned.body.stage, "idle", "stale lock abandoned, not landed");
    assert.equal(abandoned.body.pendingCapture, null);
    // The stale resolve resurrects nothing: revoked token dead, fresh run
    // decides cleanly on a live link showing only its own fallback.
    await post(`/api/session/${id}/say`, { utterance: "I consent" });
    await post(`/api/session/${id}/lock`, {});
    await post(`/api/session/${id}/keep`, {});
    let step = { body: { stage: "reading_front" } };
    for (let i = 0; i < 12 && step.body.stage !== "decided"; i++) {
      const event = AUTO_SIGNAL[step.body.stage];
      step = await post(`/api/session/${id}/signal`, { event });
    }
    assert.equal(step.body.stage, "decided");
    assert.notEqual(step.body.customerLink, revokedLink);
    const dead = await app.request(revokedLink.replace("/result/", "/api/result/"));
    assert.equal(dead.status, 404);
    const revived = await getTwinOcr(step.body.customerLink);
    assert.equal(revived.front.source, "fixture-fallback");
  }, {
    wonderImpl: async (url, opts, body) => {
      entered = true;
      await gate;
      assert.ok(body.image_base64, "OCR posts the locked crop as image_base64");
      return { ok: true, json: async () => ({ output_text: FRONT_JSON }) };
    },
  });
});
