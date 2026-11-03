import { test } from "node:test";
import assert from "node:assert/strict";
import app, { evaluateFixture } from "../dist/index.js";

// Goal 2 capture flow: lock/keep/retake, telemetry parking, deny purge,
// warn escalation across stages, decision parity. Precondition: build.

async function post(path, body) {
  const response = await app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

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

async function start(fixtureId) {
  const created = await post("/api/session", { fixtureId });
  assert.equal(created.status, 200);
  return created.body.sessionId;
}

async function say(id, utterance) {
  const res = await post(`/api/session/${id}/say`, { utterance });
  assert.equal(res.status, 200);
  return res.body;
}

async function fire(id, event) {
  const res = await post(`/api/session/${id}/signal`, { event });
  assert.equal(res.status, 200);
  return res.body;
}

async function sample(id, body) {
  const res = await post(`/api/session/${id}/telemetry`, body);
  assert.equal(res.status, 200);
  return res.body;
}

async function lock(id) {
  const res = await post(`/api/session/${id}/lock`, {});
  assert.equal(res.status, 200);
  return res.body;
}

async function keep(id) {
  const res = await post(`/api/session/${id}/keep`, {});
  assert.equal(res.status, 200);
  return res.body;
}

async function retake(id) {
  const res = await post(`/api/session/${id}/retake`, {});
  assert.equal(res.status, 200);
  return res.body;
}

/** Drive a DL run to a capture stage (front/back/challenge/selfie). */
async function driveTo(id, stage) {
  await say(id, "I consent");
  if (stage === "awaiting_doc_front") return;
  await fire(id, "front_captured");
  await fire(id, "frames_done");
  if (stage === "awaiting_doc_back") return;
  await fire(id, "back_captured");
  await fire(id, "frames_done");
  if (stage === "awaiting_challenge") return;
  await fire(id, "challenge_done");
}

test("lock/keep run completes all four captures and matches the report", async () => {
  const id = await start("nsw-dl-clean");
  await say(id, "I consent");
  const locked = await lock(id);
  assert.match(locked.pendingCapture, /^cap_\d+_[0-9a-f]{6}$/);
  assert.match(locked.text, /captured front/);
  assert.equal(locked.turn, "progress");
  assert.equal(locked.panel.primitive, "retake-pair");
  assert.deepEqual(
    locked.panel.choices.map((c) => c.id),
    ["keep", "retake"],
  );
  let step = await keep(id);
  assert.equal(step.advanced, true);
  assert.equal(step.pendingCapture, null);

  step = await fire(id, "frames_done");
  assert.equal(step.stage, "awaiting_doc_back");
  const backLock = await lock(id);
  assert.match(backLock.text, /Got the back/);
  step = await keep(id);
  assert.equal(step.stage, "reading_back");
  await fire(id, "frames_done");
  const challengeLock = await lock(id);
  assert.match(challengeLock.text, /Challenge frames captured/);
  step = await keep(id);
  assert.equal(step.stage, "awaiting_selfie");
  const selfieLock = await lock(id);
  assert.match(selfieLock.text, /Selfie captured/);
  step = await keep(id);
  assert.equal(step.stage, "comparing");
  step = await fire(id, "tier_done");
  assert.equal(step.stage, "decided");
  assert.equal(step.report.decision, evaluateFixture("nsw-dl-clean").decision);
  assert.equal(step.captures.length, 4);
});

test("retake discards the lock and holds the stage for another try", async () => {
  const id = await start("nsw-dl-clean");
  await say(id, "I consent");
  await lock(id);
  const redone = await retake(id);
  assert.equal(redone.pendingCapture, null);
  assert.equal(redone.stage, "awaiting_doc_front");
  assert.equal(redone.turn, "instruct");
  assert.deepEqual(redone.captures, []);
  // Nothing left to keep after the discard.
  const noKeep = await post(`/api/session/${id}/keep`, {});
  assert.equal(noKeep.status, 409);
  assert.equal(noKeep.body.error, "nothing_to_keep");
});

test("retake with nothing pending 409s and never clobbers the verdict", async () => {
  const id = await start("aus-passport-clean");
  await say(id, "I consent");
  const empty = await post(`/api/session/${id}/retake`, {});
  assert.equal(empty.status, 409);
  assert.equal(empty.body.error, "nothing_to_retake");

  // Drive to decided, then confirm the 409 leaves the verdict Turn alone.
  for (const event of ["front_captured", "frames_done", "challenge_done", "selfie_captured", "tier_done"]) {
    await fire(id, event);
  }
  const before = await fire(id, "noop");
  assert.equal(before.stage, "decided");
  assert.equal(before.turn, "result");
  const late = await post(`/api/session/${id}/retake`, {});
  assert.equal(late.status, 409);
  assert.equal(late.body.error, "nothing_to_retake");
  const after = await fire(id, "noop");
  assert.equal(after.turn, "result");
  assert.equal(after.text, before.text);
  assert.equal(after.stage, "decided");
});

test("keep with nothing pending 409s; lock outside capture 409s", async () => {
  const id = await start("nsw-dl-clean");
  const noKeep = await post(`/api/session/${id}/keep`, {});
  assert.equal(noKeep.status, 409);
  assert.equal(noKeep.body.error, "nothing_to_keep");
  // awaiting_consent is not a capture stage.
  const early = await post(`/api/session/${id}/lock`, {});
  assert.equal(early.status, 409);
  assert.equal(early.body.error, "wrong_stage");
});

test("deny purges locks and coach streaks; restarts start clean", async () => {
  const id = await start("nsw-dl-clean");
  await say(id, "I consent");
  await sample(id, { glare: 0.9 });
  await sample(id, { glare: 0.9 });
  const locked = await lock(id);
  assert.ok(locked.pendingCapture);
  const denied = await say(id, "revoke consent");
  assert.equal(denied.stage, "idle");
  assert.deepEqual(denied.captures, []);
  assert.equal(denied.pendingCapture, null);

  await say(id, "ready to start over");
  const fresh = await sample(id, { glare: 0.9 });
  // A surviving streak would warn on this sample; a clean restart coaches.
  assert.equal(fresh.turn, "re-ask");
  assert.equal(fresh.announced, true);
  assert.equal(fresh.faultCounts.glare, 1);
});

test("coach episodes rotate, identical repeats suppress; advance re-announces", async () => {
  const id = await start("nsw-dl-clean");
  await say(id, "I consent");
  const first = await sample(id, { glare: 0.9 });
  assert.equal(first.announced, true);
  // The 2nd episode rotates the variant (announced, new transcript line).
  const second = await sample(id, { glare: 0.9 });
  assert.equal(second.announced, true);
  assert.equal(second.turn, "re-ask");
  assert.notEqual(second.text, first.text);
  assert.equal(second.transcript.length, first.transcript.length + 1);
  const third = await sample(id, { glare: 0.9 });
  assert.equal(third.turn, "warn");
  assert.equal(third.announced, true);
  // The 4th repeats the fixed escalation wording: identical text suppresses.
  const fourth = await sample(id, { glare: 0.9 });
  assert.equal(fourth.announced, false);
  assert.equal(fourth.turn, "warn");
  assert.equal(
    fourth.transcript.length,
    third.transcript.length,
    "suppressed repeat appends no transcript line",
  );

  // Fresh run: one fault, advance, same fault. Announced:true proves the
  // advance reset the suppression — without it this repeat would stay
  // silent (the streak-1 text matches the pre-advance text).
  const id2 = await start("nsw-dl-clean");
  await say(id2, "I consent");
  await sample(id2, { glare: 0.9 });
  await fire(id2, "front_captured");
  const moved = await sample(id2, { glare: 0.9 });
  assert.equal(moved.turn, "re-ask");
  assert.equal(moved.announced, true);
});

test("telemetry warn parks at all four capture stages", async () => {
  for (const stage of [
    "awaiting_doc_front",
    "awaiting_doc_back",
    "awaiting_challenge",
    "awaiting_selfie",
  ]) {
    const id = await start("nsw-dl-clean");
    await driveTo(id, stage);
    const kinds = [];
    const announced = [];
    const texts = [];
    for (let i = 0; i < 3; i++) {
      const res = await sample(id, { glare: 0.9 });
      assert.equal(res.stage, stage, `parked at ${stage}`);
      assert.equal(res.advanced, false);
      kinds.push(res.turn);
      announced.push(res.announced);
      texts.push(res.text);
    }
    assert.deepEqual(kinds, ["re-ask", "re-ask", "warn"], stage);
    assert.deepEqual(announced, [true, true, true], stage);
    assert.equal(new Set(texts).size, 3, `rotated episodes at ${stage}`);
    const last = await sample(id, { glare: 0.9 });
    assert.match(last.text, /type a short description/, stage);
    assert.equal(last.stage, stage);
  }
});

test("camera_denied parks at all four capture stages with guidance", async () => {
  for (const stage of [
    "awaiting_doc_front",
    "awaiting_doc_back",
    "awaiting_challenge",
    "awaiting_selfie",
  ]) {
    const id = await start("nsw-dl-clean");
    await driveTo(id, stage);
    const parked = await fire(id, "camera_denied");
    assert.equal(parked.stage, stage, `parked at ${stage}`);
    assert.equal(parked.turn, "warn");
    assert.match(parked.text, /parked/);
    assert.match(parked.text, /stand-in/);
  }
  const id = await start("nsw-dl-clean");
  await say(id, "I consent");
  const denied = await sample(id, { denied: true });
  assert.equal(denied.turn, "warn");
  assert.equal(denied.lockReady, false);
  assert.equal(denied.announced, true);
  assert.equal(denied.stage, "awaiting_doc_front");
});

test("decided panel evidence deep-equals failedFirst on a mixed fixture", async () => {
  const id = await start("aus-passport-tampered-digit");
  await say(id, "I consent");
  let step;
  for (const event of ["front_captured", "frames_done", "challenge_done", "selfie_captured", "tier_done"]) {
    step = await fire(id, event);
  }
  assert.equal(step.stage, "decided");
  assert.equal(step.panel.primitive, "evidence-peek");
  assert.deepEqual(step.panel.evidence, step.report.failedFirst);
  assert.equal(step.panel.evidence[0].result, "fail");
  assert.equal(step.panel.verdict, "rejected");
  assert.equal(step.panel.tier, step.report.tier);
  assert.equal(step.panel.userMessage, step.report.userMessage);
});

test("telemetry noise never perturbs the decision core", async () => {
  for (const fixture of ["aus-passport-clean", "aus-passport-tampered-digit"]) {
    const id = await start(fixture);
    await say(id, "I consent");
    for (const event of ["front_captured", "frames_done", "challenge_done", "selfie_captured", "tier_done"]) {
      await sample(id, {});
      await sample(id, { glare: 0.9 });
      await sample(id, {});
      await fire(id, event);
    }
    const tail = await fire(id, "noop");
    assert.equal(tail.stage, "decided");
    assert.equal(tail.report.decision, evaluateFixture(fixture).decision, fixture);
  }
});

test("spoken keep/retake work while a lock is pending; chatter does not", async () => {
  const id = await start("nsw-dl-clean");
  await say(id, "I consent");
  await lock(id);
  const kept = await say(id, "keep it");
  assert.equal(kept.stage, "reading_front");
  assert.equal(kept.pendingCapture, null);

  await fire(id, "frames_done");
  await lock(id);
  const redone = await say(id, "retake");
  assert.equal(redone.stage, "awaiting_doc_back");
  assert.equal(redone.pendingCapture, null);

  await lock(id);
  const chatter = await say(id, "keep trying");
  assert.ok(chatter.pendingCapture, "pending lock survives chatter");
  assert.equal(chatter.stage, "awaiting_doc_back");

  await retake(id);
  await lock(id);
  const negated = await say(id, "don't retake");
  assert.ok(negated.pendingCapture, "negated retake holds the pair open");
  assert.equal(negated.stage, "awaiting_doc_back");
  assert.equal(negated.turn, "progress", "lock turn unclobbered, pair still open");
  assert.equal(negated.panel.primitive, "retake-pair");
  assert.equal(negated.captures.length, 1, "no new capture finalised");
  const exact = await say(id, "take it again");
  assert.equal(exact.pendingCapture, null, "exact phrase still retakes");
  assert.equal(exact.stage, "awaiting_doc_back");
});

test("lock composes a quality verdict from the latest sample, generic when none", async () => {
  // No samples: generic fallback verdict, fixed question still served.
  const id = await start("nsw-dl-clean");
  await say(id, "I consent");
  const generic = await lock(id);
  assert.equal(generic.verdict, "Front captured.");
  assert.match(generic.text, /Keep it, or retake/);
  // Verdict turn then question turn, in that order.
  const tail = generic.transcript.slice(-2);
  assert.equal(tail[0].text, "Front captured.");
  assert.equal(tail[0].kind, "progress");
  assert.equal(tail[1].text, generic.text);
  await retake(id);

  // Lock-ready sample: the full verdict.
  await sample(id, {});
  const full = await lock(id);
  assert.equal(full.verdict, "Front captured: sharp, all four corners in.");
  await retake(id);

  // Faulted sample: generic fallback, never a false quality claim.
  await sample(id, { glare: 0.9 });
  const faulted = await lock(id);
  assert.equal(faulted.verdict, "Front captured.");

  // The noun follows the stage.
  const id2 = await start("nsw-dl-clean");
  await driveTo(id2, "awaiting_doc_back");
  await sample(id2, {});
  const back = await lock(id2);
  assert.equal(back.verdict, "Back captured: sharp, all four corners in.");

  // Camera loss invalidates earlier samples: the stand-in lock verdicts
  // generic, never from a stale live frame.
  const id3 = await start("nsw-dl-clean");
  await say(id3, "I consent");
  await sample(id3, {});
  await sample(id3, { denied: true });
  const standin = await lock(id3);
  assert.equal(standin.verdict, "Front captured.");

  // Face stages earn the face-centered detail, not doc wording.
  const id4 = await start("nsw-dl-clean");
  await driveTo(id4, "awaiting_challenge");
  await sample(id4, {});
  const challenge = await lock(id4);
  assert.equal(challenge.verdict, "Challenge frames captured: sharp, face centered.");

  const id5 = await start("nsw-dl-clean");
  await driveTo(id5, "awaiting_selfie");
  await sample(id5, {});
  const selfie = await lock(id5);
  assert.equal(selfie.verdict, "Selfie captured: sharp, face centered.");

  // Retake invalidates the sample: relock with no resample verdicts generic.
  const id6 = await start("nsw-dl-clean");
  await say(id6, "I consent");
  await sample(id6, {});
  await lock(id6);
  await retake(id6);
  const relocked = await lock(id6);
  assert.equal(relocked.verdict, "Front captured.");

  // Signal-denied camera invalidates the same way.
  const id7 = await start("nsw-dl-clean");
  await say(id7, "I consent");
  await sample(id7, {});
  await fire(id7, "camera_denied");
  const deniedLock = await lock(id7);
  assert.equal(deniedLock.verdict, "Front captured.");
});

test("near-miss keep/retake resolve with an echo and heard→resolved transcript", async () => {
  const id = await start("nsw-dl-clean");
  await say(id, "I consent");
  await lock(id);
  const kept = await say(id, "kep it");
  assert.equal(kept.stage, "reading_front");
  assert.equal(kept.pendingCapture, null);
  assert.equal(kept.echo, "Keeping the front.");
  const heard = kept.transcript.find((l) => l.who === "you" && l.text.includes("kep it"));
  assert.equal(heard.text, "kep it → keep");
  assert.ok(kept.transcript.some((l) => l.who === "system" && l.text === "Keeping the front."));

  await fire(id, "frames_done");
  await lock(id);
  const redone = await say(id, "retak");
  assert.equal(redone.stage, "awaiting_doc_back");
  assert.equal(redone.pendingCapture, null);
  assert.equal(redone.echo, "Retaking the back.");
  assert.ok(redone.transcript.some((l) => l.who === "you" && l.text === "retak → retake"));
  assert.ok(redone.transcript.some((l) => l.who === "system" && l.text === "Retaking the back."));

  // Low-confidence near-miss re-asks with a fixed nudge: pair stays open,
  // nothing resolves, and the full question is NOT repeated verbatim.
  await lock(id);
  const unsure = await say(id, "keep it up");
  assert.ok(unsure.pendingCapture, "pending lock survives the re-ask");
  assert.equal(unsure.stage, "awaiting_doc_back");
  assert.equal(unsure.turn, "re-ask");
  assert.equal(unsure.text, "Sorry, I didn't catch that — keep it, or retake?");
  assert.doesNotMatch(unsure.text, /Got the back — captured/, "question not repeated verbatim");
  assert.equal(unsure.panel.primitive, "retake-pair", "pair card survives the nudge");
  assert.ok(
    unsure.transcript.some((l) => l.who === "system" && l.text === unsure.text),
    "nudge has a transcript twin",
  );
  assert.ok(!("echo" in unsure), "no echo without a resolution");

  // Exact phrasing still resolves with no echo key.
  const exact = await say(id, "keep it");
  assert.equal(exact.stage, "reading_back");
  assert.ok(!("echo" in exact));

  // Echo nouns follow the stage on face captures too.
  const idc = await start("nsw-dl-clean");
  await driveTo(idc, "awaiting_challenge");
  await lock(idc);
  const keptC = await say(idc, "kep it");
  assert.equal(keptC.echo, "Keeping the challenge frames.");

  const ids = await start("nsw-dl-clean");
  await driveTo(ids, "awaiting_selfie");
  await lock(ids);
  const keptS = await say(ids, "kep it");
  assert.equal(keptS.echo, "Keeping the selfie.");
});

test("truthy non-true screenshot/missingBack coach via the API", async () => {
  const id = await start("nsw-dl-clean");
  await say(id, "I consent");
  const shot = await sample(id, { screenshot: 1 });
  assert.equal(shot.turn, "warn");
  assert.equal(shot.lockReady, false);
  assert.equal(shot.fault, "screenshot");
  const back = await sample(id, { missingBack: 1 });
  assert.equal(back.turn, "re-ask");
  assert.equal(back.lockReady, false);
  assert.equal(back.fault, "missingBack");
  const clean = await sample(id, {});
  assert.equal(clean.turn, "progress");
  assert.equal(clean.lockReady, true);
  assert.equal(clean.fault, null);
});

test("telemetry and lock responses carry the additive capture keys", async () => {
  const id = await start("nsw-dl-clean");
  await say(id, "I consent");
  const res = await sample(id, { glare: 0.9 });
  assert.deepEqual(keyShape(res), {
    advanced: "boolean",
    announced: "boolean",
    captures: { array: [] },
    capturesPurged: "boolean",
    customerLink: "string",
    fault: "string",
    faultCounts: {
      dark: "number",
      finger: "number",
      glare: "number",
      missingBack: "number",
      moire: "number",
      screenshot: "number",
      skew: "number",
    },
    intent: "object",
    lockReady: "boolean",
    moireFlags: "number",
    narration: {
      provider: "string",
      skipped: { array: ["string"] },
      text: "string",
    },
    panel: {
      choices: { array: [{ id: "string", label: "string", utterance: "string" }] },
      primitive: "string",
      provider: "string",
      text: "string",
      title: "string",
    },
    pendingCapture: "object",
    report: "object",
    sessionId: "string",
    stage: "string",
    text: "string",
    transcript: {
      array: [
        { kind: "string", text: "string", who: "string" },
        { text: "string", who: "string" },
      ],
    },
    turn: "string",
  });

  const locked = await lock(id);
  assert.deepEqual(keyShape(locked.panel), {
    choices: { array: [{ id: "string", label: "string", utterance: "string" }] },
    primitive: "string",
    provider: "string",
    ref: "string",
    text: "string",
    title: "string",
  });
  assert.equal(typeof locked.pendingCapture, "string");
});

test("suppressed repeats answer template narration, never the model chain", async () => {
  const id = await start("nsw-dl-clean");
  await say(id, "I consent");
  // Episodes 1–3 announce (variant a, variant b, escalation); the 4th
  // repeats the fixed escalation wording and suppresses.
  await sample(id, { glare: 0.9 });
  await sample(id, { glare: 0.9 });
  await sample(id, { glare: 0.9 });
  const suppressed = await sample(id, { glare: 0.9 });
  assert.equal(suppressed.announced, false);
  assert.equal(suppressed.narration.provider, "local");
  assert.deepEqual(suppressed.narration.skipped, ["model: suppressed repeat-episode"]);
});

test("truthy non-true denied parks like denied:true", async () => {
  const id = await start("nsw-dl-clean");
  await say(id, "I consent");
  const parked = await sample(id, { denied: 1 });
  assert.equal(parked.turn, "warn");
  assert.match(parked.text, /parked/);
  assert.equal(parked.lockReady, false);
  assert.equal(parked.stage, "awaiting_doc_front");
});

test("streak resets across alternating faults and clean samples", async () => {
  const id = await start("nsw-dl-clean");
  await say(id, "I consent");
  await sample(id, { glare: 0.9 });
  await sample(id, { glare: 0.9 });
  const switched = await sample(id, { dark: 0.9 });
  assert.equal(switched.turn, "re-ask");
  assert.equal(switched.faultCounts.glare, 0);
  assert.equal(switched.faultCounts.dark, 1);
  await sample(id, { dark: 0.9 });
  const back = await sample(id, { glare: 0.9 });
  assert.equal(back.turn, "re-ask", "no stale-count warn");
  assert.equal(back.faultCounts.glare, 1);
  await sample(id, { glare: 0.9 });
  const clear = await sample(id, {});
  assert.equal(clear.turn, "progress");
  const after = await sample(id, { glare: 0.9 });
  assert.equal(after.faultCounts.glare, 1);
  await sample(id, { glare: 0.9 });
  const third = await sample(id, { glare: 0.9 });
  assert.equal(third.turn, "warn");
});

test("retake re-instructs with the stage-appropriate prompt", async () => {
  const cases = [
    ["awaiting_doc_front", /Hold your licence up/],
    ["awaiting_doc_back", /flip the card over/],
    ["awaiting_challenge", /turn your head slowly/],
    ["awaiting_selfie", /Hold still for your selfie/],
  ];
  for (const [stage, pattern] of cases) {
    const id = await start("nsw-dl-clean");
    await driveTo(id, stage);
    await lock(id);
    const redone = await retake(id);
    assert.equal(redone.stage, stage);
    assert.equal(redone.turn, "instruct");
    assert.match(redone.text, pattern);
  }
});

test("alias routes delegate to the capture handlers", async () => {
  const id = await start("nsw-dl-clean");
  await say(id, "I consent");
  const viaSample = await post(`/api/session/${id}/sample`, { glare: 0.9 });
  assert.equal(viaSample.status, 200);
  assert.equal(viaSample.body.turn, "re-ask");
  const viaNested = await post(`/api/session/${id}/capture/lock`, {});
  assert.equal(viaNested.status, 200);
  assert.ok(viaNested.body.pendingCapture);
  const keepNested = await post(`/api/session/${id}/capture/keep`, {});
  assert.equal(keepNested.status, 200);
  assert.equal(keepNested.body.stage, "reading_front");
  await fire(id, "frames_done");
  const actionLock = await post(`/api/session/${id}/capture`, {});
  assert.equal(actionLock.status, 200);
  assert.ok(actionLock.body.pendingCapture, "missing action defaults to lock");
  const actionRetake = await post(`/api/session/${id}/capture`, { action: "retake" });
  assert.equal(actionRetake.status, 200);
  assert.equal(actionRetake.body.pendingCapture, null);
  const actionLock2 = await post(`/api/session/${id}/capture`, { action: "lock" });
  assert.ok(actionLock2.body.pendingCapture);
  const actionKeep = await post(`/api/session/${id}/capture`, { action: "keep" });
  assert.equal(actionKeep.status, 200);
  assert.equal(actionKeep.body.stage, "reading_back");
  const nestedRetake = await post(`/api/session/${id}/capture/retake`, {});
  assert.equal(nestedRetake.status, 409, "nothing pending after keep");
});

test("denied and clean telemetry responses pin their shapes", async () => {
  const id = await start("nsw-dl-clean");
  await say(id, "I consent");
  const denied = await sample(id, { denied: true });
  assert.deepEqual(keyShape(denied), {
    advanced: "boolean",
    announced: "boolean",
    captures: { array: [] },
    capturesPurged: "boolean",
    customerLink: "string",
    fault: "object",
    faultCounts: {
      dark: "number",
      finger: "number",
      glare: "number",
      missingBack: "number",
      moire: "number",
      screenshot: "number",
      skew: "number",
    },
    intent: "object",
    lockReady: "boolean",
    moireFlags: "number",
    narration: {
      provider: "string",
      skipped: { array: ["string"] },
      text: "string",
    },
    panel: {
      choices: { array: [{ id: "string", label: "string", utterance: "string" }] },
      primitive: "string",
      provider: "string",
      text: "string",
      title: "string",
    },
    pendingCapture: "object",
    report: "object",
    sessionId: "string",
    stage: "string",
    text: "string",
    transcript: {
      array: [
        { kind: "string", text: "string", who: "string" },
        { text: "string", who: "string" },
      ],
    },
    turn: "string",
  });

  const id2 = await start("nsw-dl-clean");
  await say(id2, "I consent");
  const clean = await sample(id2, {});
  assert.equal(clean.fault, null);
  assert.equal(clean.lockReady, true);
  assert.equal(clean.turn, "progress");
  assert.deepEqual(keyShape(clean.panel), {
    primitive: "string",
    provider: "string",
    steps: { array: [{ id: "string", label: "string", state: "string" }] },
    text: "string",
    title: "string",
  });
});
