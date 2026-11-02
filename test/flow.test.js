import { test } from "node:test";
import assert from "node:assert/strict";
import { startRun, say, signal } from "../dist/flow.js";
import { coach } from "../dist/telemetry.js";

test("speech cannot advance Stage; back required; not-ready is deny", () => {
  let s = startRun("nsw-dl-clean");
  s = say(s, "ready");
  assert.equal(s.stage, "awaiting_doc_front");
  s = signal(s, "front_captured");
  assert.equal(s.stage, "reading_front");
  let d = startRun("nsw-dl-missing-back");
  d = say(d, "I consent"); d = signal(d, "front_captured");
  assert.equal(d.stage, "awaiting_doc_back");
  assert.equal(say(startRun("nsw-dl-clean"), "not ready").last_intent, "deny");
  assert.equal(coach({glare: 0.9, turns: 1}).text.includes("Tilt the top"), true);
});

test("help is context-aware: back instruct when the run needs the back", () => {
  let d = startRun("nsw-dl-missing-back");
  d = say(d, "I consent"); d = signal(d, "front_captured");
  assert.equal(d.stage, "awaiting_doc_back");
  const h = say(d, "help, what do I do?");
  assert.equal(h.stage, "awaiting_doc_back");
  assert.equal(h.last_turn.kind, "instruct");
  assert.match(h.last_turn.text, /Card Number/);
  const hf = say(say(startRun("nsw-dl-clean"), "ready"), "help me");
  assert.match(hf.last_turn.text, /front facing the camera/);
});

test("passport run skips back stages", () => {
  let p = startRun("aus-passport-clean");
  p = say(p, "I consent");
  assert.equal(p.stage, "awaiting_doc_front");
  p = signal(p, "front_captured");
  assert.equal(p.stage, "reading_front");
  p = signal(p, "frames_done");
  assert.equal(p.stage, "awaiting_challenge");
});

test("missing-back run stays parked through say/signal noise; tier unreachable", () => {
  let d = startRun("nsw-dl-missing-back");
  d = say(d, "I consent"); d = signal(d, "front_captured");
  assert.equal(d.stage, "awaiting_doc_back");
  d = say(d, "ready");
  d = say(d, "say again?");
  d = say(d, "blah blah");
  for (const ev of ["back_captured", "frames_done", "ocr_done", "challenge_done", "selfie_captured", "tier_done"]) {
    d = signal(d, ev);
  }
  assert.equal(d.stage, "awaiting_doc_back");
  assert.equal(d.tier, null);
  assert.equal(d.decision, null);
});

test("coach counter >=3 parks with warn + typed-description alternative", () => {
  const t = coach({ glare: 0.9, turns: 3 });
  assert.equal(t.kind, "warn");
  assert.match(t.text, /type a short description/);
  assert.match(t.text, /parked/);
  assert.doesNotMatch(t.text, /not verified/);
  const w = coach({ screenshot: true });
  assert.equal(w.kind, "warn");
  assert.match(w.text, /photo of a screen/);
});

test("unknown utterances in capture stages acknowledge-and-hold", () => {
  let c = say(startRun("nsw-dl-clean"), "ready");
  assert.equal(c.stage, "awaiting_doc_front");
  const held = say(c, "it's a blue card with a hologram");
  assert.equal(held.stage, "awaiting_doc_front");
  assert.equal(held.last_intent, "unknown");
  assert.equal(held.last_turn.kind, "re-ask");
  assert.equal(held.last_turn.text, "Still on the front — hold steady.");
  // Consent/idle stages keep the consent-oriented re-ask.
  const idle = say(startRun("nsw-dl-clean"), "blah blah");
  assert.match(idle.last_turn.text, /I consent/);
});

