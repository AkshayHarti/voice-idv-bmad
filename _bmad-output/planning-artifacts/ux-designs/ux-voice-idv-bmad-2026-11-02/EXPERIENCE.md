---
name: Halo
status: final
sources:
  - docs/specs/2026-10-31-au-voice-idv-spec.md
  - docs/plans/2026-10-31-voice-idv-meta.md
  - docs/seeds/
updated: 2026-11-02
---

# Halo — Experience Spine

> Futuristic voice-assistant UX for identity verification and onboarding. The assistant speaks, sees through the camera, and generates the UI each Turn needs — guiding captures until images are model-grade for the Muse models. Paired with `DESIGN.md` (Halo visual identity). Mobile-first camera product; the deterministic decision core is unchanged and out of scope for this spine.

## Foundation

Mobile-first responsive web (WebRTC camera + Web Speech). No UI system named — Halo inherits the current demo page's proven patterns (single page, transcript mirror, failures-first Decision) and extends them with the Capture surface and generated panels. `DESIGN.md` is the visual identity reference; all `{path.to.token}` references below resolve against it. Dark-first; offline-capable for the full `--no-meta` run.

## Information Architecture

| Surface | Reached from | Purpose |
|---|---|---|
| Assistant | App open (cold) | Conversation home: orb, spoken line, generated panel, transcript |
| Capture | Assistant (per capture stage) | Full-bleed camera: doc front/back, challenge, selfie |
| Decision | Capture (run complete) | Verdict, evidence, limitations, Attack Surface panel |
| Consent | Assistant (run start, sheet) | Purpose + capture disclosure + spoken consent |

The assistant generates **panels**, never surfaces: per-Turn UI (field confirmations, retake choices, progress) assembles in the Assistant middle region from the primitives in Component Patterns. IA closes because every Turn kind maps to exactly one surface + panel shape (see Generated UI Contract). [ASSUMPTION] No account/profile surface in v1 — single-run demo posture.

→ Composition: spine-only in v1 (no mocks rendered; fast path). Surfaces build from these tables alone.

## Voice and Tone

Microcopy. Brand voice lives in `DESIGN.md` Brand & Style. The assistant is a calm technician: short imperatives, concrete landmarks, always says what happens next. Every spoken line has a text twin on screen.

| Do | Don't |
|---|---|
| "Hold your licence up, front facing the camera. Fill the frame." | "Please position your identity document within the designated area." |
| "Tilt the top slightly away from the light — better, hold there." | "Glare detected. Error G-12." |
| "Got the back. Checking the Card Number…" | "Back capture complete. Initiating OCR pipeline." |
| "Verified. All checks passed including the DVS match." | "Congratulations! You're verified! 🎉" |
| State what the check refuses: "motion confirms responsiveness only" | Claim liveness, forgery proof, or certified matching — ever |

Regulated-language rule: the assistant may only voice non-claims in their approved negation forms (`challenge_compliance`, `portrait_splice_artifact`, `face_match` uncertified). Generated panels inherit this rule — no generated copy may imply a refused claim.

## Component Patterns

Behavioral. Visual specs live in `DESIGN.md` Components.

