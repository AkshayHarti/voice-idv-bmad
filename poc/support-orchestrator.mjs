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
// ~80 ms frames (see poc/README.md for the recording recipe). Needs
// `npm install` (ws client) + fetch (Node 22+).
//
// Sockets: the `ws` package, deliberately — Node's built-in WebSocket
// attempts the upgrade over HTTP/2 (extended CONNECT, experimental) and
// the handshake dies with 1006; `ws` speaks plain HTTP/1.1 Upgrade.
//
// Protocol: https://dev.meta.ai/docs/api-reference/voice/realtime
// Key: MODEL_API_KEY, META_API_KEY, or the repo .env META_API_KEY.
// The key is never printed.
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import WebSocket from "ws";

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

// --- TTS: local Meta MMS-TTS per sentence, macOS `say` fallback. ---------
// Meta has no TTS on Model API, so the speaking leg is Meta open-weight
// MMS running on loopback (poc/mms_tts_server.py, spawned below). Serial
// queue; barge-in kills playback + clears it.
const TTS_BASE = process.env.VOICE_POC_TTS_URL ?? "http://127.0.0.1:8765";
let ttsChild = null;

/** The TTS server must be up before the first turn can speak. Spawns it. */
async function ensureTtsServer() {
  for (let i = 0; i < 180; i++) {
    try {
      const res = await fetch(`${TTS_BASE}/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        if (i > 0) console.log("✔ Local Meta TTS is up.");
        return true;
      }
    } catch { /* not up yet */ }
    if (i === 0) {
      console.log("Starting local Meta TTS server (first run downloads ~400 MB)...");
      const { spawn } = await import("node:child_process");
      ttsChild = spawn(
        "poc/.venv/bin/python",
        ["poc/mms_tts_server.py", "--port", String(new URL(TTS_BASE).port || 8765)],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      ttsChild.stdout?.on("data", (d) => process.stdout.write(`[tts-server] ${d}`));
      ttsChild.stderr?.on("data", (d) => process.stdout.write(`[tts-server] ${d}`));
      ttsChild.on("exit", (code) => { ttsChild = null; });
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.error("Local TTS never came up — falling back to `say` for this run.");
  return false;
}
let ttsUp = false;
let audioChain = Promise.resolve();
let audioChild = null;
let ttsMuted = false;
let ttsSeq = 0;

/** One sentence to spoken WAV bytes via local MMS (null on failure). Never throws. */
async function synthesizeLocal(sentence) {
  if (!ttsUp) return null;
  try {
    const res = await fetch(`${TTS_BASE}/speak`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: sentence }),
      signal: AbortSignal.timeout(30000),
    });
    const kind = res.headers.get("content-type") ?? "";
    if (!res.ok || !kind.includes("audio/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 1000 ? buf : null;
  } catch {
    return null;
  }
}

function playFile(file) {
  return new Promise((resolve) => {
    const child = execFile("afplay", [file], () => {
      if (audioChild === child) audioChild = null;
      try { unlinkSync(file); } catch { /* already gone */ }
      resolve();
    });
    audioChild = child;
  });
}

function speakSay(sentence) {
  return new Promise((resolve) => {
    const child = execFile("say", [sentence], () => {
      if (audioChild === child) audioChild = null;
      resolve();
    });
    audioChild = child;
  });
}

function speak(sentence) {
  if (!sentence) return;
  console.log(`🔊 [Synthesizing Audio]: "${sentence}"`);
  if (noAudio) return;
  audioChain = audioChain.then(async () => {
    if (ttsMuted) return;
    const t0 = Date.now();
    const wav = await synthesizeLocal(sentence);
    if (ttsMuted) return;
    if (wav) {
      console.log(`   voice: mms-local (+${Date.now() - t0} ms synth)`);
      const file = join(tmpdir(), `poc-tts-${process.pid}-${++ttsSeq}.wav`);
      writeFileSync(file, wav);
      await playFile(file);
    } else {
      console.log("   voice: say (fallback)");
      await speakSay(sentence);
    }
  });
}
function bargeIn() {
  ttsMuted = true;
  audioChain = Promise.resolve();
  if (audioChild) {
    try { audioChild.kill(); } catch { /* already gone */ }
    audioChild = null;
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
    await audioChain;
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
    await audioChain;
  } catch (err) {
    console.error(`Responses fallback failure: ${err.message}`);
  }
}

// --- Transcribe realtime session. ------------------------------------------
const sessionId = `support-session-${Date.now()}`;
ttsUp = await ensureTtsServer();
const ws = new WebSocket(`${WS_URL}?sessionId=${sessionId}`);
const tStart = Date.now();
let firstPartialAt = 0;
let acked = false;

function ms() {
  return Date.now() - tStart;
}

ws.on("open", () => {
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
});

ws.on("message", (data, isBinary) => {
  if (isBinary) return; // binary frames never arrive server→client; ignore
  let msg;
  try {
    msg = JSON.parse(String(data));
  } catch {
    return;
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
      trackLlm(queryLlamaBrain(msg.turnId, msg.transcript));
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
});

ws.on("error", (err) => {
  console.error("Muse WebSocket error:", err?.message || "(no detail)");
});

ws.on("close", async (code, reasonBuf) => {
  const reason = String(reasonBuf || "");
  console.log(`\n■ Stream closed (code ${code}${reason ? `: ${reason}` : ""})`);
  if (code === 1006 && !acked) {
    console.error("   Hint: 1006 before the handshake ack usually means the WS upgrade never completed —");
    console.error("   check direct egress to wss://api.meta.ai (no MITM proxy), then retry.");
  }
  // Late turns may still be answering: drain LLM jobs and TTS first.
  await Promise.allSettled([...llmJobs, audioChain]);
  if (ttsChild) {
    try { ttsChild.kill(); } catch { /* already gone */ }
    ttsChild = null;
  }
  setTimeout(() => process.exit(acked ? 0 : 1), 500);
});

// In-flight LLM turns, drained before exit so a turn near end-of-stream
// still gets its answer + spoken sentences.
const llmJobs = new Set();
function trackLlm(job) {
  llmJobs.add(job);
  void job.finally(() => llmJobs.delete(job));
}

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
