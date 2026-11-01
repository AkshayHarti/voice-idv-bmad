import { test } from "node:test";
import assert from "node:assert/strict";
import { segment } from "../dist/providers.js";
import { META_MODELS } from "../dist/meta-models.js";

/** Stub Meta fetcher: asserts the pinned SAM id, returns quads (or none). */
function stubSam(labels, { regions = true } = {}) {
  return async (_url, opts) => {
    const body = JSON.parse(opts.body);
    assert.equal(body.model, META_MODELS.sam);
    return {
      ok: true,
      json: async () =>
        regions
          ? { regions: labels.map((label) => ({ label, quad: [10, 20, 300, 400] })) }
          : { regions: [] },
    };
  };
}

test("SAM branch returns regions on image, falls back without", async () => {
  const live = await segment(
    { label: "document quad", imageBase64: "iVBOR…" },
    [],
    { env: { META_API_KEY: "test" }, fetcher: stubSam(["document quad"]) },
  );
  assert.equal(live.provider, "meta");
  assert.equal(live.regions[0].label, "document quad");
  const off = await segment(
    { label: "document quad" },
    [{ label: "document quad", quad: [0, 0, 1000, 1000] }],
    { env: {} },
  );
  assert.equal(off.provider, "local");
});

test("SAM returning no regions falls back to local with skipped recorded", async () => {
  const res = await segment(
    { label: "document quad", imageBase64: "iVBOR…" },
    [{ label: "document quad", quad: [0, 0, 1000, 1000] }],
    { env: { META_API_KEY: "test" }, fetcher: stubSam(["document quad"], { regions: false }) },
  );
  assert.equal(res.provider, "local");
  assert.ok(res.skipped.some((s) => s.startsWith("meta:")));
  assert.deepEqual(res.regions, [{ label: "document quad", quad: [0, 0, 1000, 1000] }]);
});
