---
title: 'Goal 2: assistant surfaces (Capture, panels, Halo reframe)'
type: 'feature'
created: '2026-11-02'
status: 'done'
route: 'dispatch'
baseline_commit: 2c9d55af6fa6c5792069bd8a8d5b67665ec38c04
review_loop_iteration: 1
context: ["{project-root}/docs/specs/2026-11-02-voice-assistant-idv-spec.md", "{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-voice-idv-bmad-2026-11-02/DESIGN.md", "{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-voice-idv-bmad-2026-11-02/EXPERIENCE.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The demo is a form that talks — typed-first, fixture-driven, no camera — with a static Decision screen and pre-Halo styling.

**Approach:** Build the assistant surfaces per Rev 2 §§3–5/10 plus the Halo spines: a live Capture surface with telemetry/coach loop, a server-side UI generator plus panel schema with the Decision screen migrated onto it, and a Halo reframe of page copy and tokens — with the decision core frozen and `--no-meta` parity intact. (Decided: Capture uses a real getUserMedia viewfinder with lightweight client-side heuristics; pin corrections and fraud-matrix inputs are deferred to later builds.)

## Boundaries & Constraints

**Always:** Keep the decision core frozen (`runChecks`/`decide` conjunction, `CheckResult`/`Decision`/`Measurements` shapes, check ids and evidence strings, DVS shape, tier rule). Keep Turns (8) and intents (6) closed, stages backend-owned, `signal()` the sole advancer. Keep consent gating with deny-purge extended to captures and crops. Keep `npm test` green throughout — fixtures remain the suite. Capture opens a live viewfinder with client-side heuristics (~5Hz) driving `coach()`; the fixture stand-in applies only when the camera is denied or unavailable. (Decided in review loopback 1: v1 heuristics cover dark/glare/blur live; skew/occlusion/moiré send 0 pending the physical-specimen pilot — accepted limitation.) Telemetry emits persistent-fault counters and moiré flags for the deferred fraud-input work to consume. Honor the non-claims vocabulary, the Generated UI Contract prohibitions (no invented surfaces/flow, no verdict-adjacent chrome pre-decision, no auto-dismiss of consent/abort/verdict, provider tags on model-touched panels), and deterministic-skeleton-first for audio and panels. Every lock is announced (flash + haptic + spoken confirm). Telemetry is computed client-side; no viewfinder frames are uploaded or stored. API additions are additive only — every new key gets an updated snapshot test, never a silent snapshot edit.

**Never:** Change the check engine, conjunction, tier rule, DVS, Turn/intent sets, or TTS/ASR providers; correct Meta model pins or touch model selection, pricing, or the art script (deferred); extend fraud-matrix inputs (deferred); make any live Meta network call in build or tests; add open chat, wake words, synthesized confidence, a light theme, or generated navigation; auto-advance past consent or auto-continue a parked run; do submission-docs work, mocks, or the reviewer-lens validation gate.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Live viewfinder | camera granted | full-bleed preview with guides; heuristics sample ~5Hz into `coach()` | camera errors mid-run park the run with an explanation |
| Coach fault map | telemetry sample, one fault over threshold | `coach()` returns the mapped Turn with fixed checklist wording (glare→tilt, occlusion→thumb, skew→straighten, blur/dark→light+steadiness, moiré→physical-card, missing-back→flip) | N/A |
| Persistent fault | same fault on the 3rd consecutive sample | `warn` Turn plus typed-description alternative path; run parks (Rev 2 §4 supersedes the AU close-run escalation) | never auto-pass, never auto-continue |
| Capture lock | lock-ready telemetry plus user confirm | guides flash ok once + haptic + spoken confirm; capture stored as signed ref | a silent capture is a bug — lock without announce fails acceptance |
| Retake pair | every locked capture | Keep/Retake panel, spoken and tappable; no capture final without it | N/A |
| Camera denied | getUserMedia denied or no camera | coach card explains + fixture stand-in path; run parks | never auto-continues without capture |
| Panel bind | any fired Turn | exactly one panel from approved primitives, data-bound; retires on Turn close | unknown shape fails closed to text-only; model timeout → skeleton stands, late fill discarded |
| Decision content | run complete | verdict + tier + failures-first evidence + limitations + on-demand audit, same content via generated panels | pre-decision decision-adjacent chrome is a bug |
| No-meta parity | every fixture under `--no-meta` | decisions byte-identical before/after this change | any drift fails the build |

</frozen-after-approval>

## Code Map

- `src/index.ts` -- Hono app; `evaluateFixture` (:92-112) decides, `reportFor` (:272) attaches reports; `GET /page` (:340) serves the inline `PAGE` app (:344-724, single `<style>` + single module `<script>`); `renderReport` (:525-594) is the static Decision renderer to migrate; `drive()` (:598-618) auto-posts capture signals (fixture stand-in to keep behind Capture)
- `src/flow.ts` -- `Stage` 10 states (:20-30), `Intent` 6 (:33), `TurnKind` 8 (:36-44); `say()` (:132) resolves consent/prompts only, `signal()` (:237) is the sole advancer; consent gate (:115-156), DL-back parking (:187-194, :251-256)
- `src/telemetry.ts` -- existing `coach()` (:38) with priority screenshot→missingBack→glare→finger→skew→dark and `COACHING_RETRY_LIMIT = 3`; extend fault set (moiré), change ≥3 escalation to warn + alternative path, add lock-ready predicate, emit counters/flags for deferred fraud work
- `src/meta-models.ts`, `src/providers.ts`, `src/audit.ts`, `scripts/glimmer-art.mjs` -- DEFERRED (pin corrections); do not touch
- `src/fraud.ts` -- DEFERRED (capture inputs); do not touch
- `src/checks.ts`, `src/dvs.ts`, `src/mrz.ts`, `src/au_dl.ts`, `src/measurements.ts`, `src/redact.ts`, `src/fixtures.ts` -- frozen or untouched; fixtures stay the suite
- `test/` -- `node --test` over `dist/` after `tsc`; parity in `meta-demo.test.js:39,40,56`, `api.test.js:62-67`; `aria.test.js` snapshots per-endpoint key sets (update deliberately for additive panel/capture keys only)
- Do not change: check ids/evidence strings, conjunction, tier/userMessage split, Turn/Stage sets, narration prompts, model pins/selection, `README.md`

## Tasks & Acceptance

**Execution:**
- [x] `src/telemetry.ts` -- extend fault set (moiré + capture criteria), switch ≥3 escalation to `warn` + typed-description alternative, add lock-ready predicate, emit persistent-fault counters and moiré flags — the coach loop Rev 2 §4 requires, with the seam for deferred fraud inputs
- [x] `src/panels.ts` (NEW) -- UI generator: pure `(TurnKind, stage, data)` → schema-validated panel tree from confirm-row/choice-list/progress-steps/evidence-peek/retake-pair; unknown shapes fail closed to text-only; provider-tag threading — the fenced generation of Rev 2 §3/§5
- [x] `src/flow.ts` -- attach the generated panel to Turn payloads; handle warn-escalation and the alternative path without client-driven advance — binds panels to fired Turns only
- [x] `src/index.ts` -- add capture/telemetry API surface, reframe `PAGE` to Halo tokens and assistant posture (orb, spoken-line hero, live viewfinder + capture frame, single-replace coach card, panel renderer, retake pair), keep the fixture stand-in for denied/unavailable camera, extend deny-purge to captures — the three surfaces of EXPERIENCE.md
- [x] `test/` -- add coach-map/escalation/lock tests, panel-schema tests (every Turn kind binds, unknown → text fallback, tags), capture-flow tests (lock/retake/deny-park); deliberately update aria key-set snapshots for additive panel/capture keys — fixtures plus new suites stay green

**Review fixes (loopback 1 — all must survive re-derivation):**
- [x] `src/flow.ts` -- unknown intent in capture stages returns a capture-context acknowledge-and-hold turn (no advance, no pass), never the consent-oriented re-ask — makes the typed-description alternative path function end to end
- [x] `src/index.ts` -- retake with nothing pending 409s `nothing_to_keep`-style (`nothing_to_retake`) instead of appending a phantom Turn — closes verdict-turn clobber via API
- [x] `src/index.ts` -- sampleTick overlaps: guard on strict `sampling === true` so slow round-trips never double-post — stops counter double-counting and coach/lock flicker
- [x] `src/index.ts` -- camera track `onended` mid-run routes to the camera-denied park path — the matrix's "camera errors mid-run park the run" case
- [x] `src/telemetry.ts` -- screenshot/missingBack checks are truthy (not `=== true`) so `1` cannot slip through as lock-ready — with a test posting truthy non-true
- [x] `src/index.ts` -- purgeCaptures also resets faultCounts and lastCoachText — in-session restarts must not inherit a streak toward instant warn
- [x] `src/panels.ts` -- warn panel drops the dead `retry` choice (describe stays the alternative); client drops the no-op handler — no dead controls
- [x] `src/index.ts` -- lastCoachText resets on stage advance — the same fault re-announces on a new stage
- [x] `src/index.ts` -- startCapture requests `user` facing mode for challenge/selfie stages, `environment` for documents — selfies frame on phones
- [x] `test/` -- decided-step test asserts `panel.evidence` deep-equals `report.failedFirst` order on a mixed-result fixture — pins the failures-first migration contract
- [x] `test/` -- telemetry-signal parking test loops all four capture stages (front/back/challenge/selfie), asserting stage unchanged + warn guidance at each

**Acceptance Criteria:**
- Given `npm test`, when run, then every test passes with zero failures (live-meta skips allowed only without keys in env)
- Given GET /page, when inspected, then Halo tokens render (dark console, sky voice states, frame-blue guides) with one live spoken line and a single-replace coach card
- Given every `/api/*` route, when key sets are compared pre/post change, then only additive panel/capture keys differ and each is covered by an updated snapshot test
- Given a full run, when driven by voice + haptics with the screen unread, then every Turn has a text twin and every capture state change is announced (manual check)

## Implementation Notes

- Dispatch implementer report (verified against the diff, not taken on trust): telemetry/panels/flow/index/tests per tasks; `npx tsc --noEmit` clean; suite 67 tests / 66 pass / 0 fail / 1 skip (live-meta, no key) — reproduced in the parent session.
- No model-fill path was built for panel copy: panels are template-only, so the skeleton-stands rule holds vacuously. Model polish arrives with a future path, not this build.
- Client heuristics are coarse (brightness/glare/variance over a 32px peek; skew/occlusion/moiré sent as 0). Real moiré/occlusion detection awaits the physical-specimen pilot.
- Manual-only AC (voice+haptics screen-unread run, on-device camera lock/deny) is covered by structure (assertive verdict, polite coach, text twins, announceLock) but was not executed — needs a real device.
- Loopback 1: review triaged 30 findings (1 intent_gap, 13 patch rows in 11 entries, 3 defer rows in 2 entries, 13 rejected). Code reverted to baseline (suite back to 40/39/0/1); human accepted v1 zero-heuristics (recorded in frozen block). Re-derivation must include all 11 review-fix items above.
- Re-derivation verified against the diff: all 5 tasks + 11 review fixes present; suite 78 tests / 77 pass / 0 fail / 1 skip (live-meta, no key) reproduced in the parent session. Parent added wrong_stage/unknown_action key-shape assertions to the aria error-shapes test (AC3 letter: every new key covered by a snapshot); suite still green after. Fallback primitive is named `text` (descriptive "text-only" fallback per matrix); template-only panels so the skeleton rule holds vacuously. Manual-only AC still unexecuted — needs a real device.

## Spec Change Log

## Review Triage Log

- blind/escalation-text-generic: `false` — coach() ≥3 branch is fault-agnostic by design; the hardcoded glare sample yields byte-identical text to any real fault, so no wrong text ships.
- blind/signref-forgeable: `false` — refs are server-generated opaque ids never accepted back by any endpoint; nothing verifies them, so forgery crosses no trust boundary (naming follows the spec's "signed refs" term).
- blind/client-telemetry-trust: `false` — client-computed telemetry with user confirm + Keep/Retake is the spec'd architecture (no frames leave the device); a client that skips sampling harms only its own run.
- blind/pending-overwrite: `low` — a second API lock overwrites pendingCapture and burns a seq number; the orphan is a forgotten string and both locks leave transcript lines. Rejected: UI-unreachable (lock button stays disabled while pending) and the fix adds a branch.
- blind/keep-before-signal: `false` — stage is 409-verified before the push and every verified stage+event pair advances in signal(), so store-without-advance is unreachable.
- blind/retake-no-pending: `medium` — retake with nothing pending returns retaken:true, appends a transcript Turn, and overwrites last_turn (clobbers a decided verdict Turn via API). Grouped with edge/retake-no-pending. Patch: 409 nothing_to_retake mirroring keep.
- blind/typed-description-deadend: `medium` — descriptions fall through to unknown and get the consent-oriented re-ask, a dead end for the spec'd alternative path. Patch: never-auto-pass forces exactly one reading (acknowledge + hold, coaching continues), so say() gets a stage-aware unknown response for capture stages.
- blind/retry-dead-button: `low` — warn panel "Keep trying" handler returns without action. Patch: remove the dead choice (describe stays the alternative).
- blind/sayfor-deny: `false` — matchIntent("not ready") hits the deny regex (flow.ts:135), so the consent panel's deny choice routes correctly.
- blind/zero-heuristics: `low` — skew/occlusion/moiré are hardcoded 0 on live runs, so those branches never coach and lockReady passes skewed frames; bounded by visible guides + user confirm + retake + planned pilot. intent_gap: human must accept v1 zeros or require fuller heuristics.
- blind/selfie-facing-mode: `low` — startCapture always requests environment facing, wrong for user-facing challenge/selfie stages on phones. Patch: facingMode per kind (user for challenge/selfie).
- blind/telemetry-unfired-panel: `false` — the client renders the telemetry panel only when announced (sampleTick guards on res.announced), so panels for unfired repeat-episode turns are discarded, not shown.
- blind/seam-not-persisted: `false` — counters persist server-side in Session.faultCounts across samples (that is how consecutive counting works); fraud consumption is explicitly deferred work.
- blind/coach-text-stage-reset: `low` — lastCoachText persists across stages, so the same fault on the next stage is not re-announced. Patch: reset on stage advance.
- blind/purge-keeps-counters: `low` — purgeCaptures leaves faultCounts/lastCoachText, so an in-session restart ("Say ready to start over" reuses the session) inherits a streak toward instant warn. Grouped with edge/purge-counters. Patch: reset both in purgeCaptures.
- blind/transcript-after-purge: `false` — Rev 2 §8 requires purging captures and crops, not flags; transcript lines are spoken text (the audit record), not captures, and keeping them matches baseline behavior.
- blind/stale-autopark-turn: `low` — backMissing auto-park keeps the old last_turn/panel while awaiting back. Defer: pre-existing (unchanged context lines), panels only render the existing turn.
- blind/result-reruns-checks: `low` — resultTurn re-runs runChecks; deterministic duplicate with trivial cost, and the throw path is unreachable (decided implies known-good fixture). Rejected: negligible harm, fix adds plumbing.
- blind/page-tests-literal: `low` — page.test.js asserts source literals without executing flows. Grouped with vgap/announced-lock (same no-harness root cause). Defer: run the manual on-device gate.
- vgap/evidence-order: `medium` — no test pins decided panel.evidence order; an inverted rankResult ships passes-first with the suite green. Patch: assert panel.evidence deep-equals failedFirst order on a mixed fixture.
- vgap/park-stages: `medium` — coach_warn/camera_denied parking tested only at awaiting_doc_front; other stages could lose warn guidance silently. Patch: loop all four capture stages in the flow test.
- vgap/announced-lock: `medium` — page test cannot observe the announceLock call site; deleting it ships silent captures green. Grouped with blind/page-tests-literal. Defer: no browser harness exists; run the manual on-device lock acceptance as the gate.
- edge/truthy-screenshot: `low` — screenshot:1/missingBack:1 bypass === true and read lock-ready via API. Patch: truthy checks + test.
- edge/bad-provider: `false` — data.provider is typed PanelProvider and no caller passes provider at all; TypeScript prevents the trigger, so no invalid panel ships.
- edge/telemetry-wrong-stage: `low` — telemetry posted outside capture stages appends coach lines and spans counters. Rejected: the real client never posts there (sampling stops with the camera) and the fix adds a new branch.
- edge/purge-counters: `low` — same defect as blind/purge-keeps-counters (counters survive deny); grouped there. Patch.
- edge/retake-no-pending: `medium` — same defect as blind/retake-no-pending (verdict-turn clobber via API); grouped there. Patch.
- edge/telemetry-overlap: `medium` — sampleTick's 'busy' flag is truthy so slow round-trips overlap posts, double-counting counters and flickering coach/lock. Patch: strict sampling===true guard.
- edge/track-ended: `low` — a camera track ending mid-run has no onended handler; the run stalls or locks a frozen frame. Matrix settles it ("camera errors mid-run park the run"). Patch: onended → cameraDenied.
- edge/preframe-sample: `maybe-false` — whether a pre-frame drawImage throws (zeros → lock-ready) or draws black (dark fault → guidance) is browser-dependent and undecidable from the diff. Rejected as low-if-true: a blank lock needs an instant user confirm with instant retake available; a readyState guard would settle it.
- r2blind/lock-no-readiness: `false` — handleLock takes no telemetry by design; the client gates the button on lockReady and a lying client could pass `{}` anyway, so no server check could defend anything (round-1 B3 grounds). Grouped with r2edge/lock-during-fault.
- r2blind/telemetry-no-stage-guard: `low` — carried edge/telemetry-wrong-stage: real client never posts outside capture stages and the fix adds a branch. Rejected, no new action.
- r2blind/second-lock-overwrite: `low` — carried blind/pending-overwrite: UI-unreachable orphan string with transcript trace. Rejected, no new action.
- r2blind/lockref-random: `false` — refs are never accepted back for verification; per-session seq makes same-session collision impossible and cross-session collision meaningless (no shared namespace).
- r2blind/telemetry-validation: `low` — NaN/Infinity/strings read clean, "false" counts as fault, no 0–1 clamp; all require malformed clients (ours sends clean numbers). Grouped with r2edge/string-flags. Rejected: unlikely met and coercion rules add branches.
- r2blind/narrate-per-sample: `medium` — stepBody narrates every 5Hz sample, so keyed runs spam the model chain (cost + stall) for turns the client discards. Patch: template narration when !announced.
- r2blind/denied-no-halt: `low` — denied branch leaves counters/suppression untouched so later samples overwrite the park turn. Rejected: real client stops sampling on deny, fix adds branches.
- r2blind/peek-tag-tier-empty: `false` — no model-touched panel exists (tag rule vacuous); tier message is shown and the raw value never was; empty evidence needs the unreachable decidedData throw.
- r2blind/retake-no-stage-check: `false` — stale pending outside capture stages is unreachable: keep clears it, /signal clears it on advance, deny purges it, and say() never advances out from under it.
- r2blind/retake-regex: `low` — unanchored RETAKE_UTTERANCE fires on "don't retake" (recoverable via relock). Grouped with r2edge/negated-retake. Patch: anchor to exact phrases like keep + negation test.
- r2blind/aliases-untested: `low` — alias routes delegate untested; a path typo would slip through. Patch: alias tests.
- r2blind/shape-variants: `low` — denied-branch and clean-sample shapes unpinned. Patch: extend keyShape snapshots.
- r2blind/guides-resize: `low` — guides never redraw on resize/orientation. Rejected: uncommon mid-capture and the fix adds new wiring.
- r2blind/locked-on-retake: `low` — locked class stays green through retake while awaiting a new capture. Patch: clear + redraw blue on retake.
- r2blind/videowidth-guard: `false` — the readyState>=2 guard resolves it: dimensions are known at HAVE_METADATA, so data-available implies nonzero size.
- r2blind/sessions-ttl: `low` — sessions map has no eviction and flags no rate limit. Rejected: pre-existing single-user demo scope, fix is substantial hardening.
- r2blind/spec-admin: `false` — iteration 1 is correct (one loopback), Change Log is bad_spec-only by workflow, and deferred entries match the mandated format (round-1 blind/deferred-entry grounds); also fix-edits-spec.
- r2vgap/streak-reset: `medium` — alternating-fault/clean-sample streak reset untested; a reset regression warns early/late green. Patch: alternating-fault boundary test.
- r2vgap/suppressed-transcript: `medium` — transcript growth across suppressed repeats unasserted; duplicates would render every 200ms green. Patch: assert transcript length.
- r2vgap/step-lists: `medium` — step ids/states per stage and hasBack:false unasserted; wrong/phantom steps green. Patch: instruct-steps cases.
- r2vgap/reask-utterances: `medium` — re-ask choice utterances unpinned; a misroute ships green. Patch: extend tappable-equivalents test.
- r2vgap/retake-text: `medium` — retake re-instruct text per stage unchecked; wrong guidance green. Patch: 4-stage retake-text loop.
- r2vgap/lock-text: `medium` — LOCK_TEXT per stage unchecked; generic confirms green. Patch: assert lock text per stage.
- r2vgap/announced-lock: `medium` — carried vgap/announced-lock: page suite still cannot observe the call site, no harness. Defer stands, no new entry.
- r2vgap/denied-outside-stage: `low` — telemetry-denied outside capture duplicates the turn with announced:true. Rejected: real client posts denied via /signal only, fix adds branches. Grouped with r2edge/denied-outside-stage.
- r2edge/second-lock: `low` — carried blind/pending-overwrite. Rejected, no new action.
- r2edge/lock-during-fault: `false` — grouped with r2blind/lock-no-readiness: client gates on lockReady, server cannot verify without frames, API-only bypass harms only that run.
- r2edge/string-flags: `low` — grouped with r2blind/telemetry-validation: truthy-junk handling needs malformed clients. Rejected.
- r2edge/denied-truthy: `low` — denied:1 bypasses the === true park check. Patch: truthy checks (E1 precedent: direct correction).
- r2edge/denied-outside-stage: `low` — grouped with r2vgap/denied-outside-stage. Rejected.
- r2edge/denied-suppression: `low` — denied branch always appends + announced:true. Rejected: client posts once per deny, fix adds branches.
- r2edge/keep-while-parked: `false` — every keep advances or 409s, so same-stage capture accumulation is unreachable (round-1 B5 grounds).
- r2edge/negated-retake: `low` — grouped with r2blind/retake-regex. Patch.
- r2edge/stale-telemetry: `low` — late telemetry responses render into a new stage (self-heals next tick). Grouped with r2edge/stale-lock + r2edge/staleness-claim. Patch: stage/session token after await.
- r2edge/stale-lock: `low` — late lock response sets a dead pendingRef after restart (self-heals next drive). Grouped above. Patch.
- r2edge/standin-fail: `low` — stand-in post has no busy guard or failure path; offline click stalls with hidden button. Patch: guard + restore on failure.
- r2edge/autopark-stale-turn: `low` — carried blind/stale-autopark-turn. Defer stands, no new entry.
- r2edge/track-missing-attach: `low` — getUserMedia resolving trackless stalls on "Opening camera". Rejected: virtually unreachable, fix adds a branch.
- r2edge/telemetry-outside-stages: `low` — carried edge/telemetry-wrong-stage. Rejected, no new action.
- r2edge/staleness-claim: `low` — grouped with r2edge/stale-telemetry (same missing-guard defect). Patch.
- r2edge/ghost-panels: `false` — carried blind/telemetry-unfired-panel: client still guards render on res.announced.

## Design Notes

Server-side generation: panels are generated in TypeScript and shipped inside `say`/`signal` responses so the deterministic skeleton is testable under `node --test` and the late-model-fill rule (discard, never splice) is enforceable in one place. Model panel-copy polish reuses the `narrate` chain with its existing timeouts; template fill is the standing fallback. The `coach()` escalation change is a deliberate Rev 2 §4 supersession of the AU §5 close-run rule, scoped to telemetry coaching only — `not_verified`-on-inconclusive in the check engine is untouched.

Typed-description reading (loopback 1): never-auto-pass plus no-clear-frame-no-capture forces exactly one behavior — a description is acknowledged, the run holds (no advance), and telemetry coaching continues. No escalation state is needed: unknown utterances in capture stages get the capture-context hold turn, while consent/idle stages keep the consent-oriented re-ask.

## Verification

**Commands:**
- `npm test` -- expected: all tests pass, 0 fail (1 live-test skip without META_API_KEY in env)

**Manual checks (if no CLI):**
- Drive a camera run on-device: guides lock with flash + haptic + spoken confirm; deny the camera and confirm the run parks with an explanation, never auto-continues
- Read a full run with the screen unread: every Turn has a text twin, verdict announced once, transcript mirrors every Turn
