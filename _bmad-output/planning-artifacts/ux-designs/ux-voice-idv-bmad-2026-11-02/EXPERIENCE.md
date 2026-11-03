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

Mobile-first responsive web (WebRTC camera + Web Speech). No UI system named — Halo inherits the current demo page's proven patterns (single page, transcript mirror, failures-first Decision; `src/index.ts`, served at `/page` — patterns fully restated below, no external lookup needed) and extends them with the Capture surface and generated panels. `DESIGN.md` is the visual identity reference. Dark-first; offline-capable for the full `--no-meta` run.

## Information Architecture

| Surface | Reached from | Purpose |
|---|---|---|
| Assistant | App open (cold) | Conversation home: orb, spoken line, generated panel, transcript |
| Capture | Assistant (per capture stage) | Camera + guides — doc front/back, challenge, selfie — with the frame docked above the input at capture start (placement C; see `.working/capture-placement-compare.html`, A/B rejected), so the viewfinder meets the user at the chat |
| Decision | Capture (run complete) | Verdict, evidence, limitations, Attack Surface panel |
| Consent | Assistant (run start, sheet) | Purpose + capture disclosure + spoken consent |

The assistant generates **panels**, never surfaces: per-Turn UI (field confirmations, retake choices, progress) assembles in the Assistant middle region from the primitives in Component Patterns. IA closes because every Turn kind maps to exactly one surface + panel shape (see Generated UI Contract). [ASSUMPTION] No account/profile surface in v1 — single-run demo posture.

→ Composition: `.working/capture-placement-compare.html` (placement exploration — C chosen, A/B rejected) and `.working/confirm-card-mock.html` (confirm-card illustration) are non-normative exploration. Surfaces build from these tables alone. **Spines win on conflict with any mock.**

## Voice and Tone

Microcopy. Brand voice lives in `DESIGN.md` Brand & Style. The assistant is a calm technician: short imperatives, concrete landmarks, always says what happens next. Every spoken line has a text twin on screen.

**Variation policy.** Fixed meaning, varied form: coaching color owns 2–3 approved surface variants, rotated so the same sentence never sounds twice in a row within a stage. Functional prompts (consent, keep/retake, abort) are exempt — fixed wording there, always. Meaning-identical lines share one transcript tag so SR search still works. This overrides the cockpit fixed-wording inspiration for repeats — consistency lives in the checklist meaning, not the syllables. **Speech shaping:** spoken lines cap at ~12 words, commas shape pauses for the TTS engine, long information splits across turns; the engine stays browser synthesis. The text twin may differ in punctuation from the TTS string if SR/braille testing demands it.

| Do | Don't |
|---|---|
| "Hold your licence up, front facing the camera. Fill the frame." | "Please position your identity document within the designated area." |
| "Tilt the top slightly away from the light — better, hold there." | "Glare detected. Error G-12." |
| "Got the back. Checking the Card Number…" | "Back capture complete. Initiating OCR pipeline." |
| "Verified. All checks passed including the DVS match." | "Congratulations! You're verified! 🎉" |
| State what the check refuses: "motion confirms responsiveness only" | Claim liveness, forgery proof, or certified matching — ever |
| Rotate repeats: "Still on the front — hold steady." / "With you, same capture. Hold there." | The identical sentence twice in a row ("noted, staying on this capture" ×3) |
| Short spoken lines with pause-shaping commas | 20-word drone sentences the TTS flattens |

Regulated-language rule: the assistant may only voice non-claims in their approved negation forms (`challenge_compliance`, `portrait_splice_artifact`, `face_match` uncertified). Generated panels inherit this rule — no generated copy may imply a refused claim.

## Component Patterns

Behavioral. Visual specs live in `DESIGN.md` Components.

