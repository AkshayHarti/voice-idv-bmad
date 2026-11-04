# Voice-Guided Multimodal Identity Onboarding — AU Product & Technical Specification

**Status:** spec, pending review
**Date:** 2026-10-31
**Platform:** Mobile Web (WebRTC) Phase 1. Native SDK / kiosk appendix-only.
**Scope:** AU passport + 8-state driver licences + Phase 1.5 Medicare/ImmiCard.
**Relation:** Standalone enterprise spec. Reuses `voice-idv` stage-machine + deterministic-checks philosophy. Hackathon build (`repos/voice-idv`, `2026-10-30-voice-idv-bmad-design.md`) untouched.
**Demo constraint:** Hackathon slice must run with no keys/offline (`--no-meta` coherent).

## 1. Executive Summary & Success Metrics

### Problem

Static image/screenshot uploads fail on glare (NSW/VIC holograms, passport laminate), blur, low light, tilt/skew, fingers over MRZ or Card Number, and missing DL backs (Card Number + address sticker live on the back in most states). Users get static text errors, retry blindly, drop off. Screenshots and photocopies pass the upload step and fail late or never.

### Solution

Replace uploads with a voice-guided live capture loop: edge/browser frame telemetry drives spoken coaching in real time ("tilt away from light", "move thumb off Card Number", "hold still… captured, now flip the card"). Low-confidence fields (<85%) fall back to spoken spelling cross-checked against the visual crop. Decision is deterministic code over named checks; voice narrates, never decides. Fraud runs as layered pipeline (PAD, voice/behavioural, cryptographic + DVS) mapping to Auto-Approve / Step-Up / silent Hard Flag.

### What this is not

- Not liveness certification, not forgery proof, not certified biometrics. Motion confirms responsiveness; splice-not-found is not authenticity; face similarity is a value + band, uncertified. Same non-claim discipline as `voice-idv` GLOSSARY.
- Not a full dialogue agent. Guided flow, closed intents, backend signals move stages.

### Success metrics (fixture-measured, no population claims until pilot)

| Metric | Definition | Target |
|---|---|---|
| First-Time Pass Rate | Clean synthetic fixtures passing without retry | ≥99% on fixture set |
| Drop-off Reduction | Abandon rate vs static-upload baseline in pilot | −40% relative |
| Field Accuracy | policed fields matching ground truth first capture | ≥99% on fixtures |
| Fraud Catch Rate | Seeded attacks flagged (screen replay, print, MRZ flip, missing back, font mismatch) | 100% of seeded set flagged (approve/step-up/flag) |
| DVS Match Rate | Clean fixtures matching DVS stub | 100% stub; prod measured separately |
| Latency | Frame-telemetry → voice prompt (prod) / first audio (demo) | <300ms prod; ≤1.5s demo floor |
| Accessibility | Full run completable by voice + haptics, no screen reads | 1 clean + 1 tampered voice-complete run |

Targets are measured on the versioned fixture set + pilot cohort. No real-population accuracy claims.

## 2. End-to-End User Journey & Voice Script State Machine

### Stages (backend moves Stage; speech cannot)

```
idle → awaiting_consent → awaiting_doc_front → reading_front
     → awaiting_doc_back → reading_back → awaiting_challenge
     → awaiting_selfie → comparing → decided
```

Back stages are skipped for passports. DLs always require back (Card Number + address sticker check).

### Subject intents (closed, 6)

`affirm`, `deny`, `repeat`, `ready`, `help`, `unknown`. Deterministic keyword match first; model only for `unknown`, constrained to the six. `repeat`/`help` never advance Stage. Negation (`not ready`) = `deny`.

### System Turns (closed, 9)

`intro`, `consent`, `instruct`, `re-ask`, `replay`, `progress`, `warn`, `result`, `abort_confirm`. Deterministic template audio starts immediately (demo 1.5s budget); late model Turn discarded, not spliced.

