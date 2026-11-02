---
title: 'Human capture confirmation: varied voice, image confirm card, tolerant keep/retake'
type: 'feature'
created: '2026-11-03'
status: 'done'
route: 'dispatch'
baseline_commit: '908c4b8fcb288308caeff40dd6f47184c8e5984c'
review_loop_iteration: 0
context: ["{project-root}/docs/specs/2026-11-02-voice-assistant-idv-spec.md", "{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-voice-idv-bmad-2026-11-02/EXPERIENCE.md", "{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-voice-idv-bmad-2026-11-02/DESIGN.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The demo sounds robotic — one hold line repeats verbatim — and Keep/Retake is asked blind, with no image, no quality verdict, and typo-intolerant matching ("kep it" falls through to the hold line).

**Approach:** Rotate approved surface variants for coaching color, show a docked confirm card with a device-local snapshot plus a spoken quality verdict before the fixed keep/retake question, and resolve near-miss utterances with an echo — per the Halo spines including the validation rollup.

## Boundaries & Constraints

**Always:** fixed wording for functional prompts (consent, keep/retake, abort); verdict and question are separate turns; snapshot stays client-side (variable + `<img>`, cleared on keep/retake/stop); spoken lines ≤ ~12 words with pause commas; transcript tags shared per meaning.

**Never:** no frame upload or storage (keep/retake POSTs stay `{}`); no image field in the panel schema; no rotation of functional prompts; no changes to `runChecks`/`decide`, intents, stages, or `signal()`; no live Meta calls in build/tests.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| hold-repeat | 2nd+ unknown utterance in a capture stage | a different approved hold variant; never the same twice in a row | N/A |
| coach-repeat | same fault, 2nd episode | rotated coaching variant; 3rd episode still escalates to warn | N/A |
| lock | lock tap on live video | snapshot → confirm card (`alt=""` img + verdict caption + pair) → verdict turn → question turn; focus to card heading | snapshot fails → card without img, generic verdict, pair still offered |
| stand-in lock | fixture stand-in (no video) | confirm card with fixture label instead of photo; generic verdict | N/A |
| keep-voice-typo | "kep it" with pendingCapture | Keep resolves; echo "Keeping the front."; transcript records heard → resolved | low-confidence near-miss → re-ask, no resolve |
| keep-tap | Keep button | same as voice keep; focus returns to spoken-line region; snapshot cleared | N/A |
| retake | either channel | pending discarded, re-instruct; card retires; snapshot cleared | N/A |
| SR active | screen reader detected | self-voicing TTS yields to SR announcements; live regions carry them | user toggle overrides |

</frozen-after-approval>

## Code Map

- `src/flow.ts:102-103,269-277` -- `CAPTURE_HOLD_TEXT` + its sole caller (`say()` unknown-intent branch); add variant rotation here.
- `src/telemetry.ts:57-60,71-80,107-152` -- `coach()` fixed strings per `faultKey()` + warn escalation; rotate coaching variants, keep escalation.
- `src/index.ts:574-598,285-290` -- `handleLock` + `LOCK_TEXT`; compose the quality-verdict turn from the latest telemetry sample (generic fallback when none).
- `src/index.ts:1333-1367` -- lockBtn tap handler + `announceLock`; snapshot hook between race guard and `renderPanel`; focus to card.
- `src/index.ts:1068-1136` -- `renderPanel` (textContent-only); additive `createElement('img')` branch for the confirm card, never `innerHTML`.
- `src/index.ts:293-294,432-445` -- `KEEP_UTTERANCE`/`RETAKE_UTTERANCE` + `/say` consumption; near-miss tolerance + echo.
- `src/index.ts:1146-1173,1236,1443` -- `doKeep`/`doRetake` client fns, `stopCapture`, `drive()`; clear snapshot, retire card, restore focus.
- `src/index.ts:1370-1403` -- `videoSample()` 32px peek (untouched; snapshot uses a separate canvas); `:1374-1378` no-upload comment is the invariant.
- `src/panels.ts:44-76,244-250,342-352` -- panel schema + retake-pair validator/generator; reuse as-is, no image field.
- `test/page.test.js:142` -- pins the no-upload string; `test/flow.test.js`, `test/telemetry.test.js` -- variant rotation tests go here.

## Tasks & Acceptance

**Execution:**
- [x] `src/flow.ts` -- hold-text variant rotation (no immediate repeat in a stage) -- kills the ×3 verbatim tell.
- [x] `src/telemetry.ts` -- coaching-color variant rotation per fault; escalation untouched -- same fix for coach repeats.
- [x] `src/index.ts` server -- quality-verdict turn in the lock response from the latest sample -- non-visual review path.
- [x] `src/index.ts` client -- snapshot at lock, confirm-card img branch, focus in/restore, TTS-yield on SR detect -- the visible card.
- [x] `src/index.ts` client+server -- near-miss keep/retake tolerance with echo + heard→resolved transcript -- "kep it" works.
- [x] `test/flow.test.js`, `test/telemetry.test.js`, `test/page.test.js` -- rotation, verdict, snapshot-branch, tolerance, and no-upload tripwires -- locks the behavior.

**Acceptance Criteria:**
- Given two unknown utterances in one capture stage, when both are spoken, then the hold lines differ.
- Given a lock on live video, when the pair opens, then the card shows the snapshot with `alt=""`, a verdict caption, and Keep/Retake precedes nothing — verdict turn sounds before the question turn.
- Given "kep it" with a pending capture, when it resolves, then Keep applies, "Keeping the front." echoes, and the transcript shows heard → resolved.
- Given a kept capture, when the next stage starts, then the snapshot variable is cleared and focus is back at the spoken-line region.
- Given the full suite, when it runs, then all tests pass with no new skips and the no-upload string is still asserted.

## Implementation Notes

- Subagent implemented per spec; host verification found the confirm card rendering in the middle panel region instead of the dock zone (frozen Approach says "docked confirm card"). Host follow-up: `renderPanel` appends retake-pair cards to `dockZone` with scroll-follow, `dropConfirmCard()` removes the node on retire/re-render/stop (never the live frame), card-chrome CSS selectors extended to `#dockZone`, 4 tripwire assertions added. Suite green after.
- SR detection is heuristic (first Tab ⇒ screen reader); toggle always overrides; live regions carry every line either way.
- Manual gate remains: on-device lock run (image, verdict→question order, voice/tap/type keep-retake, focus, TTS-yield).

## Spec Change Log

## Review Triage Log

Pass 1 (blind + edge + vgap; 32 rows):

- [blind B1] `low` — hold rotation continuing (not restarting) across stages is invisible; no-repeat and no-wrong-noun guarantees hold. Rejected: fix adds per-stage state for zero user-visible change.
- [blind B2] `false` — rotation "reset" on a non-hold last_turn cannot repeat a line: the new hold differs from the intervening coach/verdict text by construction.
- [blind B3] `low` — "keep!" resolving with an echo instead of silently is benign (the echo is informative, spine-consistent). Rejected: exact-phrase expansion is scope creep.
- [blind B4] `false` — "yes" re-asks with the pair held open (distance ≤4 band), it does not fall to chatter; "keeps" resolving is intended tolerance.
- [blind B5] `false` — 3× recomputation over ≤15-char strings per /say is negligible; empty target lists are unreachable (const non-empty).
- [blind B6] `false` — the three noun maps serve different contexts (sentence/title/client noun), not drift; no divergence demonstrated, no harmed caller named.
- [blind B7] `false` — sampler overwrites lastSample every 200ms while capturing, so staleness is unreachable; challenge frames are face captures, so the wording fits.
- [blind B8] `false` — the standing lock question answers re-ask lines (drive re-renders it); the pair survives chatter per the existing keep/retake test; clobber semantics pre-date this story.
- [blind B9] `false` — retireCard sets cardOpen=false on first call so no double-retire exists; the focus move fires only when the pair closed, which is the specified behavior; non-modal alertdialog matches the spine.
- [blind B10] `false` — `#spoken:focus` outline styling exists in the diff; focus-to-spoken on retire is specified, scroll-guarded, and announces context for SR users.
- [blind B11-heuristic] `low` — Tab-heuristic SR detection can mute self-voicing for keyboard-only users, but recovery is one visible toggle click and every line still captions. Rejected: detection redesign exceeds the harm; heuristic is the documented design.
- [blind B11-toggle] `low` — voice toggle lacks pressed semantics. → patch: add aria-pressed init + cycle update.
- [blind B12] `maybe-false` — suppressed-mode verdict may flash past SR before the question; the transcript live region may still announce it. Would settle: on-device SR pass. → defer (medium-unverified).
- [blind B13] `low` — full-res transient snapshot works and clears; no user-facing cost demonstrated. Rejected: downscale is optimization, not a defect fix.
- [blind B14-restore] `high` — stand-in retake strands the run: standinBtn stays hidden, lockBtn stays disabled, no lock control remains. → patch: re-offer stand-in in drive() when the pair closes on a capture stage with no stream.
- [blind B14-sampling] `false` — sampling correctly stays false while a re-ask holds the pair open; resume happens at the next stage.
- [blind B15] `false` — no reachable path renders a pair with null/stale captureStage, and bare Keep/Retake text remains an accessible fallback regardless.
- [blind B16] `medium` — page tripwires are string-literal, same root cause as V6/V7. Grouped → defer (no browser harness; manual gate).
- [edge E1] `medium` — non-string utterance throws TypeError in normalizeUtterance → /say 500; the throw is new with this story. → patch: String() coercion.
- [edge E2] `false` — keep implies advance: doKeep 409s without a capture event and pendingCapture implies a capture stage, so the no-clear path is unreachable (and the sampler would overwrite anyway).
- [edge E3] `medium` — stand-in race-loss return strands standinBusy=true with the button hidden; restart does not reset either, so stand-in is dead until reload. → patch: finally-reset mirroring lockBusy.
- [edge E4] `medium` — restart during lock verdict speech leaks the stale question text + lock flash into the new run (voiceGen cuts speech only). → patch: post-await session re-check. Grouped with E5 (shared root cause).
- [edge E5] `medium` — same leak on the stand-in path. Grouped with E4 → patch.
- [vgap V1] `medium` — challenge/selfie full verdicts unasserted; a face/doc wording swap would ship green. → patch: extend verdict test (filed disposition weighed).
- [vgap V2] `medium` — challenge/selfie echo nouns unasserted. → patch: extend near-miss test.
- [vgap V3] `medium` — challenge/selfie hold nouns + 4th-repeat wrap unasserted. → patch: extend hold test.
- [vgap V4] `medium` — retake-clear and signal-denied invalidation unasserted; a stale `sharp` claim would ship green. → patch: add both no-resample sequences.
- [vgap V5] `low` — retake system echo turn unasserted (keep's is). → patch: add the mirror assertion.
- [vgap V6] `medium` — confirm-card lifecycle runs under literal-only tests; no harness exists and the manual gate covers it. Grouped with B16/V7 → defer.
- [vgap V7] `medium` — speech order + SR arbitration run under literal-only tests. Grouped with B16/V6 → defer.

Routes: 10 patch entries (G1–G10), 2 defer entries (G11, G12). No intent_gap/bad_spec — no loopback.

## Design Notes

Rotation is deterministic per session (round-robin keyed by situation + count), never random — tests and transcripts stay stable. Golden shapes:

- Hold: "Still on the front — hold steady." / "With you, same capture. Hold there." / "Stay with this one — nearly there."
- Coach (glare): "Tilt the top away from the light." / "Ease the top back, out of the glare."
- Verdict: "Front captured: sharp, all four corners in." / fallback "Front captured." then the fixed question.

## Verification

**Commands:**
- `npm test` -- expected: all pass, 1 skip (live-meta, no key), no new skips.
- `npx tsc --noEmit` -- expected: clean (covered by `npm test`, listed for direct runs).

**Manual checks (if no CLI):**
- On-device lock run: image appears in the docked card, verdict then question speak in order, Keep/Retake by voice, tap, and type.
