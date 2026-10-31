import { test } from "node:test";
import assert from "node:assert/strict";
import { loadFixture, expectedFailures } from "../dist/fixtures.js";
import { parseNSWDL } from "../dist/au_dl.js";

test("NSW DL requires back card_number; sticker cross-check", () => {
  const clean = loadFixture("nsw-dl-clean");
  assert.equal(parseNSWDL(clean.front, clean.back).card_number.length > 0, true);
  assert.deepEqual(expectedFailures("nsw-dl-clean"), []);
  assert.deepEqual(expectedFailures("nsw-dl-missing-back"), ["card_number_present"]);
});