| Component | Use | Behavioral rules |
|---|---|---|
| Voice orb | Assistant, Capture | Pulse follows audio energy; tap toggles mute; state always mirrored in text (Listening… / Speaking… / Muted). |
| Spoken line | Assistant, Capture | Exactly one live line; updates per Turn; prior line collapses to transcript. Never edited in place mid-utterance. |
| Capture frame | Capture | Guides per capture kind (brackets/oval/rails); lock flashes ok once + haptic; unlock returns to guide state silently. |
| Coach card | Capture | One instruction at a time; new instruction replaces old; pairs with spoken twin; [ASSUMPTION] optional diagram slot renders only when telemetry names a spatial fix (tilt, thumb, corners). |
| Generated panel | Assistant | Assembled per Turn from primitives (confirm row, choice list, progress steps, evidence peek); every choice has a text equivalent; panel retires when the Turn closes. |
| Transcript turn | Assistant | Append-only mirror; barge-in marks the interrupted line; consent + decision turns pinned with a marker. |
| Consent gate | Sheet over Assistant | Blocks all capture until spoken affirm; deny/revoke purges captures and returns to Assistant home. |
| Decision banner | Decision | Verdict + tier message first; evidence failures-first; Attack Surface on demand (never auto-fetched on slow networks). |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| Cold open | Assistant | Orb idle; spoken consent prompt; typed input visible (voice may be unavailable). |
| Listening | Assistant, Capture | Orb sky pulse + `Listening…`; 10s silence → re-ask once, then typed-fallback message. |
| Coaching | Capture | Coach card + spoken twin; telemetry counters drive escalation (3rd repeat → `warn` turn + offer typed description). |
| Capturing | Capture | Frame guides live; `capturing…` meta label; success = lock flash + haptic + spoken confirm. |
| Processing | Assistant | `progress` turns narrate async work (OCR, checks, DVS); generated progress panel shows steps without percentages-as-claims. |
| Decided | Decision | Banner + evidence + limitations; audit panel on demand; transcript retained below. |
| Offline / degraded | Global | No banner for local fallback (templates are first-class); model-backed extras (audit, polish) show provider tags (`Spark` vs `local templates`) honestly. |
| Camera denied | Capture | Coach card explains + offers typed/manual path; run parks (never auto-continues without capture). |
| Abort | Any | `abort_confirm` turn + sheet; confirm purges captures, returns to Assistant home. |

## Interaction Primitives

**Voice-first, touch-honest.** Speech is primary; every voice action has a visible equivalent.

- Speak to answer (closed intents); any prompt is barge-inable — interruption stops synthesis immediately and the partial line is marked.
- Tap generated-panel choices as an alternative to speaking them; tap orb to mute/unmute.
- Type in the persistent input as the always-available fallback (voice may fail; typing never does).
- Retake offered after every capture lock (`Keep` / `Retake` spoken + tapped); no capture is final without it.
- **Banned:** wake words, open-ended chat input, synthesized percentages ("87% confident"), auto-advancing past consent, hover-only affordances, generated navigation.

## Accessibility Floor

Behavioral. Visual contrast lives in `DESIGN.md`.

- Full run completable by voice + haptics with the screen unread — the founding requirement. Every capture stage announces state changes (`Front locked. Now flip the card.`).
- Screen reader: surfaces announce on entry ("Capture, document front, guidance active"); coach-card updates via `aria-live` polite; verdict via assertive once.
- Reduced motion: orb glow static, no frame flash (hold ok-state instead), no panel transitions.
- Haptic ticks on capture lock and decision (where available); never the sole signal — always paired with speech.
- Tap targets ≥ 44pt; focus order follows reading order; typed input focusable without a pointer path.
- Captions: every spoken line appears as text within the same Turn (no audio-only information except the consent recording itself, which is transcribed).

## Key Flows

### Flow 1 — Clean pass (Sienna, grad student in Melbourne, verifying for a rental application)

1. Sienna opens the app; the assistant speaks the consent prompt and shows the consent gate.
2. She says "I consent"; the Capture surface opens on the document-front stage with corner-bracket guides.
3. She holds up her licence; telemetry sees glare on the hologram — coach card + voice: "Tilt the top slightly away from the light — better, hold there."
4. Frame locks (flash + tick + "Good framing — captured front"); back, challenge, and selfie stages follow the same coach→lock rhythm.
5. Assistant narrates comparing ("Checking your details now…"); the Decision surface renders.
6. **Climax:** the verdict speaks — "Verified. All checks passed including the DVS match" — while the failures-first evidence list (all pass) and limitations sit on screen for the letting agent beside her. Voice decided nothing; the checks did.

Failure: camera denied at step 2 → coach card explains, run parks; nothing auto-continues.

### Flow 2 — Tampered catch (Tom, night-shift nurse in Brisbane, testing the demo with a seeded fixture)

1. Tom starts a run on the tampered-passport path; consent and capture proceed like Flow 1.
2. Comparing completes; the Decision surface renders with failures on top.
3. **Climax:** the assistant speaks the failure plainly — "One check failed: the document-number check digit. Computed 8, printed 7." — while the evidence list shows the mismatch first. Then Tom taps Run adversarial audit and hears how the run could have been fooled and what caught it.
4. He replays the transcript to confirm every Turn is mirrored in text.

