import { test } from "node:test";
import assert from "node:assert/strict";
import { loadFixture, expectedFailures } from "../dist/fixtures.js";
import { parseNSWDL, parseVICDL, validateLicenceNumber } from "../dist/au_dl.js";

test("NSW DL requires back card_number; sticker cross-check", () => {
  const clean = loadFixture("nsw-dl-clean");
  assert.equal(parseNSWDL(clean.front, clean.back).card_number.length > 0, true);
  assert.deepEqual(expectedFailures("nsw-dl-clean"), []);
  assert.deepEqual(expectedFailures("nsw-dl-missing-back"), ["card_number_present"]);
});

test("VIC DL requires back card_number; sticker cross-check", () => {
  const clean = loadFixture("vic-dl-clean");
  const parsed = parseVICDL(clean.front, clean.back);
  assert.equal(parsed.card_number.length > 0, true);
  assert.equal(parsed.state, "VIC");
  assert.deepEqual(expectedFailures("vic-dl-clean"), []);
  assert.deepEqual(expectedFailures("vic-dl-missing-back"), ["card_number_present"]);
  const noBack = parseVICDL(clean.front, null);
  assert.equal(noBack.card_number, "");
  assert.deepEqual(noBack.address_sticker, { present: false, parsed_address: "" });
});

test("licence formats validate per state (VIC 9-digit assumed)", () => {
  assert.equal(validateLicenceNumber("NSW", "12345678"), true);
  assert.equal(validateLicenceNumber("NSW", "123456789"), false);
  assert.equal(validateLicenceNumber("VIC", "123456789"), true);
  assert.equal(validateLicenceNumber("VIC", "12345678"), false);
});
