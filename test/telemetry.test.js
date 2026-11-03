import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLEAN_RUN_ARM,
  coach,
  COACHING_RETRY_LIMIT,
  detectFault,
  faultKey,
  isArmClean,
  isLockReady,
  lockReady,
} from "../dist/telemetry.js";

// Goal 2 coach loop: fault map, warn escalation, lock-readiness.
// Precondition: `npm run build` (this file imports `../dist`).

test("coach maps each fault to its fixed checklist wording", () => {
  assert.match(coach({ glare: 0.9 }).text, /Tilt the top/);
  assert.match(coach({ finger: 0.9 }).text, /thumb/);
  assert.match(coach({ occlusion: 0.9 }).text, /thumb/);
  assert.match(coach({ skew: 0.9 }).text, /Straighten/);
  assert.match(coach({ dark: 0.9 }).text, /brighter light/);
  assert.match(coach({ blur: 0.9 }).text, /brighter light/);
  assert.match(coach({ missingBack: true }).text, /flip it over/);
  for (const sample of [
    { glare: 0.9 },
    { finger: 0.9 },
    { skew: 0.9 },
    { dark: 0.9 },
    { missingBack: true },
  ]) {
    assert.equal(coach(sample).kind, "re-ask");
  }
});

test("moire and screenshot coach to the physical card as warn", () => {
  const moire = coach({ moire: 0.9 });
  assert.equal(moire.kind, "warn");
  assert.match(moire.text, /physical card/);
  const shot = coach({ screenshot: true });
  assert.equal(shot.kind, "warn");
  assert.match(shot.text, /photo of a screen/);
});

test("clean samples hold still as progress", () => {
  assert.deepEqual(coach({}), {
    kind: "progress",
    text: "Good framing. Hold still one second…",
  });
});

test("coaching variants rotate across episodes; escalation stays fixed", () => {
  // Golden glare pair: 1st episode → a, 2nd → b, 3rd still escalates.
  assert.equal(coach({ glare: 0.9, turns: 1 }).text, "Tilt the top away from the light.");
  assert.equal(coach({ glare: 0.9, turns: 2 }).text, "Ease the top back, out of the glare.");
  assert.equal(coach({ glare: 0.9, turns: 3 }).kind, "warn");
  // Every fault rotates its two surface forms without changing kind.
  for (const sample of [
    { glare: 0.9 },
    { finger: 0.9 },
    { occlusion: 0.9 },
    { skew: 0.9 },
    { dark: 0.9 },
    { blur: 0.9 },
    { missingBack: true },
    { moire: 0.9 },
    { screenshot: true },
  ]) {
    const first = coach({ ...sample, turns: 1 });
    const second = coach({ ...sample, turns: 2 });
    assert.notEqual(first.text, second.text, JSON.stringify(sample));
    assert.equal(first.kind, second.kind, JSON.stringify(sample));
    assert.equal(coach({ ...sample, turns: 3 }).kind, "warn", JSON.stringify(sample));
  }
});

test("escalation at the retry limit warns with the alternative path", () => {
  assert.equal(COACHING_RETRY_LIMIT, 3);
  for (const sample of [
    { glare: 0.9 },
    { finger: 0.9 },
    { skew: 0.9 },
    { dark: 0.9 },
    { moire: 0.9 },
    { screenshot: true },
    { missingBack: true },
  ]) {
    const escalated = coach({ ...sample, turns: 3 });
    assert.equal(escalated.kind, "warn", JSON.stringify(sample));
    assert.match(escalated.text, /type a short description/);
    assert.match(escalated.text, /parked/);
    // Below the limit the same fault still coaches (no early escalation).
    assert.notEqual(coach({ ...sample, turns: 2 }).text, escalated.text);
  }
});

test("truthy non-true screenshot/missingBack still coach and block lock", () => {
  assert.equal(coach({ screenshot: 1 }).kind, "warn");
  assert.equal(coach({ missingBack: 1 }).kind, "re-ask");
  assert.equal(isLockReady({ screenshot: 1 }), false);
  assert.equal(isLockReady({ missingBack: 1 }), false);
  assert.equal(faultKey({ screenshot: 1 }), "screenshot");
  assert.equal(faultKey({ missingBack: 1 }), "missingBack");
});

test("lock-ready predicate passes quiet frames, blocks every fault", () => {
  assert.equal(isLockReady({}), true);
  assert.equal(isLockReady({ glare: 0.1, dark: 0.2 }), true);
  for (const sample of [
    { glare: 0.9 },
    { finger: 0.9 },
    { occlusion: 0.9 },
    { skew: 0.9 },
    { dark: 0.9 },
    { blur: 0.9 },
    { moire: 0.9 },
    { screenshot: true },
    { missingBack: true },
  ]) {
    assert.equal(isLockReady(sample), false, JSON.stringify(sample));
  }
  assert.equal(lockReady({}), isLockReady({}));
  assert.equal(detectFault({ glare: 0.9 }), faultKey({ glare: 0.9 }));
});

test("arm-clean gates the run on faults and motion", () => {
  assert.equal(CLEAN_RUN_ARM, 4);
  assert.equal(isArmClean({}), true);
  assert.equal(isArmClean({ glare: 0.1, motion: 0.1 }), true);
  for (const sample of [
    { glare: 0.9 },
    { finger: 0.9 },
    { skew: 0.9 },
    { dark: 0.9 },
    { blur: 0.9 },
    { moire: 0.9 },
    { screenshot: true },
    { missingBack: true },
    { motion: 0.9 },
    { motion: 0.9, glare: 0.1 },
  ]) {
    assert.equal(isArmClean(sample), false, JSON.stringify(sample));
  }
});

test("motion never coaches, faults, or blocks manual lock", () => {
  assert.equal(faultKey({ motion: 0.9 }), null);
  assert.deepEqual(coach({ motion: 0.9 }), {
    kind: "progress",
    text: "Good framing. Hold still one second…",
  });
  assert.equal(isLockReady({ motion: 0.9 }), true);
});

test("fault keys are canonical (aliases collapse)", () => {
  assert.equal(faultKey({}), null);
  assert.equal(faultKey({ occlusion: 0.9 }), "finger");
  assert.equal(faultKey({ blur: 0.9 }), "dark");
  assert.equal(faultKey({ moire: 0.9 }), "moire");
  // Priority: screenshot beats everything, moire beats the checklist.
  assert.equal(faultKey({ screenshot: true, glare: 0.9 }), "screenshot");
  assert.equal(faultKey({ moire: 0.9, glare: 0.9 }), "moire");
  assert.equal(faultKey({ glare: 0.9, dark: 0.9 }), "glare");
});
