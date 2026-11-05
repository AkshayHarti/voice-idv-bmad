# Aria — Voice onboarding agent

**Team One Voice** (solo) · Meta Global AI Developer Hackathon

Talk to Aria, hold up your ID, get verified. Voice-first identity
verification built for the people camera-form KYC leaves out — blind and
low-vision users complete the full run by voice, screen unread.

> Hackathon MVP. 100% synthetic fixtures — no real PII anywhere.

## Try it

```bash
npm install && npm run build && PORT=8787 npm start
```

Open `http://localhost:8787/page`, pick a fixture, say "I consent",
and follow Aria's voice: document capture → challenge frames → selfie →
spoken verdict. The token-gated customer link shows failures-first evidence.

## How it works

- **Voice-led capture** — spoken instructions, real-time framing coaching,
  auto-capture when steady ("lock now" to force it), Keep/Retake confirm
  cards, full transcript mirror. Typing always works as fallback.
- **Deterministic verdicts** — named checks (OCR fields, MRZ digits, card
  number, face match band) decide by conjunction, plus DVS match and a risk
  tier. Models narrate, segment, and guide; they never decide.
- **Meta stack** — Spark (narration, adversarial audit), Wonder (run agent),
  Voice Transcribe (ASR), SAM 3.1 (regions), Image (fixture art), Glimmer
  (local core). Offline templates hold parity when keys are absent.

## Repo map

`src/` app + `/page` client · `test/` suites (`npm test`) ·
`fixtures/` synthetic AU docs · `docs/` submission, specs, demo-video kit ·
`_bmad-output/` UX spines and implementation specs.

## Non-claims

Not liveness certification. Not forgery proof. Uncertified face match.
Enforced in code, UI copy, and spoken lines.
