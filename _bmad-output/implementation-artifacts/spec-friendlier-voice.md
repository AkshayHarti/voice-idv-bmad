---
title: 'Friendlier female voice for Aria'
type: 'feature'
created: '2026-11-02'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: ["{project-root}/docs/specs/2026-11-02-voice-assistant-idv-spec.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Aria speaks in the browser's default voice, which reads flat and mechanical rather than friendly and human.

**Approach:** Prefer a friendly female `speechSynthesis` voice with warmer rate/pitch tuning, keeping the default voice as fallback and leaving all spoken copy, providers, and turn behavior untouched.

</frozen-after-approval>

## Implementation Notes

- `src/index.ts`: added `pickVoice()` (female-name hint over en voices, default fallback, never throws) and wired it into `speak()` with rate 1.0 / pitch 1.1. Per-call pick self-heals as voices load; no `voiceschanged` plumbing needed.
- `test/page.test.js`: tripwire test for picker/getVoices/pitch (literal convention — no browser harness).
- Suite: 88 tests / 87 pass / 0 fail / 1 skip (live-meta, no key).

## Spec Change Log

## Review Triage Log

- blind/voice-load-race: `low` — first utterance can precede voiceschanged. Patched: prime getVoices() at load.
- blind/hint-coverage: `low` — name list misses some female voices, but fallback is the spec'd behavior. Rejected: enumeration is best-effort by design.
- blind/locale-chain: `low` — en-first ignores navigator.language. Rejected: English-only demo, fix adds a locale chain.
- blind/utterance-lang: `low` — u.lang unset from chosen voice. Patched: one-line assignment.
- blind/pitch-clamped: `false` — engine clamping is correct platform behavior, not a failure.
- blind/timeout-rescale: `false` — 2% rate delta cannot move timeout behavior; formula unchanged from baseline.
- blind/literal-tests: `low` — literals can't prove wiring. Patched: added the `u.voice = voice` wiring assertion (stub harness infeasible).
- blind/silent-fallback: `low` — null branches indistinguishable. Rejected: debug-only, fix adds surface.
- blind/no-optout: `false` — gendered default is explicit user direction; transcript already mirrors everything.
- blind/spec-unfinished: `false` — status/logs/placeholder are all correct mid-run per the workflow.
- blind/keepsake-contradiction: `low` — keepsake declares dropped direction decided; out of scope (other skill's artifact). Deferred.
- blind/keepsake-a11y: `low` — mouse-only interactions in a single-viewer keepsake. Rejected: rarely hit, moderate fix.
- blind/onepager-motion: `false` — open question recorded as open by design, not an omission.
