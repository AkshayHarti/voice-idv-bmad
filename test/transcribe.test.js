// Voice Transcribe as primary ASR: chain contract + session endpoint.
// Pins the multipart shape to /asr/transcribe, the never-throw
// fallbacks, spend-on-success-only, and the endpoint's never-4xx
// null-text contract (silence/outage read as text: null so the client
// falls back to on-device recognition). Precondition: build.
import { test } from "node:test";
import assert from "node:assert/strict";
import app, { MAX_AUDIO_CHARS } from "../dist/index.js";
import { transcribeAudio, META_ASR_BASE } from "../dist/providers.js";
import { META_MODELS, SPEND_LEDGER } from "../dist/meta-models.js";

async function post(path, body) {
  const response = await app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

/** Stub ASR fetcher: asserts the pinned endpoint + model, returns a transcript. */
function stubAsr(transcript, seen = null) {
  return async (url, opts) => {
    assert.ok(
      String(url).startsWith(`${META_ASR_BASE}/transcribe`),
      `posts to the ASR endpoint (got ${url})`,
    );
    assert.equal(opts.method, "POST");
    assert.ok(
      String(opts.headers.authorization).startsWith("Bearer "),
      "bearer auth rides the header",
    );
    const form = opts.body;
    const settings = JSON.parse(await form.get("request").text());
    assert.equal(settings.model, META_MODELS.transcribe);
    assert.equal(settings.mode, "PUSH_TO_TALK");
    assert.equal(settings.audioEncoding, "WAV");
    const audio = form.get("audio");
    assert.ok(audio && audio.size > 0, "audio part carries bytes");
    if (seen) seen.push(String(url));
    return {
      ok: true,
      json: async () => ({ transcript, audioDurationMs: 560, turns: [] }),
    };
  };
}

/** Key the server with a stubbed network: ASR answers, nothing else matters. */
async function withKeyedAsr(transcript, fn) {
  const realFetch = globalThis.fetch;
  const realKey = process.env.META_API_KEY;
  process.env.META_API_KEY = "test";
  globalThis.fetch = stubAsr(transcript);
  try {
    return await fn();
  } finally {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.META_API_KEY;
    else process.env.META_API_KEY = realKey;
  }
}

const AUDIO = `data:audio/wav;base64,${"A".repeat(120)}`;

test("transcribeAudio: Meta-first transcription posts multipart and parses the transcript", async () => {
  const before = SPEND_LEDGER.length;
  const seen = [];
  const res = await transcribeAudio(
    { audioBase64: "A".repeat(120), sessionId: "run-1" },
    { env: { META_API_KEY: "test" }, fetcher: stubAsr("  I consent ", seen) },
  );
  assert.equal(res.provider, "meta");
  assert.deepEqual(res.skipped, []);
  assert.equal(res.text, "I consent", "transcript trimmed");
  assert.ok(seen[0].includes("sessionId=run-1"), "run id correlates the ASR call");
  assert.equal(SPEND_LEDGER.length, before + 1, "spend logged after success");
  assert.equal(SPEND_LEDGER[SPEND_LEDGER.length - 1].model, META_MODELS.transcribe);
});

test("transcribeAudio: unkeyed, audioless, failed, and empty all fall back, never throw", async () => {
  const before = SPEND_LEDGER.length;
  const unkeyed = await transcribeAudio({ audioBase64: "AAA" }, { env: {} });
  assert.equal(unkeyed.provider, "local");
  assert.equal(unkeyed.text, null);
  assert.deepEqual(unkeyed.skipped, ["meta: not configured"]);

  const noAudio = await transcribeAudio({}, { env: { META_API_KEY: "t" } });
  assert.equal(noAudio.text, null);
  assert.ok(noAudio.skipped[0].startsWith("meta: no audio"));

  const failing = async () => { throw new Error("boom"); };
  const failed = await transcribeAudio(
    { audioBase64: "AAA" },
    { env: { META_API_KEY: "t" }, fetcher: failing },
  );
  assert.equal(failed.provider, "local");
  assert.equal(failed.text, null);
  assert.ok(failed.skipped.some((s) => s.includes("boom")), "skipped records why");

  for (const transcript of ["", "   "]) {
    const empty = await transcribeAudio(
      { audioBase64: "AAA" },
      { env: { META_API_KEY: "t" }, fetcher: stubAsr(transcript) },
    );
    assert.equal(empty.text, null, `null text for ${JSON.stringify(transcript)}`);
    assert.ok(empty.skipped.some((s) => s.includes("no transcript")), "skip recorded");
  }
  assert.equal(SPEND_LEDGER.length, before, "no spend logged without success");
});

test("endpoint: unknown session 404s; garbage and oversize audio read as null, never 4xx", async () => {
  const missing = await post("/api/session/nope/transcribe", { audio: AUDIO });
  assert.equal(missing.status, 404);

  const created = await post("/api/session", { fixtureId: "nsw-dl-clean" });
  const id = created.body.sessionId;
  for (const audio of [undefined, "not-a-data-url", "data:audio/mp3;base64," + "A".repeat(120)]) {
    const res = await post(`/api/session/${id}/transcribe`, { audio });
    assert.equal(res.status, 200);
    assert.equal(res.body.text, null);
    assert.equal(res.body.provider, "local");
  }
  const big = await post(`/api/session/${id}/transcribe`, {
    audio: `data:audio/wav;base64,${"A".repeat(MAX_AUDIO_CHARS)}`,
  });
  assert.equal(big.status, 200);
  assert.equal(big.body.text, null, "oversize audio reads as null, never 413");
});

test("endpoint: keyed run transcribes through the stubbed ASR call", async () => {
  await withKeyedAsr("lock now", async () => {
    const created = await post("/api/session", { fixtureId: "nsw-dl-clean" });
    const id = created.body.sessionId;
    const res = await post(`/api/session/${id}/transcribe`, { audio: AUDIO });
    assert.equal(res.status, 200);
    assert.equal(res.body.provider, "meta");
    assert.equal(res.body.text, "lock now");
  });
});