Failure: model audit times out → local-template hypotheses render with an honest `local templates` tag; the Decision is unaffected.

## Generated UI Contract

Product-specific: the rules under which the assistant may generate interface.

- Panels are assembled per Turn from approved primitives only (confirm row, choice list, progress steps, evidence peek, retake pair). The assistant selects and fills; it never invents widgets, surfaces, or navigation.
- Every generated panel binds to the current closed Turn kind — a panel for a Turn that never fired is a bug. Panel content is data-bound (fixture fields, telemetry, check results), never free prose, except the spoken twin which follows Voice and Tone.
- Prohibitions: no generated copy implying refused claims; no synthesized confidence language; no decision-adjacent chrome before `decided` (no "looks good so far" panels); no auto-dismiss of consent, abort, or verdict content.
- Provenance: model-assembled panels carry a provider tag when the model touched them (`Spark` vs `local templates`), same honesty rule as audit hypotheses.

## Capture Guidance System

Product-specific: how captures become model-grade.

- Telemetry (edge, ~5Hz): document quad + corner coverage, focus score, glare map, occlusion map, moiré score, face oval + pose, ambient light estimate. Full frames only on capture trigger.
- Coaching map: each telemetry fault maps to one coach instruction + spoken twin (glare→tilt, occlusion→move thumb, skew→straighten, blur/dark→light + steadiness, moiré→physical-card prompt, missing-back→flip prompt). Counters escalate: 3rd repeat of the same fault → `warn` turn + alternative path.
- Muse-model image criteria per capture (minimums for the model path; deterministic fallbacks hold below them):

| Capture | Min resolution | Focus | Glare | Framing | Legibility |
|---|---|---|---|---|---|
| Doc front/back | 1600px long edge | Laplacian ≥ 120 [ASSUMPTION] | no blown region over machine zone | all 4 corners in frame | MRZ/card-number region contrast ≥ 3:1 [ASSUMPTION] |
| Challenge frames | 720p | face oval ≥ 25% frame | n/a | face centered ±15% | pose delta measurable across 3+ frames |
| Selfie | 1080px long edge | face sharp (eyes open) | no face blowout | oval fill 60–90% | matchable crop (uncertified band only) |

## Voice-Camera Choreography

Product-specific: who speaks when while the camera is live.

- The camera never opens silently: an `instruct` turn names the capture and the landmark before guides appear.
- During active guidance, speech is throttled to one instruction per fault episode (no chatter while the user is mid-correction); the coach card holds the instruction visually meanwhile.
- Lock is always announced (flash + tick + spoken confirm) — a silent capture is a bug.
- The microphone yields to capture sounds: guidance pauses while the shutter/frame grab runs, then resumes. Barge-in stays live throughout — the user can always interrupt.
- Comparing is narrated, never silent: at least one `progress` turn covers OCR→checks→DVS, more if it runs long.

## Inspiration & Anti-patterns

- **Lifted from airline cockpit voice (callouts):** short, standard phrasing per situation; the same fault always gets the same words. Coaching is a checklist read aloud, not a conversation.
- **Lifted from camera apps (lock-on guides):** guides that turn green on lock — the user already knows this language from face-detect rectangles.
- **Lifted from live-caption systems:** every utterance mirrored in text within the Turn; the screen is the accessible record, not a second channel to monitor.
- **Rejected — open chat ("How can I help?"):** open-ended dialogue lets the model improvise flow; closed Turns keep the run decidable and testable.
- **Rejected — gamified capture (scores, stars):** capture quality is an instrument reading, not a reward; scores invite gaming the frame instead of holding still.
- **Rejected — silent auto-capture:** a capture the user didn't confirm is a consent violation wearing a convenience costume.

## Responsive & Platform

| Breakpoint | Behavior |
|---|---|
| Mobile portrait (primary) | Full experience: Assistant + Capture + Decision; camera full-bleed; coach card bottom-docked. |
| Mobile landscape | Capture guides compress to safe area; spoken line docks top; coach card side-docks. [ASSUMPTION] |
| Tablet / desktop (observer) | Same run, wider reading surface (56rem max); transcript beside panels; camera via device cam or fixture stand-in for demo. |

Primary surface is the phone in hand. Desktop is the sighted-observer and demo-projection surface — same flow, more transcript visible.
