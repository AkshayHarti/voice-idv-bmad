import { test } from "node:test";
import assert from "node:assert/strict";
import { META_MODELS, PRICING } from "../dist/meta-models.js";

test("pinned model IDs and request shapes", () => {
  assert.match(META_MODELS.spark, /muse-spark/i);
  assert.match(META_MODELS.sam, /^sam-?3/i);
  assert.match(META_MODELS.glimmer, /glimmer/i);
  assert.equal(typeof PRICING[META_MODELS.spark].perCall, "number");
});
