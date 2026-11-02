# Futuristic Voice-Assistant IDV — Restructured Specification

**Status:** spec, draft (restructure)
**Date:** 2026-11-02
**Relation:** Restructures `2026-10-31-au-voice-idv-spec.md` (AU slice) around a
voice-assistant experience. The AU slice spec stays the contract for the built
demo; this document is the contract for what comes next. Nothing here weakens
the frozen core: deterministic checks decide, models narrate and guide only.
**UX contracts:** `_bmad-output/planning-artifacts/ux-designs/ux-voice-idv-bmad-2026-11-02/DESIGN.md`
(Halo visual identity) and `EXPERIENCE.md` (behavior, IA, journeys) — this spec
inherits them by reference and does not restate them.

## 1. What changed and why

The AU slice proved the decision core: fixtures in, deterministic verdicts out,
voice as narration. But its experience is a form that talks — typed-first,
fixture-driven, no camera. The restructure inverts the posture:

- **Assistant-first:** a voice assistant conducts the run. It speaks every
  instruction, watches through the camera, and generates the UI each Turn
  needs. The user never navigates; they converse and hold still.
- **Camera-first capture:** document front/back, challenge frames, and selfie
  are live captures coached in real time until images are model-grade for the
  Muse models — then processed by the same deterministic pipeline.
- **Generated UI, fenced:** per-Turn panels are assembled from approved
  primitives under the Generated UI Contract (`EXPERIENCE.md`). The assistant
  selects and fills; it never invents surfaces, flow, or verdict-adjacent
  chrome.

What does **not** change: the check engine and conjunction Decision, the closed
Turn/intent sets, backend-owned stages, the non-claims vocabulary, consent
gating with full purge, and `--no-meta` parity (fixtures remain the offline
floor and the test suite).

## 2. Experience summary

See `EXPERIENCE.md` for the full spine. In brief: three surfaces (Assistant,
Capture, Decision) plus a consent sheet. The spoken line is the hero; every
utterance has a text twin; one coach card at a time during capture; verdicts
render failures-first with limitations and an on-demand Attack Surface panel.
Key flows: Sienna's clean pass and Tom's tampered catch, each with a spoken
climax beat. Full runs remain completable by voice + haptics with the screen
unread.

## 3. System architecture

```
User voice ←→ Assistant runtime ←→ Surfaces (Assistant / Capture / Decision)
                    │                       ↑
                    ├── UI generator (panels from primitives, Turn-bound)
                    ├── Capture pipeline (telemetry → coach → lock → crop)
                    ├── Check engine (frozen: named checks + conjunction)
                    ├── Providers (Spark narration/audit, SAM regions, templates)
                    └── DVS gateway + risk tier (unchanged shape)
```

- **Assistant runtime:** owns the Turn loop. Selects the Turn kind per stage
  (closed set of 8), fills panel data, dispatches speech, and enforces the
  prohibitions (no invented flow, no verdict-adjacent chrome pre-decision).
- **UI generator:** pure function of (Turn kind, stage, data) → panel tree.
  Schema-validated; unknown shapes fail closed to a text-only panel. Model
  may polish panel copy within Voice-and-Tone rules; structure is deterministic.
- **Capture pipeline:** edge telemetry (~5Hz) → fault → coach instruction →
  lock → crop → checks. Only locked captures enter the pipeline; every lock
  is announced (flash + haptic + spoken confirm).
- **Check engine / DVS / tier:** unchanged from the AU slice (§§3/5 of the
  prior spec). Capture-layer signals (moiré, tilt variance) feed the existing
  fraud matrix as additional inputs, not new tiers.

## 4. Capture & image-quality contract

Camera-first means the image contract is explicit. Minimums for the model
path (deterministic fallbacks hold below them):

| Capture | Resolution | Focus / quality | Framing | Legibility gate |
|---|---|---|---|---|
| Doc front/back | 1600px long edge | Laplacian ≥ 120 [ASSUMPTION] | all 4 corners in frame | machine-zone contrast ≥ 3:1 [ASSUMPTION] |
| Challenge frames | 720p, 3+ frames | face oval ≥ 25% frame | centered ±15% | pose delta measurable |
| Selfie | 1080px long edge | eyes open, no blowout | oval fill 60–90% | matchable crop (uncertified band only) |

