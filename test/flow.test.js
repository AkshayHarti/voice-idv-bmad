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

test("coach counter >=3 closes out as re-ask/not_verified", () => {
  const t = coach({ glare: 0.9, turns: 3 });
  assert.equal(t.kind, "re-ask");
  assert.match(t.text, /not verified/);
  const w = coach({ screenshot: true });
  assert.equal(w.kind, "warn");
  assert.match(w.text, /photo of a screen/);
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
