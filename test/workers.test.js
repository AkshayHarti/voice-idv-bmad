// Workers deploy tripwires: deployed secrets (c.env) reach providers through
// the middleware cache, and src/ stays free of node: imports (Workers-safe).
// Precondition: build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import app, { processEnv } from "../dist/index.js";

test("worker env is preferred when present", async () => {
  // META_API_KEY is a real provider key so the /api/providers body reflects
  // it in-request: a middleware reorder that filled the cache after handlers
  // would serve meta:false here while still passing a post-request check.
  const KEY = "META_API_KEY";
  const saved = process.env[KEY];
  delete process.env[KEY];
  try {
    assert.equal(processEnv()[KEY], undefined);
    const response = await app.request("/api/providers", {}, { [KEY]: "test-worker-key" });
    assert.equal(response.status, 200);
    assert.equal(
      (await response.json()).meta,
      true,
      "in-request handler sees the worker-supplied key",
    );
    assert.equal(processEnv()[KEY], "test-worker-key");
    // Preferred: the cached worker value wins over process.env.
    process.env[KEY] = "from-process";
    assert.equal(
      processEnv()[KEY],
      "test-worker-key",
      "cached c.env wins over process.env",
    );
    // Idempotent: a second capture settles to the same map.
    const again = await app.request("/api/providers", {}, { [KEY]: "test-worker-key" });
    assert.equal(again.status, 200);
    assert.equal((await again.json()).meta, true);
    assert.equal(processEnv()[KEY], "test-worker-key");
  } finally {
    if (saved === undefined) delete process.env[KEY];
    else process.env[KEY] = saved;
  }
});

test("non-string worker bindings are not cached", async () => {
  const KEY = "WORKER_NONSTRING_TRIPWIRE";
  process.env[KEY] = "from-process";
  try {
    const response = await app.request("/api/providers", {}, { [KEY]: { id: "binding-object" } });
    assert.equal(response.status, 200);
    assert.equal(
      processEnv()[KEY],
      "from-process",
      "non-string bindings never shadow process.env",
    );
  } finally {
    delete process.env[KEY];
  }
  assert.equal(processEnv()[KEY], undefined, "non-string bindings are omitted from the cache");
});

test("src/ has no node: imports (Workers compat)", () => {
  const dir = new URL("../src/", import.meta.url);
  const NODE_IMPORT = /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*)["']node:/;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".ts")) continue;
    const text = readFileSync(new URL(file, dir), "utf8");
    assert.ok(!NODE_IMPORT.test(text), `${file} imports node: (Workers-unsafe)`);
  }
});
