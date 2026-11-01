import { test } from "node:test";
import assert from "node:assert/strict";
import { expectedFailures, loadFixture } from "../dist/fixtures.js";
import { runChecks, decide } from "../dist/checks.js";
import { buildMeasurements } from "../dist/measurements.js";

test("Glimmer-backed fixtures keep exact ground truth", () => {
  assert.deepEqual(expectedFailures("aus-passport-glare"), []);
  assert.deepEqual(expectedFailures("nsw-dl-tilt"), []);
  assert.equal(loadFixture("aus-passport-glare").art, "glimmer");
});

test("Glimmer-backed fixtures verify clean end to end", () => {
  for (const id of ["aus-passport-glare", "nsw-dl-tilt"]) {
    assert.equal(decide(runChecks(buildMeasurements(id))), "verified");
  }
});
