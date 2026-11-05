# Aria — Voice-First ID Verification

**Team One Voice** (solo) · Meta Global AI Developer Hackathon

Every KYC flow assumes you can read a screen and line up a document in a box. Blind and low-vision users are excluded. Aria does the same verification work with the visual channel removed: instructions spoken, document read by the app, verdict spoken back.

Full run by voice: consent → doc front/back → liveness challenge → selfie → verdict. Transcript on screen is for sighted observers only.

## Demo

- Video (3 min): `TODO — paste YouTube link before submitting`
- Live: `npm start` → `/page` (local; deploy pending)

## Meta models used

All calls via Meta Model API, pinned in `src/meta-models.ts`. Spend: $0.04 of $150 (see `docs/spend.md`).

- **muse-spark-1.3** — live narration of every turn + adversarial self-audit (3 attack hypotheses per report)
- **muse-wonder-1.0** — OCR on locked doc crops (`front · ocr` / `back · ocr`)
- **muse-voice-transcribe-1.0** — ASR for consent / keep / retake
- **sam-3.1** — `segment()` branch with fixture-geometry fallback

Models narrate and perceive only — they never decide. `--no-meta` decides identically to `--meta` (parity tested).

## Run

```bash
npm install
npm test
PORT=8787 npm start
```

Set `META_API_KEY` in `.env` for the live Meta path. Without keys everything runs offline on local templates.

## What this does not claim

Not liveness certification, not forgery proof, not certified matching. Enforced in code and UI copy. Fixtures are 100% synthetic — no real PII.
