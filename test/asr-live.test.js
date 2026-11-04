// Realtime speech-in relay: handshake, frame pumping, turn fan-out.
// Pins the Meta protocol shape, the speechComplete-only trigger rule,
// pre-open buffering, and never-throw error paths — with fake sockets
// plus one real-ws integration run. Precondition: build.
import { test } from "node:test";
import assert from "node:assert/strict";
import WebSocket, { WebSocketServer } from "ws";
import { attachRelay, META_REALTIME_URL } from "../dist/asr_live.js";
import app, { attachAsrLive } from "../dist/index.js";

const tick = () => new Promise((r) => setTimeout(r, 20));

/** In-memory socket twin: scriptable, inspectable, never a network call. */
function fakeSocket() {
  const handlers = {};
  return {
    sent: [],
    closed: null,
    readyState: 1,
    send(data) {
      this.sent.push(data);
    },
    close(code, reason) {
      this.closed = { code, reason };
    },
    on(event, cb) {
      (handlers[event] ??= []).push(cb);
    },
    emit(event, ...args) {
      for (const cb of handlers[event] ?? []) cb(...args);
    },
  };
}

function attach(browser, meta, utterance) {
  attachRelay(browser, {
    sessionId: "run-1",
    metaKey: "test",
    utterance: utterance ?? (async (text) => ({ echo: text })),
    openMeta: () => meta,
    idleMs: 0,
  });
}

test("relay handshakes Meta and flushes pre-open audio in order", () => {
  const browser = fakeSocket();
  const meta = fakeSocket();
  attach(browser, meta);
  browser.emit("message", new Uint8Array([1, 2, 3]));
  assert.equal(meta.sent.length, 0, "nothing sent before Meta opens");
  meta.emit("open");
  assert.equal(meta.sent.length, 2, "handshake then flushed frame");
  const handshake = JSON.parse(meta.sent[0]);
  assert.equal(handshake.model, "muse-voice-transcribe-1.0");
  assert.equal(handshake.mode, "ENDPOINTING");
  assert.equal(handshake.audioEncoding, "PCM_24KHZ");
  assert.equal(handshake.partialMode, "CUMULATIVE");
  assert.equal(handshake.authorization.accessToken, "Bearer test");
  assert.ok(meta.sent[1] instanceof Uint8Array, "buffered PCM flushed after the handshake");
  // Post-open audio streams straight through.
  browser.emit("message", new Uint8Array([4]));
  assert.equal(meta.sent.length, 3);
});

test("relay forwards captions and cues; speechComplete alone drives turns", async () => {
  const browser = fakeSocket();
  const meta = fakeSocket();
  const uttered = [];
  attach(browser, meta, async (text) => {
    uttered.push(text);
    return { stage: "comparing" };
  });
  meta.emit("open");
  meta.emit("message", JSON.stringify({ transcript: "I con", final: false }));
  meta.emit("message", JSON.stringify({ type: "transcript", transcript: "I con", final: false }));
  meta.emit("message", JSON.stringify({ type: "speechStart", turnId: 0 }));
  meta.emit("message", JSON.stringify({ type: "speechEnd" }));
  meta.emit("message", JSON.stringify({ type: "transcript", transcript: "I consent", final: true }));
  assert.deepEqual(uttered, [], "typeless ack, partials, cues, and finals never drive turns");
  meta.emit(
    "message",
    JSON.stringify({ type: "speechComplete", turnId: 0, transcript: "  I consent " }),
  );
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(uttered, ["I consent"], "turn text trimmed into the utterance");
  const frames = browser.sent.map((s) => JSON.parse(s));
  assert.ok(frames.some((f) => f.kind === "partial" && f.text === "I con"), "partial forwarded");
  assert.ok(frames.some((f) => f.kind === "speechStart"), "barge-in cue forwarded");
  assert.ok(frames.some((f) => f.kind === "speechEnd"), "end cue forwarded");
  assert.deepEqual(
    frames.find((f) => f.kind === "step").step,
    { stage: "comparing" },
    "served step rides a step frame",
  );
  meta.emit("message", JSON.stringify({ type: "speechComplete", turnId: 1, transcript: "   " }));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(uttered.length, 1, "empty turns never drive");
});

