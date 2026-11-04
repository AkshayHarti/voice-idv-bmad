import { test } from "node:test";
import assert from "node:assert/strict";
import { loadFixture } from "../dist/fixtures.js";
import { parseTD3 } from "../dist/mrz.js";
import { parseNSWDL, parseVICDL } from "../dist/au_dl.js";
import { runChecks, decide } from "../dist/checks.js";
import { redactRef } from "../dist/redact.js";

// Test-only helper: build Measurements from a fixture id. Narrows the
// Fixture union on `kind` (au_passport carries mrz_lines, au_dl carries
// front/back). Ancillary capture signals are clean-pass defaults so the
// conjunction decision isolates document-content failures.
function measurementsFor(id) {
  const fx = loadFixture(id);
  const signals = {
    today: "2026-10-31",
    image_quality_inconclusive: false,
    portrait_present: true,
    splice_found: false,
    face: { similarity: 0.81, band: "high", certified: false },
    challenge_completed: true,
  };
  if (fx.kind === "au_passport") {
    const viz = parseTD3(fx.mrz_lines[0], fx.mrz_lines[1]);
    return {
      kind: "au_passport",
      mrz_lines: fx.mrz_lines,
      viz: {
        passportNumber: viz.passportNumber,
        dob: viz.dob,
        expiry: viz.expiry,
      },
      dl: null,
      ...signals,
    };
  }
  return {
    kind: "au_dl",
    mrz_lines: null,
    viz: null,
    dl: (fx.state === "VIC" ? parseVICDL : parseNSWDL)(fx.front, fx.back),
    ...signals,
  };
}

test("Decision is conjunction; tampered digit rejects with evidence", () => {
  const tampered = runChecks(measurementsFor("aus-passport-tampered-digit"));
  assert.equal(tampered.find(c => c.id === "check_digit_docnum").result, "fail");
  assert.match(tampered.find(c => c.id === "check_digit_docnum").evidence, /computed \d vs printed \d/);
  assert.equal(decide(tampered), "rejected");
  assert.equal(decide(runChecks(measurementsFor("aus-passport-clean"))), "verified");
  assert.equal(redactRef("licence_number", "12345642"), "••••42");
});

test("image_quality inconclusive never approves", () => {
  const m = measurementsFor("aus-passport-clean");
  m.image_quality_inconclusive = true;
  const r = runChecks(m);
  assert.equal(r.find(c => c.id === "image_quality").result, "inconclusive");
  assert.equal(decide(r), "not_verified");
});

test("mrz_viz_match fails on viz disagreement with front-vs-sticker-style evidence", () => {
  const m = measurementsFor("aus-passport-clean");
  // Alter viz passportNumber so it disagrees with its MRZ parse.
  const last = m.viz.passportNumber.slice(-1);
  m.viz.passportNumber = `${m.viz.passportNumber.slice(0, -1)}${last === "0" ? "1" : "0"}`;
  const r = runChecks(m);
  const viz = r.find(c => c.id === "mrz_viz_match");
  assert.equal(viz.result, "fail");
  assert.match(viz.evidence, /vs/);
  assert.equal(decide(r), "rejected");
});

test("out-of-charset MRZ fails closed: char_set fail, rejected, no throw", () => {
  const m = measurementsFor("aus-passport-clean");
  m.mrz_lines = [m.mrz_lines[0], `*${m.mrz_lines[1].slice(1)}`];
  let r;
  assert.doesNotThrow(() => { r = runChecks(m); });
  const charset = r.find(c => c.id === "char_set");
  assert.equal(charset.result, "fail");
  // No raw MRZ in evidence: charset + fail-closed fill-ins carry only redacted refs.
  for (const c of r) {
    assert.doesNotMatch(c.evidence, /\*/);
  }
  assert.equal(decide(r), "rejected");
});

test("NSW DL back checks: missing card fails; sticker mismatch fails", () => {
  assert.equal(decide(runChecks(measurementsFor("nsw-dl-clean"))), "verified");
  const missing = runChecks(measurementsFor("nsw-dl-missing-back"));
  assert.equal(missing.find(c => c.id === "card_number_present").result, "fail");
  assert.equal(decide(missing), "rejected");
  const m = measurementsFor("nsw-dl-clean");
  m.dl.address_sticker = {
    present: true,
    parsed_address: "9 OTHER ST MELBOURNE VIC 3000",
  };
  const r = runChecks(m);
  const sticker = r.find(c => c.id === "address_sticker_match");
  assert.equal(sticker.result, "fail");
  assert.match(sticker.evidence, /vs/);
  assert.equal(decide(r), "rejected");
});

test("VIC DL back checks: missing card fails; sticker mismatch fails", () => {
  assert.equal(decide(runChecks(measurementsFor("vic-dl-clean"))), "verified");
  const missing = runChecks(measurementsFor("vic-dl-missing-back"));
  assert.equal(missing.find(c => c.id === "card_number_present").result, "fail");
  assert.equal(missing.find(c => c.id === "address_sticker_match").result, "pass");
  assert.equal(decide(missing), "rejected");
  const m = measurementsFor("vic-dl-clean");
  m.dl.address_sticker = {
    present: true,
    parsed_address: "9 OTHER ST SYDNEY NSW 2000",
  };
  const r = runChecks(m);
  const sticker = r.find(c => c.id === "address_sticker_match");
  assert.equal(sticker.result, "fail");
  assert.match(sticker.evidence, /vs/);
  assert.equal(decide(r), "rejected");
});