| Component | Use | Behavioral rules |
|---|---|---|
| Voice orb | Assistant, Capture | Pulse follows audio energy; tap toggles mute; state always mirrored in text (Listening… / Speaking… / Muted). Mute changes audio output only — text twins and live-region announcements continue; muting itself announces ("Muted. Captions continue."). |
| Spoken line | Assistant, Capture | Exactly one live line; updates per Turn; prior line collapses to transcript. Never edited in place mid-utterance. |
| Capture frame | Capture | Guides per capture kind (brackets/oval/rails); lock flashes ok once + haptic; unlock returns to guide state silently. Docking: at capture start the frame node moves to the dock zone above the input/Listen row and scrolls into view; it returns home when the stage closes. |
| Coach card | Capture | One instruction at a time; new instruction replaces old; pairs with spoken twin; [ASSUMPTION] optional diagram slot renders only when telemetry names a spatial fix (tilt, thumb, corners). Every diagram ships with a text twin at least as specific as the visual. |
| Generated panel | Assistant | Assembled per Turn from primitives (confirm row, choice list, progress steps, evidence peek); every choice has a text equivalent; panel retires when the Turn closes. |
| Confirm card | Capture (docked, see `.working/confirm-card-mock.html`) | After every lock: the captured image (device-local snapshot, never uploaded, `alt=""` decorative) renders in a docked card above the input with a Keep / Retake pair; the caption carries the quality verdict. Before the question, a mandatory spoken + text quality verdict sounds from coaching telemetry ("Front captured: sharp, all four corners in."), then the question names the capture ("Here's the front — keep it, or retake?") — verdict and question are separate turns. Keep/Retake accessible names carry the capture ("Keep document front"). Focus moves to the card heading on appearance and returns to the spoken-line region on retire. One transcript turn logs the step (capture, verdict, decision). A blind keep/retake with no image is a bug; a keep/retake with no non-visual quality statement is the same-weight bug. |
| Transcript turn | Assistant | Append-only mirror; barge-in marks the interrupted line with a polite "Interrupted." note + labeled marker (never color-only); consent + decision turns pinned with a marker; one turn logged per confirm step (capture, verdict, decision). |
| Typed input / Listen row | Assistant, Capture | Persistent fallback: text input with the Listen status line above; placeholder names the voice-unavailable path; focusable without a pointer path. The dock zone sits directly above it. Typing never fails — it is the guaranteed channel. |
| Consent gate | Sheet over Assistant | Blocks all capture until spoken affirm; deny/revoke purges captures and returns to Assistant home. Abort confirm reuses this sheet pattern with purge copy (see Abort state row). |
| Decision banner | Decision | Verdict + tier message first; evidence failures-first; Attack Surface on demand (never auto-fetched on slow networks). |
| Attack Surface panel | Decision | On-demand adversarial audit: explicit Run control beside the evidence list; loading narrates via a progress turn; timeout falls back to local-template hypotheses with an honest tag. Never auto-fetched. |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| Cold open | Assistant | Orb idle; spoken consent prompt; typed input visible (voice may be unavailable). |
| Listening | Assistant, Capture | Orb sky pulse + `Listening…`; 10s silence → re-ask once (never interrupting an in-progress SR announcement; the re-ask itself is polite-queued), then typed-fallback message. |
| Mic denied | Assistant | Announcement names the remedy (browser site settings); orb returns to idle; the run continues typed-only with the input focused. Voice stays offered, never blocking. |
| Coaching | Capture | Coach card + spoken twin; telemetry counters drive escalation (3rd repeat → `warn` turn + offer typed description). |
| Camera starting | Capture | Black preview + `opening camera…` meta + spoken line; guides appear only on the first live frame. |
| Capturing | Capture | Frame guides live; `capturing…` meta label; success = lock flash + check-tick guides + `locked` label + haptic + spoken confirm, then the confirm card shows the image before the keep/retake question. |
| Capture failed | Capture | One silent retry, then the coach card notices + a short spoken line; the run holds on the stage, never advancing past a failed grab. |
| Processing | Assistant | `progress` turns narrate async work (OCR, checks, DVS); generated progress panel shows steps without percentages-as-claims. |
| Decided | Decision | Banner + evidence + limitations; audit panel on demand; transcript retained below. |
| Offline / degraded | Global | No banner for local fallback (templates are first-class); model-backed extras (audit, polish) show provider tags (`Spark` vs `local templates`) honestly. |
| Camera denied | Capture | Coach card explains + offers typed/manual path; run parks (never auto-continues without capture). |
| Abort | Any | `abort_confirm` turn + sheet; confirm purges captures, returns to Assistant home. |

## Interaction Primitives

**Voice-first, touch-honest.** Speech is primary; every voice action has a visible equivalent.

- Speak to answer (closed intents); any prompt is barge-inable — interruption stops synthesis immediately and the partial line is marked with a polite "Interrupted." note + labeled transcript marker.
- Tap generated-panel choices as an alternative to speaking them; tap orb to mute/unmute.
- Type in the persistent input as the always-available fallback (voice may fail; typing never does).
- Retake offered after every capture lock: image first in the confirm card, quality verdict, then `Keep` / `Retake` spoken + tapped; no capture is final without it. Confirmation is recognition-tolerant — near-miss utterances ("kep it") resolve to the intended choice; every resolution echoes in the spoken twin + text ("Keeping the front.") and the transcript records heard → resolved; low-confidence near-misses re-ask instead of resolving.
- **Banned:** wake words, open-ended chat input, synthesized percentages ("87% confident"), auto-advancing past consent, hover-only affordances, generated navigation.

## Accessibility Floor

Behavioral. Visual contrast lives in `DESIGN.md`.

- Full run completable by voice + haptics with the screen unread — the founding requirement. Every capture stage announces state changes (`Front locked. Now flip the card.`).
- Screen reader: surfaces announce on entry ("Capture, document front, guidance active"); coach-card updates via `aria-live` polite; verdict via assertive once. TTS/SR arbitration: the spoken-line text twin IS the single live region — TTS and SR are never fed duplicate strings; when a screen reader is detected, self-voicing TTS yields to SR announcements (user toggle to override). Confirm-card arrival is assertive (`role="alertdialog"` semantics) and always ordered after the quality verdict.
- Reduced motion: orb glow static, no frame flash (hold ok-state instead), no panel transitions.
- Haptic ticks on capture lock and decision (where available); never the sole signal — always paired with speech.
- Tap targets ≥ 44pt with ≥ 8px gaps (Keep/Retake pair included); focus order follows reading order; typed input focusable without a pointer path. Docking never moves the focused element; retiring a focused node moves focus to its named restore target before removal.
- Captions: every spoken line appears as text within the same Turn (no audio-only information except the consent recording itself, which is transcribed). Muted runs still render every twin — mute never stops captions.

