# Voice-First IDV — Build Plan

Voice-only identity verification: hold up a passport, answer aloud, hear the
Decision. Built for the **Meta Global AI Developer Hackathon** (indie track).

**Track:** Indie developer · **Theme:** Build for Your World · **Deadline:** Nov 4, 9:00 PM ET

## Why this, and why now

Every KYC flow on the market assumes you can read a screen, find a button, and
line up a document inside a box. Blind and low-vision users are excluded from
all of them, and the exclusion is invisible because the flow looks fine to
everyone else. This project is the same verification work with the visual channel
removed: instructions spoken, document read by the system, result spoken back,
with a transcript on screen only for the sighted observers in the room.

Judged on **creativity, technical ambition, and whether it works** — so the
artifact is a 2:15 video containing a *failing* run, and the deployed URL exists
so the claim can be checked.

## What this does not claim

The fastest way to lose a knowledgeable judge is to overclaim. Enforced in code
and in UI copy (see `GLOSSARY.md`, `docs/adr/`):

- **Not liveness detection.** The motion check confirms the requested movement
  happened. It cannot detect a screen replay, a print, or a mask.
- **Not forgery detection.** The splice check reports whether a discontinuity was
  *not found* in the portrait region. Absence of a detected artifact is not proof
  of authenticity.
- **Not certified face matching.** A similarity value and a band, explicitly
  uncertified.
- **No weighted scores.** `verified` requires every check to pass, and
  `inconclusive` never counts as a pass.

## The 20 checks

Deterministic, each with a stable id and computed Evidence. The LLM narrates;
it never decides (`docs/adr/0002`).

### Document — ICAO 9303 TD3 (15)

| id | reads | evidence |
|---|---|---|
| `line_count` | MRZ | 2 lines of 44 chars |
| `char_set` | MRZ | only `A–Z0–9<` |
| `td3_length` | MRZ | per-line length |
| `country_code` | MRZ | 3 letters, not padding |
| `sex_field` | MRZ | `M`/`F`/`<` |
| `check_digit_docnum` | MRZ | computed vs printed digit |
| `check_digit_dob` | MRZ | computed vs printed digit |
| `check_digit_expiry` | MRZ | computed vs printed digit |
| `check_digit_composite` | MRZ | computed vs printed digit |
| `mrz_viz_match` | MRZ + visual zone | field-by-field agreement |
| `expiry_vs_today` | MRZ | expiry date vs run date |
| `expiry_range_plausible` | MRZ | expiry within −1 to +12 years of the run date |
| `personal_number_format` | MRZ | optional field unused, or 1–14 alphanumerics |
| `dob_plausible` | MRZ | age in [0, 120], DOB before issue |
| `mrz_legible` | image | MRZ region passes legibility threshold |

### Image (3)

| id | reads | evidence |
|---|---|---|
| `image_quality` | whole image | resolution, blur, glare — **the only check allowed to return `inconclusive`** |
| `portrait_region_present` | image | a portrait region was located |
| `portrait_splice_artifact` | image | discontinuity between portrait region and surrounding print pattern |

### Subject (2)

| id | reads | evidence |
|---|---|---|
| `face_match` | document portrait + selfie | similarity value + band, uncertified |
| `challenge_compliance` | sampled frames | pose delta across the capture window |

**Decision** = `verified` if all 20 pass · `rejected` if any fail ·
`not_verified` if none failed but ≥1 was inconclusive.

## Flow vocabulary

**Stage** (backend only, code moves it — `docs/adr/0003`):
`idle → awaiting_consent → awaiting_document → reading_document →
awaiting_challenge → awaiting_selfie → comparing → decided`

**Turn** (spoken, closed set of 8): `consent`, `instruct`, `re-ask`, `replay`,
`progress`, `warn`, `result`, `abort_confirm`

**Subject intent** (closed set of 6): `affirm`, `deny`, `repeat`, `ready`,
`help`, `unknown` — deterministic keyword match first, model consulted only for
`unknown`, and it may return only one of the six. `repeat` and `help` never touch
the model.

**Latency budget:** 1.5 s to first audio. The deterministic template starts
playing; a late model turn is discarded, not spliced.

## Stack