test("relay never throws out: utterance failures and socket deaths stay framed", async () => {
  const browser = fakeSocket();
  const meta = fakeSocket();
  attach(browser, meta, async () => { throw new Error("say broke"); });
  meta.emit("open");
  meta.emit("message", JSON.stringify({ type: "speechComplete", turnId: 0, transcript: "hi" }));
  await new Promise((r) => setTimeout(r, 20));
  const frames = browser.sent.map((s) => JSON.parse(s));
  assert.ok(frames.some((f) => f.kind === "error" && f.message === "say broke"));
  assert.equal(browser.closed, null, "relay survives a failed turn");
  // Malformed browser input is ignored, not fatal.
  browser.emit("message", "{nope");
  browser.emit("message", new Uint8Array([]));
  assert.equal(browser.closed, null);
  // Either side dying ends the relay cleanly.
  meta.emit("close");
  assert.deepEqual(browser.closed, { code: 1000, reason: "meta closed" });
  assert.deepEqual(meta.closed, { code: 1000, reason: "meta closed" });
});

test("relay forwards endStream and reaps idle relays", async () => {
  const browser = fakeSocket();
  const meta = fakeSocket();
  let tick = 1000;
  attachRelay(browser, {
    sessionId: "run-1",
    metaKey: "test",
    utterance: async (text) => ({ echo: text }),
    openMeta: () => meta,
    idleMs: 40,
    now: () => tick,
  });
  meta.emit("open");
  browser.emit("message", JSON.stringify({ type: "endStream" }));
  assert.equal(JSON.parse(meta.sent[meta.sent.length - 1]).type, "endStream");
  tick += 1000;
  await new Promise((r) => setTimeout(r, 80));
  assert.ok(browser.closed !== null, "idle relay reaps itself");
});

test("commands mode swallows chatter, acts on gated turns", async () => {
  const browser = fakeSocket();
  const meta = fakeSocket();
  const uttered = [];
  attachRelay(browser, {
    sessionId: "run-1",
    metaKey: "test",
    utterance: async (text) => {
      uttered.push(text);
      return { ok: true };
    },
    filter: (text) => /lock now/i.test(text) || text === "wait",
    openMeta: () => meta,
    idleMs: 0,
  });
  meta.emit("open");
  browser.emit("message", JSON.stringify({ type: "mode", mode: "commands" }));
  meta.emit("message", JSON.stringify({ type: "speechComplete", turnId: 0, transcript: "nice weather" }));
  await tick();
  assert.deepEqual(uttered, [], "chatter swallowed in commands mode");
  meta.emit("message", JSON.stringify({ type: "speechComplete", turnId: 1, transcript: "lock now" }));
  await tick();
  assert.deepEqual(uttered, ["lock now"]);
  browser.emit("message", JSON.stringify({ type: "mode", mode: "all" }));
  meta.emit("message", JSON.stringify({ type: "speechComplete", turnId: 2, transcript: "nice weather" }));
  await tick();
  assert.deepEqual(uttered, ["lock now", "nice weather"], "all-mode drives everything");
});

