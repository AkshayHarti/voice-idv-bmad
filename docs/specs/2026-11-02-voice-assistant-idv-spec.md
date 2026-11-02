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
**Rules conformance:** Rev 2 (2026-11-02) conforms to the Cerebral Valley
participant guide (rules PDF) and dev.meta.ai model pages: SAM 3.1
(`sam-3-1`), Muse Image for art, Glimmer/Spark Open as run-weights, plus
Muse Wonder (run agent) and Muse Voice Transcribe (ASR). Supersedes the
meta plan's model table, which misread the rules (see §11).

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
                    ├── Providers (Meta roster below; templates offline floor)
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

**Meta model roster (rules-conformed).** Every model the rules list has a
role; Stage One passes on this breadth:

| Model | Access | Role in Aria |
|---|---|---|
| Muse Spark 1.3 | Model API | Narration polish, adversarial audit, panel copy, `unknown`→closed-intent |
| Muse Wonder | Model API | Run agent: conducts multi-step capture flow, replans on faults |
| Muse Voice Transcribe | Model API | Primary ASR: utterances, spelled letters, passphrase; diarization + end-of-speech |
| SAM 3.1 (`sam-3-1`) | Model API | Regions from noun phrases + tracked challenge video ($0.0025/img, $0.20/1k frames) |
| Muse Image | Model API | Fixture art, coach diagrams, anchored consistent series ($0.01/img) |
| Muse Glimmer | Run local/partner | Always-on offline core: intent match, coaching text, telemetry interpretation |
| Muse Spark Open (`…-1026`) | Run via Baseten/Modal | Audit reasoning with visible trace; fraud-pattern second opinion |
| Muse Code | — | Build agent (this repo) |

Cost discipline: Wonder plans moments (flow recovery, escalation), never
per-Turn chatter ($4/$20 per Mtok). No Meta TTS exists — TTS stays
`speechSynthesis`; note the gap rather than filling it.

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
against physical specimens sets the final numbers. SAM 3.1 upgrades
pose-delta evidence from stills to identity-preserved tracked motion
through challenge video.

## 5. Voice & generated-UI contract

- Turns stay closed (8 kinds) and intents closed (6); deterministic keyword
  match first, model only for `unknown`, constrained to the six.
- Template-first audio ≤1.5s holds: the deterministic Turn starts playing; a
  late model polish is discarded, not spliced. Generated panels follow the
  same rule — deterministic skeleton first, model fill if back in budget.
- Panel schema (v1 primitives): confirm-row, choice-list, progress-steps,
  evidence-peek, retake-pair. Panels retire when their Turn closes.
- Voice chain: Muse Voice Transcribe (`muse-voice-transcribe-1.0`,
  $0.18/hr) is the primary ASR — utterances, spelled letters, passphrase —
  with Web Speech/typed fallback. Diarization feeds the second-voice
  signal; end-of-speech detection drives barge-in timing.
- Run agency: Muse Wonder conducts the multi-step capture flow and
  replans on faults (the agent behind Aria), under the §3 cost
  discipline.
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
full voice-only run completable with the screen unread. Video (3:00, per
rules): problem 0:20 → clean pass 1:00 → tampered catch 0:55 → Decision +
audit 0:30 → limitations 0:15. Fixture art and coach diagrams come from
Muse Image (anchored series for consistency); MRZ and card-number regions
stay programmatically composed.

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

## 11. Hackathon rules conformance

Source: Cerebral Valley participant guide (rules PDF) + dev.meta.ai model
pages, read 2026-11-02. Binding on the Goal 2 build.

- Problem statement: Build for Your World (Meta models in the
  accessibility domain).
- Model breadth: every listed model has a rostered role (§3) — Model API
  (Spark 1.3, Wonder, Image, Voice Transcribe, SAM 3.1) plus run-weights
  (Glimmer local, Spark Open via Baseten `meta-models/muse-spark-open-1026`
  or Modal). Muse Code is the build agent.
- Superseded assumptions: the meta plan's model table misread the rules —
  "SAM 3" → SAM 3.1 (`sam-3-1`); fixture art moves from Glimmer to Muse
  Image; Glimmer becomes the local always-on core. `src/meta-models.ts`
  still pins `sam-3`/`glimmer` and must be corrected in the Goal 2 build.
- New-work ledger: this repo was created during the event (scaffold Oct 31;
  AU slice + Meta phase + UX + Aria naming all commit inside the Oct 27–
  Nov 4 window). Nothing predates the hackathon; no existing product is
  built upon.
- Demo video: 3:00 with the beats in §9; repo public before submission;
  submission via CV platform by Nov 4, 9:00 PM ET.
- Bonus shots: Best Open Weights (Glimmer local / Spark Open partner),
  Best Creative (Muse Image art series), Best Agentic (Wonder-run Aria).
- Anti-projects: clear. Fraud and distress signals are framed strictly as
  verification inputs, never advice or diagnosis.

## 12. Open items

- [ ] Correct `src/meta-models.ts` pins (`sam-3` → `sam-3-1`, Glimmer API
      role → Muse Image art + Glimmer local core); re-verify live with
      keys on a healthy network.
- [ ] Confirm remaining API model IDs at integration time against the
      Meta model list (`muse-spark-1.3` ✓; Wonder/Image/Transcribe IDs).
- [ ] Claim $150 credits individually; card on file; spend-limit
      notification set.
- [ ] Finalize capture thresholds against physical specimens (pilot).
- [ ] Confirm light-theme exclusion for v1 ([ASSUMPTION] in `DESIGN.md`).
- [ ] Landscape capture layout ([ASSUMPTION] in `EXPERIENCE.md`).
- [ ] Retime video beats to 3:00 in `docs/submission.md` (still says 2:15).
- [ ] Run the validation gate (reviewer lenses) over both spines + this spec.
- [ ] Render key-screen mocks for surfaces where layout drives behavior.