### Happy-path script (Mobile Web)

| Stage | Voice prompt (sample) | Backend action |
|---|---|---|
| consent | "I'm Aria. I'll guide you by voice to verify your ID. Nothing is uploaded until you say so. Say — I consent — to start." | Record consent audio + timestamp |
| awaiting_doc_front | "Hold your licence up, front facing the camera. Fill the frame." | Edge telemetry: doc quad, size, focus, glare map |
| reading_front | "Good framing. Hold still one second… captured front." | HQ capture, OCR front, segment regions |
| awaiting_doc_back | "Now flip the card over so I can grab your Card Number on the back." | Detect flip, quad, focus |
| reading_back | "Got the back. Checking the Card Number…" | OCR back, address-sticker check |
| awaiting_challenge | "Look at the camera, turn your head slowly left… and back." | Sample 3–5 frames, pose delta |
| awaiting_selfie | "Hold still for your selfie… captured." | Face crop, quality |
| comparing | "Checking your details now…" | 20+ checks, DVS call, risk tier |
| decided | "Verified. Your licence passed all checks including the DVS match. Details are on screen if you want them." | Report + limitations |

Passport variant skips back stages: "Open to the photo page. I need the two-line code at the bottom fully visible."

### Coaching prompts (telemetry-driven, error states)

- Glare on hologram/photo: "Tilt the top of your licence slightly away from the light to clear the glare on your photo. … Better, hold there."
- Finger over Card Number: "Move your right thumb slightly — it's covering the Card Number. … Clear now, hold still."
- Tilt/skew: "Straighten the card so all four corners show. … Good."
- Blur/dark: "Move to brighter light and hold the phone steadier. … Sharper now."
- Screenshot detected: "This looks like a photo of a screen. Please use your physical card."
- Missing back: "I still need the back of the card — the Card Number lives there. Flip it over."
- Low-confidence field: "I read your Card Number as 3-4-…-7 but I'm not sure of two digits. Please read the Card Number aloud, digit by digit."
- Barge-in: any prompt is interruptible; transcript + haptic tick confirms capture.

### Step-Up branch (face + passphrase)

Triggered by single medium signal or any OCR confidence <85%. Voice: "I need one extra check. Look at the camera and say — my voice is my key — then hold still for your video selfie." Runs active liveness (challenge-response + texture/moiré) + 1:1 face band + passphrase match. Failure or second medium signal → silent Hard Flag path.

## 3. Data Extraction Schema & Validation Rules

### Envelope (DVS interface = prod and stub share this shape)

```json
{
  "run_id": "run_01J…",
  "subject_consent": {"audio_ref": "wss://…", "timestamp": "2026-10-31T…+11:00", "text": "I consent"},
  "document": {"kind": "au_passport | au_dl | medicare | immicard", "state": "NSW|VIC|…|null"},
  "front": {"capture_ref": "…", "ocr_confidence": 0.97, "fields": {}},
  "back": {"capture_ref": "…|null", "ocr_confidence": 0.93, "fields": {}},
  "face": {"selfie_ref": "…", "similarity": 0.81, "band": "high|medium|low", "certified": false},
  "dvs": {"request_id": "…", "match": true, "fields_matched": [], "fields_mismatched": []},
  "checks": [{"id": "mrz_check_digit_docnum", "result": "pass|fail|inconclusive", "evidence": "computed 3 vs printed 3"}],
  "decision": "verified|rejected|not_verified",
  "risk": {"tier": "auto_approve|step_up|hard_flag", "signals": []}
}
```

DVS stub implements `verify(payload) → {match, fields_matched, fields_mismatched}` deterministically from `fixture.json` ground truth. Prod swaps transport only.

### AU passport (TD3)

Fields: surname, given_names, dob, sex, place_of_birth, passport_number, issue_date, expiry_date, mrz_lines[2×44].

