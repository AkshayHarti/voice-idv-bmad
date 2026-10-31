import { test } from "node:test";
import assert from "node:assert/strict";
import { loadFixture, expectedFailures } from "../dist/fixtures.js";

test("clean passport fixture passes line_count/char_set/check digits", () => {
  const fx = loadFixture("aus-passport-clean");
  assert.equal(fx.mrz_lines[0].length, 44);
  assert.equal(fx.mrz_lines[1].length, 44);
  assert.match(fx.mrz_lines.join(""), /^[A-Z0-9<]+$/);
  assert.deepEqual(expectedFailures("aus-passport-clean"), []);
  assert.deepEqual(expectedFailures("aus-passport-tampered-digit"), ["check_digit_docnum"]);
});
