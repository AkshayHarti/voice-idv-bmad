// Speech-out via the local TTS sidecar (Seamless v2 or MMS): /api/tts
// contract + providers flag. Pins: WAV bytes pass through as a data URL,
// every failure mode reads as audio: null (never a 4xx) so the client
// falls back to synthesis, and /api/providers reports tts reachability
// plus the ttsVoice id. Precondition: build.
import { test } from "node:test";
import assert from "node:assert/strict";
import app from "../dist/index.js";

async function post(path, body) {
  const response = await app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

/** Stub network: the MMS sidecar answers, nothing else matters. */
async function withStubMms(handler, fn) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await fn();
  } finally {
    globalThis.fetch = realFetch;
  }
}

function wavBytes(n) {
  const buf = new Uint8Array(44 + n);
  buf.set([82, 73, 70, 70], 0); // RIFF
  return buf;
}

function okAudio(bytes, model = "facebook/mms-tts-eng") {
  return async (url, opts) => {
    if (String(url).endsWith("/health")) {
      return { ok: true, json: async () => ({ ok: true, model }) };
    }
    assert.ok(String(url).endsWith("/speak"), `posts to the sidecar (got ${url})`);
    assert.equal(opts.method, "POST");
    assert.ok(JSON.parse(opts.body).text.length > 0, "text carried");
    return {
      ok: true,
      headers: new Headers({ "content-type": "audio/wav" }),
      arrayBuffer: async () => bytes.buffer,
    };
  };
}

test("tts endpoint passes sidecar WAV through as a data URL", async () => {
  await withStubMms(okAudio(wavBytes(2000)), async () => {
    const res = await post("/api/tts", { text: "Hello there." });
    assert.equal(res.status, 200);
    assert.equal(res.body.provider, "mms-local");
    assert.deepEqual(res.body.skipped, []);
    assert.ok(
      res.body.audio.startsWith("data:audio/wav;base64,"),
      "audio rides a WAV data URL",
    );
  });
});

test("tts endpoint: empty text, outage, and non-audio read as null, never 4xx", async () => {
  const empty = await post("/api/tts", { text: "   " });
  assert.equal(empty.status, 200);
  assert.equal(empty.body.audio, null);
  assert.equal(empty.body.provider, "local");

  await withStubMms(async () => { throw new Error("sidecar down"); }, async () => {
    const res = await post("/api/tts", { text: "Hi." });
    assert.equal(res.status, 200);
    assert.equal(res.body.audio, null);
    assert.ok(res.body.skipped.some((s) => s.includes("sidecar down")));
  });

  await withStubMms(
    async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      arrayBuffer: async () => new TextEncoder().encode("{}").buffer,
    }),
    async () => {
      const res = await post("/api/tts", { text: "Hi." });
      assert.equal(res.status, 200);
      assert.equal(res.body.audio, null, "non-audio reply reads as null");
    },
  );

  await withStubMms(okAudio(wavBytes(10)), async () => {
    const res = await post("/api/tts", { text: "Hi." });
    assert.equal(res.body.audio, null, "runt reply reads as null");
  });
});

test("providers flag reports local TTS reachability", async () => {
  await withStubMms(
    async (url) => {
      assert.ok(String(url).endsWith("/health"), "flag pings the health line");
      return { ok: true };
    },
    async () => {
      const res = await app.request("/api/providers");
      assert.equal(res.status, 200);
      assert.equal((await res.json()).tts, true);
    },
  );
  await withStubMms(async () => { throw new Error("down"); }, async () => {
    const res = await app.request("/api/providers");
    assert.equal((await res.json()).tts, false, "unreachable sidecar reads false");
  });
});

test("tts voice id follows the sidecar health model", async () => {
  for (const [model, voice] of [
    ["facebook/seamless-m4t-v2-large", "seamless-v2"],
    ["facebook/mms-tts-eng", "mms"],
  ]) {
    await withStubMms(okAudio(wavBytes(2000), model), async () => {
      const providers = await (await app.request("/api/providers")).json();
      assert.equal(providers.tts, true);
      assert.equal(providers.ttsVoice, voice, `health model ${model}`);
      const res = await post("/api/tts", { text: "Hello there." });
      assert.equal(res.body.provider, `${voice}-local`, "tts names its voice");
      assert.ok(res.body.audio.startsWith("data:audio/wav;base64,"));
    });
  }
  await withStubMms(async () => { throw new Error("down"); }, async () => {
    const providers = await (await app.request("/api/providers")).json();
    assert.equal(providers.ttsVoice, "none", "down sidecar reads none");
  });
});
