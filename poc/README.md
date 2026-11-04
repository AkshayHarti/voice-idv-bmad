# Voice support pipeline POC (Transcribe realtime → LLM → TTS)

Proves the low-latency loop on `poc-voice-pipeline` branch: stream raw PCM
to Muse Voice Transcribe over WebSocket, turn `speechComplete` events into
an LLM answer, and speak it sentence-by-sentence while later sentences
still generate. Barge-in cuts TTS when the caller starts talking again.

## Run it

```sh
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
- Realtime WS: **not verifiable from the build sandbox** (egress proxy
  breaks WS upgrades — even echo servers 1006). The handshake, frame
  pacing, and event dispatch follow the API reference exactly; run the
  script on your machine to prove the audio leg.

## Notes / next steps

- TTS here is macOS `say` (or log-only). Meta has no TTS model on
  Model API — Transcribe "does not synthesize speech." Swap `speak()`
  for a streaming TTS (Cartesia/ElevenLabs/OpenAI) for production feel.
- `keywords[]` in the handshake already biases product-name
  recognition (see `--keywords`); spelling is not guaranteed.
- Telephony (Twilio Media Streams / SIP) replaces the file pump:
  transcode μ-law 8 kHz → PCM 24 kHz and feed `ws.send()`; the turn,
  LLM, and barge-in logic is unchanged.
