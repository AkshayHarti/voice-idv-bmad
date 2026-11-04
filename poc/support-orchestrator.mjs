#!/usr/bin/env node
// POC: realtime voice support loop on Meta Model API.
//
//   mic/file PCM ─▶ Transcribe realtime WS ─▶ speechComplete turns ─▶
//   LLM (streaming) ─▶ sentence buffer ─▶ TTS (macOS say / log-only)
//
// Usage:
//   node poc/support-orchestrator.mjs <input.pcm> [--no-audio] [--keywords a,b,c]
//
// Input is raw 16-bit LE mono PCM @ 24 kHz, streamed paced-realtime in
// ~80 ms frames (see poc/README.md for the recording recipe). No npm
// dependencies: global WebSocket + fetch (Node 22+).
//
// Protocol: https://dev.meta.ai/docs/api-reference/voice/realtime
// Key: MODEL_API_KEY, META_API_KEY, or the repo .env META_API_KEY.
// The key is never printed.
import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";

const WS_URL = "wss://api.meta.ai/v1/asr/realtime";
const CHAT_URL = "https://api.meta.ai/v1/chat/completions";
const RESPONSES_URL = "https://api.meta.ai/v1/responses";
const FRAME_BYTES = 3840; // 80 ms of 16-bit mono PCM @ 24 kHz
const FRAME_MS = 80;
const SYSTEM_PROMPT =
  "You are a helpful, concise Australian customer support agent. " +
  "Keep answers very short and conversational.";

function loadKey() {
  if (process.env.MODEL_API_KEY) return process.env.MODEL_API_KEY;
  if (process.env.META_API_KEY) return process.env.META_API_KEY;
  try {
    const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
    const m = env.match(/^META_API_KEY=(.*)$/m);
    if (m && m[1].trim()) return m[1].trim();
  } catch { /* no repo .env */ }
  return null;
}

const args = process.argv.slice(2);
const pcmPath = args.find((a) => !a.startsWith("--"));
const noAudio = args.includes("--no-audio");
const keywordsFlag = args.find((a) => a.startsWith("--keywords"));
const keywords = keywordsFlag
  ? keywordsFlag.slice("--keywords".length + 1).split(",").map((s) => s.trim()).filter(Boolean)
  : [];
if (!pcmPath) {
  console.error("Usage: node poc/support-orchestrator.mjs <input.pcm> [--no-audio] [--keywords a,b]");
  process.exit(2);
}
const API_KEY = loadKey();
if (!API_KEY) {
  console.error("Set MODEL_API_KEY (or META_API_KEY) to run the agent pipeline.");
  process.exit(1);
}
let pcm;
try {
  pcm = readFileSync(pcmPath);
} catch (err) {
  console.error(`Cannot read ${pcmPath}: ${err.message}`);
  process.exit(1);
}
console.log(`Input: ${pcmPath} (${pcm.length} bytes ≈ ${(pcm.length / 48000).toFixed(1)} s @ 24 kHz)`);

// --- TTS: serial queue over macOS `say`, killed on barge-in. ---------------
let sayChain = Promise.resolve();
let sayChild = null;
let ttsMuted = false;
function speak(sentence) {
  if (!sentence) return;
  console.log(`🔊 [Synthesizing Audio]: "${sentence}"`);
  if (noAudio) return;
  sayChain = sayChain.then(
    () =>
      new Promise((resolve) => {
        if (ttsMuted) return resolve();
        const child = execFile("say", [sentence], () => {
          if (sayChild === child) sayChild = null;
          resolve();
        });
        sayChild = child;
      }),
  );
}
function bargeIn() {
  ttsMuted = true;
  sayChain = Promise.resolve();
  if (sayChild) {
    try { sayChild.kill(); } catch { /* already gone */ }
    sayChild = null;
  }
  // Unmute on the next assistant turn (see handleTurn).
}

// --- LLM: streaming chat completions, sentence-buffered to TTS. ------------
const LLM_MODEL = process.env.VOICE_POC_LLM_MODEL ?? "muse-spark-1.3";
const sentenceTail = new Map(); // turnId -> partial sentence buffer

function flushSentences(turnId, text, final) {
  const buf = (sentenceTail.get(turnId) ?? "") + text;
  // Complete sentences end with . ! ? followed by space+capital (or end).
  const parts = buf.split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/);
  const hold = final ? "" : (parts.pop() ?? "");
  for (const s of parts) if (s.trim()) speak(s.trim());
  if (final && hold.trim()) speak(hold.trim());
  if (final) sentenceTail.delete(turnId);
  else sentenceTail.set(turnId, hold);
}

async function queryLlamaBrain(turnId, userQuery) {
  ttsMuted = false;
  const t0 = Date.now();
  console.log("🧠 Querying LLM core...");
  const body = {
    model: LLM_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userQuery },
    ],
    stream: true,
    // Headroom matters: Spark reasons first (~118 reasoning tokens on a
    // short turn) and max_tokens covers reasoning + output — 120 starves
    // the answer to nothing (finish_reason length, content null).
    max_tokens: 1000,
    reasoning_effort: "minimal",
  };
  let res;
  try {
    res = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error(`LLM unreachable: ${err.message}`);
    return;
  }
  if (!res.ok || !res.body) {
    console.error(`LLM gateway error: ${res.status} — falling back to /responses`);
    return queryResponsesFallback(turnId, userQuery);
  }
  // SSE: "data: {...}" frames, "[DONE]" terminator.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let firstTokenAt = 0;
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const frames = buf.split("\n\n");
      buf = frames.pop() ?? "";
      for (const frame of frames) {
        for (const line of frame.split("\n")) {
          const data = line.startsWith("data:") ? line.slice(5).trim() : "";
          if (!data || data === "[DONE]") continue;
          let delta = "";
          try {
            delta = JSON.parse(data)?.choices?.[0]?.delta?.content ?? "";
          } catch { continue; }
          if (delta) {
            if (!firstTokenAt) {
              firstTokenAt = Date.now();
              console.log(`   TTFT: ${firstTokenAt - t0} ms`);
            }
            process.stdout.write(delta);
            flushSentences(turnId, delta, false);
          }
        }
      }
    }
    process.stdout.write("\n");
    flushSentences(turnId, "", true);
    await sayChain;
  } catch (err) {
    console.error(`\nLLM stream failure: ${err.message}`);
  }
}

