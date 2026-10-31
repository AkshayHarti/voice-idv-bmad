import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyDVS } from "../dist/dvs.js";
import { tier } from "../dist/fraud.js";

test("stub DVS mirrors fixture truth; tamper hard-flags silently", () => {
  assert.equal(verifyDVS({fixture: "aus-passport-clean"}).match, true);
  assert.equal(verifyDVS({fixture: "aus-passport-tampered-digit"}).match, false);
  assert.equal(tier("rejected", {match: false}, ["mrz_mismatch"]).tier, "hard_flag");
  assert.equal(tier("verified", {match: true}, []).tier, "auto_approve");
});

test("screenshot replay hard-flags with generic user string", () => {
  const r = tier("rejected", { match: false }, ["screen_replay"]);
  assert.equal(r.tier, "hard_flag");
  assert.match(r.userMessage, /manual review/);
  assert.doesNotMatch(r.userMessage, /screen_replay|mrz_mismatch|dvs_mismatch/);
  assert.ok(r.queue.reasons.includes("screen_replay"));
});
