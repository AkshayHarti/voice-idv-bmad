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