## Key Flows

### Flow 1 — Clean pass (Sienna, grad student in Melbourne, verifying for a rental application)

1. Sienna opens the app; the assistant speaks the consent prompt and shows the consent gate.
2. She says "I consent"; the capture frame docks above the input on the document-front stage with corner-bracket guides — no scrolling back to find it.
3. She holds up her licence; telemetry sees glare on the hologram — coach card + voice: "Tilt the top slightly away from the light — better, hold there."
4. Frame locks (flash + tick + "Good framing — captured front"); the image appears in the docked confirm card, the verdict speaks ("Front captured: sharp, all four corners in."), then the question ("Here's the front — keep it, or retake?") — and she keeps it. Back, challenge, and selfie stages follow the same coach→lock→confirm rhythm.
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

| Primitive | Rule |
|---|---|
| Confirm row | Field label + value + one confirm action; read-only, no editing inline. |
| Choice list | Tappable options, each with a text equivalent; the spoken twin lists the options. |
| Progress steps | Step chips with done/active states; no percentages-as-claims. |
| Evidence peek | Collapsed evidence excerpt; expands toward the full Decision list, never decides early. |
| Retake pair | Keep / Retake with stage-context accessible names; always paired with the confirm-card image. |
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
| Doc front/back | 1600px long edge [ASSUMPTION] | Laplacian ≥ 120 [ASSUMPTION] | no blown region over machine zone | all 4 corners in frame | MRZ/card-number region contrast ≥ 3:1 [ASSUMPTION] |
| Challenge frames | 720p [ASSUMPTION] | face oval ≥ 25% frame [ASSUMPTION] | n/a | face centered ±15% [ASSUMPTION] | pose delta measurable across 3+ frames [ASSUMPTION] |
| Selfie | 1080px long edge [ASSUMPTION] | face sharp (eyes open) | no face blowout | oval fill 60–90% [ASSUMPTION] | matchable crop (uncertified band only) |

## Voice-Camera Choreography

Product-specific: who speaks when while the camera is live.

- The camera never opens silently: an `instruct` turn names the capture and the landmark before guides appear.
- During active guidance, speech is throttled to one instruction per fault episode (no chatter while the user is mid-correction); the coach card holds the instruction visually meanwhile.
- Lock is always shown, then announced: the captured image renders in the confirm card first, then the quality-verdict turn, then the spoken confirm + keep/retake question. A silent capture is a bug; a blind keep/retake is a bug; a verdict-less keep/retake is a bug.
- The microphone yields to capture sounds: guidance pauses while the shutter/frame grab runs, then resumes. Barge-in stays live throughout — the user can always interrupt.
- Comparing is narrated, never silent: at least one `progress` turn covers OCR→checks→DVS, more if it runs long.

## Inspiration & Anti-patterns

- **Lifted from airline cockpit voice (callouts):** short, standard meaning per situation; repeats rotate among approved surface variants so the checklist never sounds canned. Coaching is a checklist read aloud by a human, not a recording.
- **Lifted from camera apps (lock-on guides):** guides that turn green on lock — the user already knows this language from face-detect rectangles.
- **Lifted from live-caption systems:** every utterance mirrored in text within the Turn; the screen is the accessible record, not a second channel to monitor.
- **Rejected — open chat ("How can I help?"):** open-ended dialogue lets the model improvise flow; closed Turns keep the run decidable and testable.
- **Rejected — gamified capture (scores, stars):** capture quality is an instrument reading, not a reward; scores invite gaming the frame instead of holding still.
- **Rejected — silent auto-capture:** a capture the user didn't confirm is a consent violation wearing a convenience costume.
- **Rejected — verbatim repeats:** the identical sentence twice in a row reads as a machine stuck in a loop, however true the words.
- **Rejected — blind keep/retake:** asking Keep or Retake without showing the capture forces the user to judge from memory.

## Responsive & Platform

| Breakpoint | Behavior |
|---|---|
| Mobile portrait (primary) | Full experience: Assistant + Capture + Decision; capture frame docked above the input at capture start; coach card paired with it. |
| Mobile landscape | Capture guides compress to safe area; spoken line docks top; coach card side-docks. [ASSUMPTION] |
| Tablet / desktop (observer) | Same run, wider reading surface (56rem max); transcript beside panels; camera via device cam or fixture stand-in for demo. |

Primary surface is the phone in hand. Desktop is the sighted-observer and demo-projection surface — same flow, more transcript visible.
