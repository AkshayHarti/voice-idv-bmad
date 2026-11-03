---
title: 'Guided auto-capture with real-time identification'
type: 'feature'
created: '2026-11-02'
status: 'done'
route: 'dispatch'
baseline_commit: '22a4c07666a8dfde42250cc681e1483842b6cdb6'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Capture is manual-tap with coarse guidance (dark/glare/blur only; skew/occlusion/moiré hardcoded 0), so users can't reach a model-grade frame by voice alone and the frame never fires itself.

**Approach:** Grade every viewfinder sample in real time, coach from it at 5 Hz, and auto-fire the existing lock path after a consecutive-clean run plus an announced hold-still beat, keeping Lock as manual fallback.

## Boundaries & Constraints

**Always:** Only locked captures enter the pipeline via lock/keep/retake; viewfinder frames never leave the device or stored; every auto-fire announced ahead (beat) and confirmed after (flash + haptic + verdict); detection invisible — guides/coaching/voice only, never corner counts or "document found"; decision core frozen (Rev 2 §6).

**Never:** Server-side analysis of live frames (Rev 2 §8); silent auto-capture; manual-only flow; frozen checks/DVS/fraud/MRZ shapes; `/result` token gate or customer view.

**Decisions:** Identification runs ON-DEVICE EXTENDED (no new network). Scope is BEHAVIOR + 2 CRITICALS + 4 HIGHS; stage-slotted beat, proximity line, mock updates, and lows are deferred.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY auto-fire | 4 consecutive clean samples, no movement | Armed + beat, lock fires ≥1.5 s after beat, standard confirm card | N/A |
| Movement veto | Motion during Armed | Cancel arm, polite re-arm line, resume coaching | Diagnose after 3 repeats |
| Voice veto | "wait" during Armed | Cancel arm, speak hold-off line | N/A |
| Lock fallback | Lock tap anytime | Immediate lock, same confirm landing | N/A |
| Never arms | No clean run in stage | Coaching continues; proactive Lock offer after silence | Stand-in unchanged if camera denied |
| Re-ask ambush | 10 s silence during Armed | Timer suspended; stillness is the answer | Queue re-ask politely, never mid-arm |

</frozen-after-approval>

## Code Map

- `src/index.ts` -- PAGE + client JS: videoSample, sampleTick (5 Hz), lock/stand-in handlers, takeSnapshot, doKeep/doRetake, handleTelemetry, handleLock, qualityVerdict.
- `src/flow.ts` -- Stage/Intent/TurnKind, say/signal, captureInstruct, holdVariants; home for beat text, instruct-contract line, re-arm/hold-off lines, wait intent.
- `src/telemetry.ts` -- faultKey/coach/isLockReady; home for consecutive-clean counting if server-owned.
- `src/panels.ts` -- generatePanel retake-pair branch; Lock naming if panel-rendered.
- `test/capture-flow.test.js`, `test/telemetry.test.js` -- lock/coach pins; extend, never weaken.
- `docs/specs/2026-11-02-voice-assistant-idv-spec.md` Rev 2 §§1/3/4/8; `ux-voice-idv-bmad-2026-11-02/EXPERIENCE.md` + `validation-report-r3.md` (20 findings).
- FROZEN: `src/checks|dvs|fraud|mrz|au_dl|measurements|redact.ts`, token gate.

## Tasks & Acceptance

**Execution:**
- [x] `src/telemetry.ts` -- consecutive-clean counter per session; expose armed state in telemetry response -- coaching and arming agree.
- [x] `src/index.ts` client -- extend videoSample (doc-presence/skew/motion proxies); Armed clock: beat at arm, auto-fire via lock path ≥1.5 s later if clean + still; movement cancels and re-arms -- identification + auto-fire, no new endpoints.
- [x] `src/flow.ts` -- stage instruct contract line, fixed beat text, re-arm + hold-off lines, wait-veto intent -- the announced rhythm.
- [x] `src/index.ts` client + `src/flow.ts` -- suspend 10 s silence re-ask while Armed/Capturing; queue politely -- stillness isn't absence.
- [x] `src/index.ts` + `src/panels.ts` -- Lock: immediate-lock tap, stage-context name, stage-entry announcement, "lock now" voice + keyboard path, proactive offer -- the operable fallback.
- [x] `src/index.ts` client -- arm haptic (double pre-pulse) distinct from lock tick; document vocabulary -- non-visual arm twin.
- [x] `test/telemetry.test.js` + `test/capture-flow.test.js` -- pin I/O edge cases (clean-run arming, movement/voice veto, suspension, Lock semantics).