/** Non-streaming fallback on the verified /responses shape. */
async function queryResponsesFallback(turnId, userQuery) {
  try {
    const res = await fetch(RESPONSES_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        reasoning: { effort: "minimal" },
        input:
          `You are a helpful, concise Australian customer support agent. ` +
          `Reply with one short spoken answer, at most 30 words, no markdown. ` +
          `Customer: ${userQuery}`,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const payload = await res.json();
    const text =
      payload?.output_text ??
      payload?.choices?.[0]?.message?.content ??
      "(no text)";
    console.log(`   ${String(text).trim()}`);
    flushSentences(turnId, String(text).trim(), true);
    await sayChain;
  } catch (err) {
    console.error(`Responses fallback failure: ${err.message}`);
  }
}

// --- Transcribe realtime session. ------------------------------------------
const sessionId = `support-session-${Date.now()}`;
const ws = new WebSocket(`${WS_URL}?sessionId=${sessionId}`);
const tStart = Date.now();
let firstPartialAt = 0;
let acked = false;

function ms() {
  return Date.now() - tStart;
}

ws.onopen = () => {
  console.log("✔ Connected to Meta Muse Voice stream. Sending handshake...");
  ws.send(
    JSON.stringify({
      authorization: { accessToken: `Bearer ${API_KEY}` },
      audioEncoding: "PCM_24KHZ",
      model: "muse-voice-transcribe-1.0",
      mode: "ENDPOINTING",
      partialMode: "CUMULATIVE",
      emitAudioProgress: false,
      languageBias: ["English"],
      ...(keywords.length ? { keywords } : {}),
    }),
  );
};

ws.onmessage = (event) => {
  let msg;
  try {
    msg = JSON.parse(String(event.data));
  } catch {
    return; // binary frames never arrive server→client; ignore
  }
  if (!msg.type) {
    acked = true;
    console.log(`✔ Handshake accepted (+${ms()} ms, session ${msg.sessionId ?? "?"})`);
    pumpAudio();
    return;
  }
  switch (msg.type) {
    case "transcript":
      if (msg.final === true) {
        process.stdout.write(`\n✔ Final: "${msg.transcript}"\n`);
      } else {
        if (!firstPartialAt) {
          firstPartialAt = Date.now();
          console.log(`   first partial at +${ms()} ms`);
        }
        process.stdout.write(`\rCustomer speaking: "${msg.transcript ?? ""}"`);
      }
      break;
    case "speechStart":
      console.log(`\n🎙 speechStart (+${ms()} ms, turn ${msg.turnId}) — barge in, TTS cut`);
      bargeIn();
      break;
    case "speechEnd":
      console.log(`\n⏸ speechEnd (+${ms()} ms)`);
      break;
    case "speechComplete":
      console.log(`\n\n[Turn ${msg.turnId} complete]: "${msg.transcript}"`);
      void queryLlamaBrain(msg.turnId, msg.transcript);
      break;
    case "speaker":
      console.log(`\n👤 speaker: ${msg.label ?? msg.speaker ?? "?"}`);
      break;
    case "audioProgress":
      break; // disabled in the handshake; ignore if emitted anyway
    case "error":
      console.error(`\nASR error: ${msg.message ?? JSON.stringify(msg)}`);
      break;
    default:
      console.log(`\n(unknown event type: ${msg.type})`);
  }
};

ws.onerror = (event) => {
  console.error(
    "Muse WebSocket error:",
    event?.message || event?.error?.message || "(no detail — proxies/VPNs often break WS upgrades)",
  );
};

ws.onclose = async (event) => {
  console.log(`\n■ Stream closed (code ${event.code}${event.reason ? `: ${event.reason}` : ""})`);
  if (event.code === 1006 && !acked) {
    console.error("   Hint: 1006 before the handshake ack usually means the WS upgrade never completed —");
    console.error("   check direct egress to wss://api.meta.ai (no MITM proxy), then retry.");
  }
  await sayChain;
  setTimeout(() => process.exit(acked ? 0 : 1), 500);
};

// Paced realtime pump: 80 ms frames, then half-close and await the flush.
function pumpAudio() {
  let offset = 0;
  const timer = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) {
      clearInterval(timer);
      return;
    }
    if (ws.bufferedAmount > FRAME_BYTES * 8) return; // let the socket drain
    if (offset >= pcm.length) {
      clearInterval(timer);
      console.log(`■ Audio done (${((Date.now() - tStart) / 1000).toFixed(1)} s). Sending endStream...`);
      try {
        ws.send(JSON.stringify({ type: "endStream" }));
      } catch { /* closing */ }
      return;
    }
    ws.send(pcm.subarray(offset, offset + FRAME_BYTES));
    offset += FRAME_BYTES;
  }, FRAME_MS);
}

setTimeout(() => {
  console.error("Timed out waiting for the stream to close.");
  process.exit(1);
}, 180000).unref?.();