Telemetry faults map 1:1 to coach instructions (glare→tilt, occlusion→move
thumb, skew→straighten, blur/dark→light+steadiness, moiré→physical-card
prompt, missing-back→flip prompt); the 3rd repeat of one fault escalates to
a `warn` turn plus an alternative path. Full map in `EXPERIENCE.md`
(Capture Guidance System). Thresholds above are the v1 proposal — the pilot
against physical specimens sets the final numbers.

## 5. Voice & generated-UI contract

- Turns stay closed (8 kinds) and intents closed (6); deterministic keyword
  match first, model only for `unknown`, constrained to the six.
- Template-first audio ≤1.5s holds: the deterministic Turn starts playing; a
  late model polish is discarded, not spliced. Generated panels follow the
  same rule — deterministic skeleton first, model fill if back in budget.
- Panel schema (v1 primitives): confirm-row, choice-list, progress-steps,
  evidence-peek, retake-pair. Panels retire when their Turn closes.
- Prohibitions (binding): no copy implying refused claims; no synthesized
  confidence; no pre-decision decision-adjacent chrome; no auto-dismiss of
  consent/abort/verdict; model-touched panels carry provider tags.

## 6. Decision core (frozen, by reference)

Unchanged from the AU slice: named checks with computed Evidence (§3 of the
prior spec), conjunction Decision (`verified` iff all pass; `rejected` on any
fail; `not_verified` on inconclusive-without-fail), `image_quality` the only
check allowed `inconclusive`. The assistant may explain a Decision after the
fact; it cannot alter, reframe-as-pass, or precede one. `--no-meta` parity
holds on every fixture — fixtures remain the ground-truth suite even as live
capture becomes the primary demo path.

## 7. Fraud & tiering (by reference + capture inputs)

Tier rule unchanged (any High → silent hard flag; Medium / OCR <85% →
step-up; all-pass + DVS match → auto-approve; `inconclusive` never approves).
New capture-layer inputs feed the existing matrix: edge moiré/reflection
score, tilt-challenge OVD variance, persistent-fault counters. The step-up
branch (face + passphrase) and silent-flag UX are as previously specified.

## 8. Privacy (by reference + camera data)

AU slice §6 stands (consent audio + timestamp, AU residency, TLS 1.3+,
AES-256, redacted logs, deny-purge). Camera-first additions: telemetry stays
on-device (only capture crops traverse TLS); viewfinder frames are never
stored, only locked captures as signed refs; the consent gate names each
capture kind before the camera opens; revocation purges captures and crops,
not flags.

## 9. Demo slice v2 & acceptance

Live (keys optional, offline floor intact): camera-first runs over the
existing fixture matrix — 1 clean passport, 1 tampered passport, 1 clean NSW
DL — with the assistant speaking, guides locking, and panels generating per
Turn. Fixture stand-in remains for projection/no-camera environments.
Acceptance: clean verifies, tampered rejects with spoken computed-vs-printed
Evidence, 3-hypothesis audit on demand, `--no-meta` parity on every fixture,
full voice-only run completable with the screen unread.

## 10. Migration from the current slice

1. Add the Capture surface + telemetry/coach loop (new); keep fixture
   stand-in behind it for tests and projection.
2. Introduce the UI generator + panel schema; migrate the static Decision
   screen to generated panels (same content, Turn-bound).
3. Reframe page copy to the assistant posture (spoken line hero, coach
   cards); adopt Halo tokens.
4. Extend the fraud matrix inputs; no tier changes.
5. Keep `npm test` green throughout — fixtures remain the suite; add
   telemetry/coach and panel-schema tests alongside.

## 11. Open items

- [ ] Finalize capture thresholds against physical specimens (pilot).
- [ ] Confirm light-theme exclusion for v1 ([ASSUMPTION] in `DESIGN.md`).
- [ ] Landscape capture layout ([ASSUMPTION] in `EXPERIENCE.md`).
- [ ] Run the validation gate (reviewer lenses) over both spines + this spec.
- [ ] Render key-screen mocks for surfaces where layout drives behavior.
