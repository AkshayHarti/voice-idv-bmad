---
title: 'Microphone unavailable latch leaves voice input dead'
type: 'bugfix'
created: '2026-11-02'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: ["{project-root}/docs/specs/2026-11-02-voice-assistant-idv-spec.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Once listening fails for any reason — denied permission, an already-running recognizer, or just two quiet turns — the client latches `micBroken` forever, so "Microphone unavailable" persists for the whole session with no recovery and no cause-specific guidance.

**Approach:** Make microphone failure transient and specific: only lasting device/permission loss parks voice input, every other cause retries on the next turn, and each failure names its remedy, with the typed fallback always available.

</frozen-after-approval>

## Implementation Notes

- `src/index.ts` `listen()`: replaced the permanent `micBroken` latch with `micParked` (reason string). Overlap guarded via `activeRecognition` (in-flight owns the turn); permission/device errors show named remedies and retry next turn; only 3× consecutive silence parks (reload to retry); `start()` throw is transient via `settle('')`.
- `test/page.test.js`: tripwire test for guard/remedy strings plus a negative assertion that the latch is gone.
- Suite: 89 tests / 88 pass / 0 fail / 1 skip (live-meta, no key).
- Review patches: shared abandon() teardown with generation guard; network branch with own message; Start resets mic state and retires generations; typed submits break silence streaks; messages reworded (no "speak" promise, browser-neutral, Start-based recovery).
- Elicitation evidence (5 Whys): Chrome and Safari remember mic denial instead of re-prompting, so retry-next-turn on denial would be prompt-safe; park-until-Start retained deliberately as the calmer UX with cheap recovery this early in a run.

## Spec Change Log

## Review Triage Log

- blind/speak-nothing-running: `medium` — message promised speech with no recognizer running. Patched: reworded to typed-focused.
- blind/no-auto-retry: `false` — typed fallback carries the turn and voice retries next turn by design; no stall.
- blind/start-state-leak: `medium` — parked mic/streak/guard leaked across Start; ghosts contaminated new runs. Patched: reset all, abort in-flight, generation guard.
- blind/typed-keeps-streak: `low` — typed success didn't break silence streaks. Patched: reset on non-empty submit.
- blind/network-feeds-streak: `low` — network blips parked with the wrong remedy. Patched: own branch, excluded from streak.
- blind/reload-only-park: `low` — recovery destroyed session state. Patched: Start resets mic state, message names Start.
- blind/intent-code-mismatch: `low` — frozen text says permission/device parks, code parks only silence. Deferred: frozen text uneditable in-run.
- blind/result-deref: `false` — malformed results unshown reachable; watchdog bounds any hang to 10s.
- blind/dropped-reentrant-listen: `low` — type-then-speak race misroutes one utterance. Rejected: rarely hit, fix needs a queue.
- blind/test-overclaims: `low` — title claimed recovery literals can't prove. Patched: narrowed title, pinned policy comment.
- blind/triplicated-teardown: `low` — three copies of the settle preamble. Patched: shared abandon() helper.
- blind/no-mic-telemetry: `low` — failure mix invisible to backend. Deferred: new API surface, follow-up sized.
- blind/chrome-only-wording: `low` — "address bar" misleads Safari users. Patched: browser-neutral reword.
- blind/spec-unfinished: `false` — status/logs correct mid-run per the workflow.