Rules: 2 lines × 44 chars; charset `A–Z0–9<` only; per-field check digits (doc number, DOB, expiry, composite) computed vs printed; VIZ↔MRZ field agreement; expiry vs run date; DOB plausible (age 0–120, DOB before issue); MRZ legibility threshold. Any check-digit fail = `rejected`.

### AU driver licence (8 states)

Fields: full_name, dob, address (street, suburb, state, postcode), licence_number, card_number, expiry_date, class_conditions, address_sticker {present, parsed_address}.

Rules:
- `card_number` present (front or back per state) — missing = fail (DVS cannot verify without it).
- Back capture mandatory; address sticker if present must parse and cross-check front address; mismatch → `re-ask` spoken + `mrz_viz_match`-style evidence.
- Licence-number format validated per state via configurable regex table (patterns versioned in config, not hardcoded claims; DVS is source of truth).
- Expiry vs run date; DOB plausible; portrait region present; splice artifact check (not-found ≠ authentic).

State card-number location is config, e.g. NSW back, VIC front/back variants — resolved from state table, validated in pilot against physical specimens.

### Medicare / ImmiCard (Phase 1.5)

Medicare: card_number (10 digits), irn (1 digit, position matters), expiry, colour (green/blue/yellow), name line. IRN selects the person on a shared card — misread IRN = wrong-person risk, always voice-confirmed if confidence <85%. ImmiCard: document number + expiry + holder details per card face.

### DVS requirements

Passport: name + DOB + passport number + expiry + sex. DL: name + DOB + licence number + card number + expiry + state. Medicare: name + DOB + card number + IRN + expiry + colour. Send minimum fields; log only match booleans + redacted refs, never full numbers.

## 4. System Architecture & Real-Time Pipeline

### Topology (prod, <300ms budget)

```
Mobile Web (edge)                    Backend (AU region)
─────────────────                    ────────────────────
Camera → frame telemetry             Session / stage machine (code-only moves)
(quad, focus, glare,                → OCR workers (front/back crops)
 occlusion, moiré score)             → Check engine (pure functions)
  → WebRTC video (keyframes          → DVS gateway (real API)
     only) + Opus audio              → Risk tier + Report builder
  → barge-in ASR (streaming,         → Consent vault (audio + ts)
     Aus-en) ←→ TTS (streaming,
     interruptible)
```

Frame telemetry (tiny edge model, <2MB WASM) streams at ~5Hz; full frames only on capture trigger. ASR/TTS stream over WebSocket; deterministic Turn template plays first, model-polished Turn replaces only if back in budget.

### Latency budget (prod)

| Hop | Budget |
|---|---|
| Edge telemetry → prompt decision | <120ms |
| ASR partial → intent | <80ms streaming |
| TTS first byte | <100ms after Turn chosen |
| Capture → OCR result | <800ms (async, narrated by `progress` Turns) |
| OCR → checks + DVS | <1200ms (async) |
| **Frame event → coaching voice** | **<300ms** |

### Demo floor (hackathon, same machine)

Template-first audio ≤1.5s; late model Turn discarded. Provider chains `META_API_KEY → OPENROUTER → local templates` (narration) and `META → Replicate → fixture geometry` (segmentation). With no keys everything runs on fixtures; Decisions identical (`--no-meta` parity test).

### Components

- `capture-client`: quad/glare/occlusion/moiré telemetry, capture triggers, haptic + visual cues.
- `voice-agent`: streaming ASR (Aus-en multi-accent), 6-intent match, 8-Turn scripts, barge-in, `<85%` spelling fallback.
- `check-engine`: pure-function checks + conjunction Decision (LLM narrates, never decides).
- `dvs-gateway`: one interface, real + stub backends, redacted logging.
- `fraud-pipeline`: §5 signals → tier.
- `session-api`: `POST /api/session`, `/say`, `/signal`, `GET /api/runs`, `GET /api/run/:id` (same shape as `voice-idv`).