test("hold lines rotate across repeats, never the same twice in a row", () => {
  let c = say(startRun("nsw-dl-clean"), "ready");
  const first = say(c, "blah one").last_turn.text;
  const second = say(say(c, "blah one"), "blah two").last_turn.text;
  const third = say(say(say(c, "blah one"), "blah two"), "blah three").last_turn.text;
  assert.equal(first, "Still on the front — hold steady.");
  assert.equal(second, "With you, same capture. Hold there.");
  assert.equal(third, "Stay with this one — nearly there.");
  assert.notEqual(first, second);
  assert.notEqual(second, third);
  // The noun follows the stage: a hold on the back never says "front".
  let d = say(startRun("nsw-dl-clean"), "ready");
  d = signal(d, "front_captured");
  d = signal(d, "frames_done");
  assert.equal(d.stage, "awaiting_doc_back");
  const backHold = say(d, "blah").last_turn.text;
  assert.equal(backHold, "Still on the back — hold steady.");
  assert.doesNotMatch(backHold, /front/);
  // Face-stage nouns and 4th-repeat wrap back to variant 1.
  let ch = say(startRun("nsw-dl-clean"), "ready");
  for (const ev of ["front_captured", "frames_done", "back_captured", "frames_done"]) {
    ch = signal(ch, ev);
  }
  assert.equal(ch.stage, "awaiting_challenge");
  assert.equal(say(ch, "blah").last_turn.text, "Still on the challenge — hold steady.");
  const se = signal(ch, "challenge_done");
  assert.equal(se.stage, "awaiting_selfie");
  assert.equal(say(se, "blah").last_turn.text, "Still on the selfie — hold steady.");
  const fourth = say(say(say(say(c, "blah one"), "blah two"), "blah three"), "blah four").last_turn.text;
  assert.equal(fourth, "Still on the front — hold steady.");
});

test("camera_denied parks capture stages with warn guidance, ignores others", () => {
  let c = say(startRun("nsw-dl-clean"), "ready");
  const parked = signal(c, "camera_denied");
  assert.equal(parked.stage, "awaiting_doc_front");
  assert.equal(parked.last_turn.kind, "warn");
  assert.match(parked.last_turn.text, /parked/);
  assert.match(parked.last_turn.text, /stand-in/);
  const idle = signal(startRun("nsw-dl-clean"), "camera_denied");
  assert.equal(idle.stage, "awaiting_consent");
  assert.equal(idle.last_turn.kind, "consent");
});

test("every fired Turn carries its generated panel", () => {
  let c = say(startRun("nsw-dl-clean"), "ready");
  assert.equal(c.last_turn.panel.primitive, "progress-steps");
  c = signal(c, "front_captured");
  assert.equal(c.last_turn.panel.primitive, "progress-steps");
  const held = say(c, "um, the card is bent");
  assert.equal(held.stage, "reading_front");
  const denied = say(startRun("nsw-dl-clean"), "no, stop");
  assert.equal(denied.last_turn.panel.primitive, "choice-list");
});

test("deny purges captures and aborts to idle", () => {
  const fresh = startRun("nsw-dl-clean");
  assert.equal(fresh.capturesPurged, false);
  const denied = say(fresh, "not ready");
  assert.equal(denied.last_intent, "deny");
  assert.equal(denied.capturesPurged, true);
  assert.equal(denied.stage, "idle");
  assert.equal(denied.last_turn.kind, "abort_confirm");
});

test("all 8 Turn kinds are produced somewhere in the flow", () => {
  const kinds = new Set();
  kinds.add(startRun("nsw-dl-clean").last_turn.kind); // consent
  let c = say(startRun("nsw-dl-clean"), "ready");
  kinds.add(c.last_turn.kind); // instruct
  kinds.add(say(c, "blah blah").last_turn.kind); // re-ask
  kinds.add(say(c, "say again?").last_turn.kind); // replay
  c = signal(c, "front_captured");
  kinds.add(c.last_turn.kind); // progress
  kinds.add(say(c, "no, stop").last_turn.kind); // abort_confirm
  kinds.add(coach({ screenshot: true }).kind); // warn
  let f = say(startRun("nsw-dl-clean"), "ready");
  for (const ev of ["front_captured", "frames_done", "back_captured", "frames_done", "challenge_done", "selfie_captured", "tier_done"]) {
    f = signal(f, ev);
  }
  assert.equal(f.stage, "decided");
  kinds.add(f.last_turn.kind); // result
  for (const k of ["consent", "instruct", "re-ask", "replay", "progress", "warn", "result", "abort_confirm"]) {
    assert.ok(kinds.has(k), `missing Turn kind: ${k}`);
  }
});
