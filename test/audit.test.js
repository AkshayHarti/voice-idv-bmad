import { test } from "node:test";
import assert from "node:assert/strict";
import { runChecks, decide } from "../dist/checks.js";
import { buildMeasurements } from "../dist/measurements.js";
import { generateAudit } from "../dist/audit.js";
import { narrate, responseText } from "../dist/providers.js";
import { META_MODELS } from "../dist/meta-models.js";

/** Stub Spark fetcher: asserts the pinned Spark id, returns canned text. */
function stubSpark(text) {
  return async (_url, opts) => {
    const body = JSON.parse(opts.body);
    assert.equal(body.model, META_MODELS.spark);
    return { ok: true, json: async () => ({ output_text: text }) };
  };
}

const THREE = "1. A screen replay could reach the checks if moiré scoring is absent.\n2. A sharp print could satisfy portrait presence without texture analysis.\n3. A reprinted MRZ with valid digits would pass digit checks alone.";

test("audit returns 3 hypotheses and never changes the Decision", async () => {
  const checks = runChecks(buildMeasurements("aus-passport-tampered-digit"));
  const before = decide(checks);
  const audit = await generateAudit(checks, before, { env: {}, fetcher: stubSpark("hypothesis text") });
  assert.equal(audit.hypotheses.length, 3);
  assert.equal(decide(checks), before);
});

test("audit degrades to local templates when Spark fails", async () => {
  const checks = runChecks(buildMeasurements("aus-passport-clean"));
  const audit = await generateAudit(checks, decide(checks), {
    env: { META_API_KEY: "test" },
    fetcher: async () => { throw new Error("offline"); },
  });
  assert.equal(audit.provider, "local");
  assert.equal(audit.hypotheses.length, 3);
  assert.ok(audit.hypotheses.every((h) => h.split(/\s+/).length <= 40));
});

test("audit uses live Spark when the call succeeds", async () => {
  const checks = runChecks(buildMeasurements("aus-passport-tampered-digit"));
  const audit = await generateAudit(checks, decide(checks), {
    env: { META_API_KEY: "test" },
    fetcher: stubSpark(THREE),
  });
  assert.equal(audit.provider, "meta");
  assert.equal(audit.hypotheses.length, 3);
});

test("narration sends the pinned Spark model id", async () => {
  const spoken = await narrate(
    { turn: "progress", text: "Checking your details now…" },
    { env: { META_API_KEY: "test" }, fetcher: stubSpark("Checking your details now.") },
  );
  assert.equal(spoken.provider, "meta");
  assert.ok(spoken.text.length > 0);
});

/** Live Responses shape (recorded): reasoning part + message with text part. */
function stubNestedSpark(text, expectedEffort) {
  return async (_url, opts) => {
    const body = JSON.parse(opts.body);
    assert.equal(body.model, META_MODELS.spark);
    assert.equal(body.reasoning?.effort, expectedEffort);
    return {
      ok: true,
      json: async () => ({
        output: [
          { type: "reasoning", status: "completed" },
          { type: "message", role: "assistant", content: [{ type: "output_text", text }] },
        ],
      }),
    };
  };
}

test("narration parses the live nested message shape", async () => {
  const spoken = await narrate(
    { turn: "progress", text: "Checking your details now…" },
    { env: { META_API_KEY: "test" }, fetcher: stubNestedSpark("Checking your details now.", "minimal") },
  );
  assert.equal(spoken.provider, "meta");
  assert.equal(spoken.text, "Checking your details now.");
});

test("responseText keeps legacy shapes and rejects empty ones", () => {
  assert.equal(responseText({ output_text: "  Flat. " }), "Flat.");
  assert.equal(
    responseText({ choices: [{ message: { content: "Choice." } }] }),
    "Choice.",
  );
  assert.equal(responseText(null), null);
  assert.equal(responseText({ output_text: "   " }), null);
  assert.equal(responseText({ output: [] }), null);
  assert.equal(responseText({ output: [{ type: "reasoning", status: "completed" }] }), null);
  assert.equal(
    responseText({
      output: [{ type: "message", content: [{ type: "output_text", text: "  Nested. " }] }],
    }),
    "Nested.",
  );
});

test("audit parses the live nested message shape", async () => {
  const checks = runChecks(buildMeasurements("aus-passport-tampered-digit"));
  const audit = await generateAudit(checks, decide(checks), {
    env: { META_API_KEY: "test" },
    // Audit keeps default effort: hypotheses want reasoning, and the 8s
    // budget off the voice path fits it.
    fetcher: stubNestedSpark(THREE, undefined),
  });
  assert.equal(audit.provider, "meta");
  assert.equal(audit.hypotheses.length, 3);
});
