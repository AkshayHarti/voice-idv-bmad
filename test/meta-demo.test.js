import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateFixture, evaluateFixtureMeta } from "../dist/index.js";
import { META_MODELS } from "../dist/meta-models.js";

const THREE =
  "1. A screen replay could reach the checks if moiré scoring is absent.\n" +
  "2. A sharp print could satisfy portrait presence without texture analysis.\n" +
  "3. A reprinted MRZ with valid digits would pass digit checks alone.";

/** Route stubbed Meta calls by model + prompt shape (no network). */
function stubMeta() {
  return async (_url, opts) => {
    const body = JSON.parse(opts.body);
    if (body.model === META_MODELS.sam) {
      return { ok: true, json: async () => ({ regions: [] }) };
    }
    const text = String(body.input ?? "").includes("attack hypotheses")
      ? THREE
      : "Decision spoken.";
    return { ok: true, json: async () => ({ output_text: text }) };
  };
}

/** Live --meta run. Skipped without a key; degraded paths still decide. */
async function runFixtureMeta(fixtureId) {
  return evaluateFixtureMeta(fixtureId, { env: process.env });
}

const LIVE = Boolean(process.env.META_API_KEY);

test("live meta run verifies clean and rejects tampered", { skip: !LIVE }, async () => {
  const clean = await runFixtureMeta("aus-passport-clean");
  const tamp = await runFixtureMeta("aus-passport-tampered-digit");
  assert.equal(clean.decision, "verified");
  assert.equal(tamp.decision, "rejected");
  assert.equal(tamp.audit.hypotheses.length, 3);
  assert.equal(clean.spend.total <= 150, true);
  assert.equal(clean.decision, evaluateFixture("aus-passport-clean").decision);
  assert.equal(tamp.decision, evaluateFixture("aus-passport-tampered-digit").decision);
});

test("meta path decides identically to no-meta on every fixture", async () => {
  for (const id of [
    "aus-passport-clean",
    "aus-passport-tampered-digit",
    "nsw-dl-clean",
    "nsw-dl-missing-back",
    "aus-passport-glare",
    "nsw-dl-tilt",
    "vic-dl-clean",
    "vic-dl-missing-back",
  ]) {
    const meta = await evaluateFixtureMeta(
      id,
      { env: { META_API_KEY: "test" }, fetcher: stubMeta() },
    );
    assert.equal(meta.decision, evaluateFixture(id).decision, `parity on ${id}`);
    assert.equal(meta.audit.hypotheses.length, 3, `audit on ${id}`);
  }
  const tamp = await evaluateFixtureMeta(
    "aus-passport-tampered-digit",
    { env: { META_API_KEY: "test" }, fetcher: stubMeta() },
  );
  assert.equal(tamp.audit.provider, "meta");
  assert.equal(tamp.meta.narration.provider, "meta");
});
