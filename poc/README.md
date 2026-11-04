# Voice support pipeline POC (Transcribe realtime → LLM → TTS)

Proves the low-latency loop on `poc-voice-pipeline` branch: stream raw PCM
to Muse Voice Transcribe over WebSocket, turn `speechComplete` events into
an LLM answer, and speak it sentence-by-sentence while later sentences
still generate. Barge-in cuts TTS when the caller starts talking again.

## Run it

```sh
# 0. Deps (the `ws` client — Node's built-in WebSocket attempts the
#    upgrade over HTTP/2 and dies with 1006 against this endpoint)
npm install

# 1. Key (never printed by the script)
export MODEL_API_KEY="$(grep ^META_API_KEY= .env | cut -d= -f2-)"

# 2. Make a 24 kHz mono raw-PCM clip of a voice (example: say a line,
#    or convert any recording — Voice Memo, wav, mp3):
afconvert -f WAVE -d LEI16@24000 -c 1 input.wav clip-24k.wav
tail -c +45 clip-24k.wav > clip-24k.pcm   # strip the 44-byte WAV header

# 3. Stream it through the full loop (speaks via macOS `say`):
node poc/support-orchestrator.mjs clip-24k.pcm

# Log-only (no audio out), product-name biasing:
node poc/support-orchestrator.mjs clip-24k.pcm --no-audio --keywords AcmeWidget,PlanPlus
```

## Reading the output

- `✔ Handshake accepted (+N ms)` — WS + auth + config proven.
- `Customer speaking: "…"` — partials rewriting one line (CUMULATIVE).
- `🎙 speechStart` — caller started; any playing TTS is killed (barge-in).
- `[Turn N complete]` — final turn text; the LLM leg starts here.
- `TTFT: N ms` — LLM time-to-first-token; sentences speak as they complete.
- `■ Stream closed (code 1000)` — clean flush after `endStream`.

## What the POC corrects vs the draft script

The draft this POC replaces had five protocol errors, fixed here against
[the realtime API reference](https://dev.meta.ai/docs/api-reference/voice/realtime)
and [schemas](https://dev.meta.ai/docs/api-reference/voice/schemas):

1. **Handshake**: no `type: 'session.update'`; auth is
   `{authorization: {accessToken: 'Bearer …'}}`, audio is the
   `audioEncoding: 'PCM_24KHZ'` enum, model is required, and the mode
   enum is `PUSH_TO_TALK | ENDPOINTING | DIARIZATION` (`'STREAMING'`
   does not exist). This POC uses `ENDPOINTING`.
2. **Events**: turns arrive as `transcript` (partials + finals),
   `speechStart` / `speechEnd` (boundaries) and `speechComplete`
   (the turn's text, keyed by `turnId`) — not `speech.hypothesis` /
   `speech.endpoint_detected`.
3. **LLM endpoint**: `https://meta.ai` is not an API. The POC posts to
   `https://api.meta.ai/v1/chat/completions` with `stream: true` and
   parses SSE (`data:` frames, `[DONE]`), falling back to the verified
   `/responses` shape. The draft read raw chunk bytes as text.
4. **Model**: `llama-3.1-8b-instruct` is not served on Model API (the
   live `/v1/models` list carries Muse + SAM only), so the default
   brain is `muse-spark-1.3` (verified live on this key); override
   with `VOICE_POC_LLM_MODEL`. Llama-3.1-8B-class speed is available
   via third-party hosts (e.g. OpenRouter) with your own key.
5. **Audio in**: the draft never sent any. This POC paces raw PCM
   binary frames (~80 ms) and half-closes with `{type: 'endStream'}`.

## Verified live (2026-11-04, this key)

- Chat Completions streaming with `muse-spark-1.3`: 200, SSE deltas,
  real answer text. Requires `max_tokens: 1000` — the model spends
  ~118 reasoning tokens before answering, and 120 starves it to
  `finish_reason: length` with null content.
- Realtime WS end-to-end on an 18 s voice clip: handshake ack ~1 s,
  partials stream while speaking, `speechStart`/`speechEnd`/
  `speechComplete` per turn, clean close 1000. LLM TTFT ~2 s;
  sentence-split answers speak as they generate. Total POC spend
  ≈ $0.001 (18 s audio + 2 short answers).
- Sockets must be `ws`, not Node's built-in WebSocket: the built-in
  client attempts the upgrade over HTTP/2 and dies with 1006.

## TTS stage (the non-robotic voice)

Meta has no TTS on Model API — Transcribe "does not synthesize speech"
— so the speaking leg is OpenAI: each completed sentence is synthesized
(`gpt-4o-mini-tts`, voice `nova`, MP3) and played via `afplay`, serially,
while later sentences still generate. Barge-in kills playback.

- Key: `OPENAI_API_KEY` (must be valid — a 401 falls through silently).
- Overrides: `VOICE_POC_TTS_MODEL`, `VOICE_POC_TTS_VOICE`.
- Ladder per sentence: `gpt-4o-mini-tts` → `tts-1` → macOS `say` →
  log-only; `--no-audio` skips synthesis entirely.
- Verified 2026-11-04: fallback ladder end-to-end (exit 0). The neural
  voice itself needs a valid key — the shell's current key 401s
  (`invalid_api_key`), so refresh it to hear the difference.

## Notes / next steps
- `keywords[]` in the handshake already biases product-name
  recognition (see `--keywords`); spelling is not guaranteed.
- Telephony (Twilio Media Streams / SIP) replaces the file pump:
  transcode μ-law 8 kHz → PCM 24 kHz and feed `ws.send()`; the turn,
  LLM, and barge-in logic is unchanged.
