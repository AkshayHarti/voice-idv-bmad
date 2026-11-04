import { test } from "node:test";
import assert from "node:assert/strict";
import { META_MODELS, PRICING } from "../dist/meta-models.js";

test("pinned model IDs match the Rev 2 §11 roster exactly", () => {
  assert.equal(META_MODELS.spark, "muse-spark-1.3");
  assert.equal(META_MODELS.sam, "sam-3-1");
  assert.equal(META_MODELS.glimmer, "glimmer-local-core");
  assert.equal(META_MODELS.image, "muse-image-1.0");
  assert.equal(META_MODELS.wonder, "muse-wonder-1.0");
  assert.equal(META_MODELS.transcribe, "muse-voice-transcribe-1.0");
});

test("provisional pins are clearly marked (PROVISIONAL + UNVERIFIED)", () => {
  for (const key of ["image", "wonder", "transcribe"]) {
    const price = PRICING[META_MODELS[key]];
    assert.ok(price, `${key} has a PRICING entry`);
    assert.match(price.unit, /PROVISIONAL/, `${key} unit marks PROVISIONAL`);
    assert.match(price.unit, /UNVERIFIED/, `${key} unit marks UNVERIFIED`);
  }
  assert.match(PRICING[META_MODELS.glimmer].unit, /local run-weights/);
  assert.match(PRICING[META_MODELS.sam].unit, /UNVERIFIED/);
  assert.match(PRICING[META_MODELS.spark].unit, /UNVERIFIED/);
});

test("every pin has a numeric PRICING entry per the spec roster", () => {
  for (const key of Object.keys(META_MODELS)) {
    const price = PRICING[META_MODELS[key]];
    assert.ok(price, `${key} has a PRICING entry (spend lookup must not throw)`);
    assert.equal(typeof price.perCall, "number", `${key} perCall is numeric`);
    assert.ok(Number.isFinite(price.perCall), `${key} perCall is finite`);
    assert.ok(price.perCall >= 0, `${key} perCall is non-negative`);
  }
  assert.equal(PRICING[META_MODELS.spark].perCall, 0.00001);
  assert.equal(PRICING[META_MODELS.sam].perCall, 0.0025);
  assert.equal(PRICING[META_MODELS.image].perCall, 0.01);
  assert.equal(PRICING[META_MODELS.glimmer].perCall, 0);
  assert.equal(PRICING[META_MODELS.wonder].perCall, 0.009);
  assert.equal(PRICING[META_MODELS.transcribe].perCall, 0.0005);
});