**Acceptance Criteria:**
- Given a steady clean frame, when 4 consecutive samples are clean, then the beat speaks and lock fires ≥1.5 s later with the standard confirm card.
- Given Armed, when motion or "wait" occurs, then the arm cancels with a polite announcement and coaching resumes.
- Given Armed, when 10 s pass silently, then no re-ask fires mid-arm.
- Given any capture stage, when the user taps Lock or says "lock now", then lock fires immediately with the same confirm landing.
- Given sampling, when frames are graded, then no frame data leaves the device (numbers only, as today).

## Implementation Notes

- Dispatch build: Armed auto-fire on a 4-clean run + 1.5 s beat, on-device skew/motion proxies, wait veto + lock-now voice, proactive offer, arm haptic, silence suspension. Suite 133 pass.
- Review round 1: 35 findings (1 high, 7 medium incl. 1 deferred, 13 low patched, 5 false, 2 low deferred). Implementer followup lost tool access, so the host applied all 20 patches directly: listener live while Armed, fire-time re-grade, widened lock twins, stray/offer-runway fix, pair-top wait/lock hold-open (moved above near-miss resolution after a red run showed "wait" nudging), idempotent lock-behind-pair, prevLuma resume reset, stray transcript/speech guards, armGen retire, busy-drop restart, stand-in label fix, stale panel skip, twin pin, and 8 test extensions. Suite 135 pass / 1 pre-existing live-Meta skip; served page script node-checked; served LOCK_NOW_HEARD eval-verified (9 accept / 5 reject).

## Spec Change Log

## Review Triage Log