| Concern | Primary | Fallback |
|---|---|---|
| Server | Hono on Cloudflare Workers (`wrangler`), one page, no routing | `wrangler dev` locally |
| ASR | Web Speech API (`SpeechRecognition`) | typed input, always on screen; offline Whisper-tiny only if ahead |
| TTS | `speechSynthesis` (local, free, offline) | Kokoro-82M in-browser |
| Segmentation | Meta Model API `sam-3-1` (`POST /v1/responses`, $0.0025/img) | known fixture geometry — no segmentation needed |
| Narration | `muse-spark-1.3-contributor` ($0.10/Mtok in) | deterministic templates |
| Fixture art | Muse Image ($0.01/img) for the visual base | hand-composed base |
| Checks | plain TypeScript, no deps | — |

Every model sits behind a flag. `--no-meta` must produce a fully coherent demo;
that flag is the insurance policy. Estimated total model spend: **under $10**.

## Fixtures with known ground truth

Six documents (3 clean, 3 tampered), three selfies, three frame sets. Tampering
is authored **programmatically** — flip a check digit, shift the expiry, transplant
a portrait — so each fixture ships a `fixture.json` naming the exact checks that
must fail. This is both the demo dataset and the test suite. The visual base may
come from Muse Image; the MRZ and portrait regions are composed by us, so the
ground truth is exact.

Scenarios: (1) clean pass, (2) tampered document, (3) mismatched portrait.

## Calendar

Nine working days, ~2.5 h each. **No buffer** — any overrun triggers the cut
below, not a later night.

| Date | Work | Exit criterion |
|---|---|---|
| **Oct 26** | Fixtures: TD3 MRZ author with real check digits, 6 docs, 3 selfies, frame sets, `fixture.json` | `npm test` proves each fixture's ground truth |
| **Oct 27** | MRZ parser + the 15 document checks | All 15 give expected results across all 6 fixtures |
| **Oct 28** | Image + subject checks, Decision computation | 20/20 checks run headless, no UI |
| **Oct 29** | Stage machine, 8 Turn templates, 6-intent classifier, TTS, transcript | Full run driven by **typed** input, spoken output |
| **Oct 30** | Web Speech input, Decision screen, fixture picker | **Voice-complete run: one clean + one tampered.** Rough video shot |
| **Oct 31** | SAM 3.1 + Muse Spark narration behind `--meta` | `--meta` adds both; `--no-meta` identical to Oct 30 |
| **Nov 1** | Shoot + edit the 2:15 video | Video cut finished |
| **Nov 2** | `wrangler deploy`, README, limitations, spend log | Public URL a judge can click |
| **Nov 3** | Repo public, submission writeup, upload | Submission materials complete |
| **Nov 4** | Submit **early**, not at 9 PM ET | Submitted |

**The cut, pre-agreed:** if Oct 26–28 overrun, collapse the four MRZ check digits
into one check (loses the "20" claim, keeps the product) and drop the SAM live
path to a single recorded demo moment. The voice loop and the Decision screen are
never cut — they are the product.

### Video beats (2:15)

| Time | Beat |
|---|---|
| 0:00 | The problem: every KYC flow needs a screen. 15 s |
| 0:15 | Consent, document instruction, document checks pass — 45 s |
| 1:00 | **Tampered fixture** — check-by-check failure with evidence — 40 s |
| 1:40 | Decision screen: 20 results, failures on top — 25 s |
| 2:05 | Limitations close: what this does not claim — 10 s |

The failing run leads because "you flipped a check digit and it caught it" is the
one claim a mockup cannot fake. Ends on limitations, not a green tick.

## Open items

- [ ] **Confirm acceptance.** Applications closed Oct 25; approvals were sent
      Oct 26 9:00 AM ET. Nothing here matters without the confirmation email.
- [ ] **Official Rules** (published before Oct 26) — need to check for required
      model usage, open-source obligations, video length caps, and submission
      format.
- [ ] **Meta Model API billing.** No free tier; a card is required before Oct 31
      or `--meta` cannot be built.

## Decision record

- `docs/adr/0001` — a Decision is a conjunction of named checks, never a score
- `docs/adr/0002` — the LLM narrates; deterministic code decides
- `docs/adr/0003` — Stage is moved by code; the LLM only writes Turns
- `GLOSSARY.md` — canonical vocabulary, including the claims we refuse to make