test("attach wires the lock/wait gate for commands mode", async () => {
  const realKey = process.env.META_API_KEY;
  const realFetch = globalThis.fetch;
  process.env.META_API_KEY = "test";
  // Keyed narration would dial out; fail fast so turns stay local-only.
  globalThis.fetch = async () => { throw new Error("stubbed network"); };
  try {
    const created = await app.request("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fixtureId: "nsw-dl-clean" }),
    });
    const id = (await created.json()).sessionId;
    const browser = fakeSocket();
    let metaSock = null;
    attachAsrLive(browser, id, {
      openMeta: () => (metaSock = fakeSocket()),
    });
    metaSock.emit("open");
    browser.emit("message", JSON.stringify({ type: "mode", mode: "commands" }));
    metaSock.emit(
      "message",
      JSON.stringify({ type: "speechComplete", turnId: 0, transcript: "nice weather today" }),
    );
    await tick();
    assert.ok(
      !browser.sent.some((s) => JSON.parse(s).kind === "step"),
      "chatter swallowed before say()",
    );
    metaSock.emit(
      "message",
      JSON.stringify({ type: "speechComplete", turnId: 1, transcript: "hold on" }),
    );
    await tick();
    const step = browser.sent.map((s) => JSON.parse(s)).find((f) => f.kind === "step");
    assert.ok(step, "wait phrasing drives a turn");
    assert.equal(step.step.intent, "wait", "gated turn carries its intent");
    assert.equal(step.step.stage, "awaiting_consent", "wait holds the stage");
  } finally {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.META_API_KEY;
    else process.env.META_API_KEY = realKey;
  }
});

test("attach rejects unknown sessions without dialing Meta", () => {
  const browser = fakeSocket();
  let dialed = false;
  attachAsrLive(browser, "no-such-session", {
    openMeta: () => {
      dialed = true;
      return fakeSocket();
    },
  });
  assert.equal(dialed, false, "no Meta socket for unknown runs");
  assert.deepEqual(browser.closed, { code: 4404, reason: "unknown session" });
});

test("integration: real sockets relay PCM out and served steps back", async () => {
  const seen = { handshake: null, pcmBytes: 0 };
  const fakeMeta = new WebSocketServer({ port: 0 });
  await new Promise((r) => fakeMeta.on("listening", r));
  const metaPort = fakeMeta.address().port;
  fakeMeta.on("connection", (sock) => {
    sock.on("message", (data, isBinary) => {
      if (isBinary) {
        seen.pcmBytes += data.length;
        return;
      }
      const msg = JSON.parse(String(data));
      if (msg.model) {
        seen.handshake = msg;
        sock.send(JSON.stringify({ sessionId: "fake-1" }));
        sock.send(JSON.stringify({ type: "transcript", transcript: "I con", final: false }));
        sock.send(JSON.stringify({ type: "speechComplete", turnId: 0, transcript: "I consent" }));
      }
    });
  });

  const appSide = new WebSocketServer({ port: 0 });
  await new Promise((r) => appSide.on("listening", r));
  const appPort = appSide.address().port;
  const got = {};
  appSide.on("connection", (sock) => {
    attachRelay(
      sock,
      {
        sessionId: "run-9",
        metaKey: "test",
        metaUrl: `ws://127.0.0.1:${metaPort}`,
        utterance: async (text) => ({ stage: "awaiting_doc_front", heard: text }),
        idleMs: 0,
      },
    );
  });

  const client = new WebSocket(`ws://127.0.0.1:${appPort}`);
  await new Promise((r) => client.on("open", r));
  client.send(new Uint8Array([9, 9, 9, 9]));
  const frames = [];
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no step frame")), 8000);
    client.on("message", (data) => {
      const frame = JSON.parse(String(data));
      frames.push(frame);
      if (frame.kind === "step") {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  assert.equal(seen.handshake.model, "muse-voice-transcribe-1.0");
  assert.equal(seen.handshake.mode, "ENDPOINTING");
  assert.ok(seen.pcmBytes >= 4, "browser PCM reaches Meta");
  assert.ok(frames.some((f) => f.kind === "partial"), "partials flow back");
  assert.deepEqual(frames.find((f) => f.kind === "step").step.heard, "I consent");
  assert.ok(META_REALTIME_URL.startsWith("wss://api.meta.ai/"), "prod URL pinned");

  client.close();
  appSide.close();
  fakeMeta.close();
  await new Promise((r) => setTimeout(r, 100));
});