- [blind] BEAT_TWIN/server-beat twin kept by comment only — verdict: low — evidence: a one-side rewording breaks only its own literal pin, so heard-vs-shown can split green; route: patch (pin twin equality in page test).
- [blind] Listener stopped during Armed kills mid-arm voice veto — verdict: high — evidence: enterArm stops the capture recognizer, so spoken "wait"/"lock now" in the 1.5 s window is never heard, against the Armed veto AC; route: patch (keep command-only listener live; it never re-asks).
- [blind+edge] Fire clock can land on a faulted frame mid-round-trip — verdict: medium — evidence: armTimer checks only local armed; a faulted sample still POSTing cannot veto, and no fresh check runs at fire time; route: patch (fresh videoSample veto check before doLock).
- [blind+edge] Lock matchers miss natural variants ("lock it now", "lock now please") — verdict: low — evidence: anchored server + client twins accept one trailing word only; misses fall to say() with no lock; route: patch (widen both twins consistently).
- [blind+edge] "no wait[, lock now]" reads as deny and purges — verdict: low — evidence: deny regex matches bare "no" by the documented closed-intent contract, so the purge is specified behavior, but the veto-adjacent phrasing trap is new with wait; route: defer (phrasing hardening follow-up).
- [blind] Offer counter survives retakes via stray counting — verdict: low — evidence: samplesThisStage increments behind open pairs and retake resets only cleanStreak, so the 60-sample offer can fire one sample after a retake; route: patch (don't count strays / reset on retake).
- [blind] Veto streak never decays on clean arming — verdict: false — evidence: pre-arm fault loops already escalate via the COACHING_RETRY_LIMIT warn path, and per-stage veto counting is the designed diagnose semantic, not staleness.
- [blind] Arm stuck true on stage change blocks listener forever — verdict: false — evidence: sampleTick disarms on the first post-advance response (server armed:false), so the block self-heals within one tick, not permanently.
- [blind+edge] "wait" behind an open pair supplants the confirm question — verdict: low — evidence: wait flows through say() and overwrites last_turn/panel while the card stays open; route: patch (hold wait behind pairs like lock-now).
- [blind+edge] Tap lock behind an open pair clobbers the pending ref — verdict: medium — evidence: handleLock never checks pendingCapture, so a racing tap+voice lock overwrites the ref and orphans the first card; route: patch (idempotent hold-open, no new error surface).
- [blind+edge] Stale motion baseline after hold resumes — verdict: low — evidence: prevLuma isn't reset on the same-stage early return, so the first post-hold sample can false-motion and stall re-arm one sample; route: patch (reset prevLuma on resume).
- [blind] Capture listener overlaps the turn listener past stage boundary — verdict: false — evidence: drive() stops capture (listener included) whenever leaving a capture stage (src/index.ts:2332).
- [blind] "don't wait" splits client/server state — verdict: false — evidence: the client pre-disarm is transient; the deny response drives the run to its terminal step and reconciles both sides, leaving no stuck arm.
- [edge] "ok wait" reads as affirm, veto lost — verdict: low — evidence: affirm precedence matches bare "ok" by documented contract, so the arm continues; route: defer (veto-phrasing hardening follow-up).
- [edge] Stray post-lock tick overwrites confirm turn/transcript and speaks — verdict: medium — evidence: server advances last_turn/transcript behind open pairs and the client speaks announced in-flight ticks after onLocked; route: patch (guard both sides on pair-open/sampling).
- [edge] Tap racing an arming tick speaks a spurious beat — verdict: low — evidence: a crossing response processed during the tap POST round-trip enters the arm (beat + haptic) just before the verdict lands; route: patch (bump armGen at top of doLock).
- [edge] Command dropped on busy never restarts the listener — verdict: low — evidence: onresult stops the listener before respond(), so a busy-drop leaves it stopped until the in-flight POST's drive; route: patch (restart listener on busy-drop).
- [edge] Failed voice-lock snapshot mislabeled stand-in — verdict: low — evidence: drive() sets pendingStandin from snapshot nullness while the tap path always sets false on live video; route: patch (match the tap path).
- [edge] Late-tick arm renders stale coaching against the spoken beat — verdict: low — evidence: arm entry renders res.panel from a post-crossing coaching tick while speaking the beat twin; route: patch (skip stale panel render on arm entry).
- [edge] Deferred re-ask never fires after arm — verdict: false — evidence: no capture-stage re-ask exists to defer (the capture listener never re-asks by design), so the matrix row is satisfied vacuously.
- [verif-gap] "hold off" variant untested — verdict: low — evidence: pre-verified regression gap; route: patch (extend wait test).
- [verif-gap] "lock"/"lock it"/"lock this" variants untested — verdict: low — evidence: pre-verified regression gap; route: patch (extend lock-now test).
- [verif-gap] "don't wait" deny precedence untested — verdict: medium — evidence: pre-verified gap on the privacy-affecting purge path; route: patch (pin deny in flow tests).
- [verif-gap] Veto-reset test cannot see the reset — verdict: medium — evidence: pre-verified broken verification (diagnose already zeroed the streak before the lock); route: patch (lock after 1-2 vetoes).
- [verif-gap] Per-stage reset untested across stages — verdict: medium — evidence: pre-verified gap (offer timing/veto counting after advance unpinned); route: patch (cross-stage assertions).
- [verif-gap] Retake re-instruct contract line untested — verdict: low — evidence: pre-verified regression gap; route: patch (assert contract line per stage).
- [verif-gap] Passport entry contract line untested — verdict: low — evidence: pre-verified regression gap; route: patch (passport consent assertion).
- [verif-gap] Client fire clock source-text-only — verdict: medium — evidence: pre-verified; no executing harness exists and the spec gates client behavior on the manual on-device run; route: defer (manual acceptance covers).

## Design Notes

4 consecutive clean samples (~0.8 s at 5 Hz) start the beat; fire lands ≥1.5 s after beat start only if all samples since stayed clean with no motion/veto. Movement = mean-abs-diff of 32×32 luma vs prior sample over threshold [ASSUMPTION — tune on-device]. Doc/skew proxies stay coarse client-side (edge-energy ratios on the 32×32 canvas); they feed coaching + the clean counter only, never a "document found" callout.

## Verification

**Commands:**
- `npm test` -- expected: full suite green, new arm/veto/suspension pins passing.
- `npm run build && PORT=8787 npm start`, open `http://localhost:8787/page` -- expected: steady frame auto-fires with beat; movement re-arms; Lock fires immediately.