## 5. Fraud & Anomaly Detection Matrix

| Layer | Signal | How detected | Score weight | Action |
|---|---|---|---|---|
| Visual PAD | Screen replay (moiré, bezel reflection, refresh bands) | Edge moiré + reflection score on live frames | High | Hard Flag (silent) |
| Visual PAD | Paper printout / cutout (flat texture, no OVD shift on tilt) | Tilt-challenge OVD variance ≈0 | High | Hard Flag |
| Visual | Font/kerning mismatch, portrait splice discontinuity | Crop analysis + splice check | Medium–High | Step-Up, fail → Hard Flag |
| Visual | Glare/blur/occlusion persistent after 3 coaching turns | Telemetry counters | Low | `re-ask`, then `not_verified` (not a pass) |
| Data | MRZ check-digit fail; VIZ↔MRZ mismatch; licence regex fail | Check engine with Evidence | High | Rejected + Hard Flag if tamper pattern |
| Data | DVS mismatch (any field) | DVS gateway | High | Hard Flag (silent) |
| Audio | Synthetic voice (vocoder artifacts, flat prosody) | Voice anti-spoof score | High | Step-Up, fail → Hard Flag |
| Audio | Background coaching / second voice (duress/scam) | Diarization: 2nd speaker during DOB/postcode confirm | Medium | Step-Up + agent `warn` Turn, log |
| Behavioural | Hesitation on DOB/postcode/name spelling | Latency + ASR self-correction rate | Low–Medium | Step-Up (re-ask + face) |
| Metadata | Device/IP velocity, emulator, permission denial patterns | Session metadata | Low–Medium | Step-Up |

Tier rule: any High → Hard Flag path (user sees generic "needs manual review", real reason only in queue). Any Medium or OCR <85% → Step-Up (face liveness + passphrase). All pass + DVS match → Auto-Approve. `inconclusive` never approves.

Step-Up: active liveness (challenge movement + texture), 1:1 face band (uncertified value), passphrase match. Step-Up fail or second Medium → Hard Flag silently.

## 6. Privacy, Security & Compliance

- **Regulatory:** AUSTRAC AML/CTF identity verification; Privacy Act 1988 + Australian Privacy Principles (collection minimality, purpose limitation, access/correction); DVS via IDMatch/DVS gateway terms; consent recorded per run (audio + timestamp + purpose statement).
- **Residency:** All PII processed/stored in Australia (Sydney/Melbourne regions). No offshore OCR/DVS fallback. Edge telemetry stays on device; only capture crops traverse TLS.
- **Transit/at rest:** TLS 1.3+; AES-256 at rest; KMS-managed keys; signed capture refs, no raw images in logs.
- **Minimisation/redaction:** Full licence/passport numbers, MRZ lines, and audio never in logs — only `match:true/false`, check ids + Evidence digests, redacted refs (`licence_number: ••••42`). Transcript stores Turn text, not audio, beyond consent clip retention window (configurable, default 7 days, then purge).
- **Consent & rights:** Spoken consent required to leave `idle`; `deny`/revoke aborts and purges session captures. Access/correction via Report id. Retention schedule in README + DVS audit log.
- **Demo:** 100% synthetic fixtures, no real persons/documents. No PII leaves the demo machine; transcript on-device; stub DVS returns fixture ground truth.

## 7. Hackathon Demo Slice (demoable guarantee)

Live (no keys, offline-capable): 1 synthetic Aus passport (clean pass) + 1 synthetic NSW DL front/back (clean pass) + 1 tampered passport (flipped MRZ check digit → visible `rejected` with computed-vs-printed Evidence). Face Step-Up shown as one recorded moment. Transcript mirror on screen; spoken verdicts throughout. Video 2:15: problem 15s → clean 45s → tampered 40s → Decision screen 25s → limitations 10s. Everything else in §§1–6 is spec-only for the demo and clearly labelled as such in the video.
