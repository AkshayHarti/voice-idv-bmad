---
title: 'Meta pin corrections per Rev 2 §11'
type: 'feature'
created: '2026-11-03'
status: 'done'
route: 'dispatch'
baseline_commit: '3b7735c84d116befc7c897ccbd9656f3a8849b08'
review_loop_iteration: 0
context: ["{project-root}/docs/specs/2026-11-02-voice-assistant-idv-spec.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/meta-models.ts` still pins `sam-3`/`glimmer`, contradicting Rev 2 §11 (SAM 3.1, Muse Image art role, Glimmer local core, provisional Wonder/Transcribe).

**Approach:** Correct the pins, move fixture-art to the Image pin (renaming the art script), reprice per the spec roster, and pin it all with tests — decisions byte-identical.

## Boundaries & Constraints

**Always:** consumers keep importing `META_MODELS` constants, never literals; every pin key has a `PRICING` entry (the spend lookup throws otherwise); UNVERIFIED markers stay until live-key verification; decisions byte-identical (`--no-meta` parity holds on every fixture).

**Never:** no live Meta calls in build/tests; no changes to `runChecks`/`decide`, intents, stages, `signal()`, or provider fallback chains; no new model roles beyond the Rev 2 roster; no edits to `docs/spend.md` history (append-only audit log).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| segmentation call | SAM request via providers | model id `sam-3-1` in the request body | N/A (fallback chain unchanged) |
| art generation | art script run | request uses the Image pin, saves to `fixtures/art/` | N/A (script still exits non-zero, no partial writes) |
| spend logging | any priced call | `PRICING[pin]` resolves; per-spec rates | N/A |
| provisional ids | Wonder/Transcribe/Image keys read | clearly-marked provisional values, UNVERIFIED | N/A |

</frozen-after-approval>

## Code Map

- `src/meta-models.ts:10-27` -- pins + `PRICING` (sam `sam-3`→`sam-3-1`; add image/wonder/transcribe provisionals; reprice per roster; glimmer→local-core label, $0 no API spend).
- `src/providers.ts:113,138,228,238` -- narration/segmentation consumers + spend lookup; safe via constants, verify `PRICING` keys resolve.
- `src/audit.ts:83,88` -- audit POST + spend lookup; same verification.
- `scripts/glimmer-art.mjs:41,90,115,124` -- art tool; git-mv to `scripts/image-art.mjs`, switch to the Image pin (pattern: model-art name follows the model).
- `test/meta-models.test.js:5-10` -- pin test layout to extend (exact pins, provisionals marked, PRICING numerics).
- `test/sam.test.js:10`, `test/audit.test.js:13`, `test/meta-demo.test.js:15,32` -- consumer assertions via constants; live test stays key-skipped.
- `src/index.ts:31,159` -- `spendTotal()` only; immune, do not touch.
- `docs/spend.md:11-13` -- hand-mirrored history; leave (append-only).

## Tasks & Acceptance

**Execution:**
- [x] `src/meta-models.ts` -- correct pins, add provisionals, reprice per roster -- the single source of truth.
- [x] `src/providers.ts`, `src/audit.ts` -- verify consumers resolve (constants + PRICING keys) -- no silent spend-throw.
- [x] `scripts/glimmer-art.mjs` -- git-mv to `scripts/image-art.mjs`, switch to Image pin -- art follows the model.
- [x] `test/meta-models.test.js` -- exact-pin, provisional-mark, and PRICING assertions -- locks the roster.

**Acceptance Criteria:**
- Given the pin module, when read, then sam is exactly `sam-3-1`, image/wonder/transcribe keys exist marked provisional/UNVERIFIED, and every key has a numeric PRICING entry.
- Given any priced call path, when spend logs, then the lookup resolves without throwing.
- Given the full suite, when it runs, then all tests pass with no new skips and `--no-meta` parity holds.

## Implementation Notes

## Spec Change Log

## Review Triage Log

Pass 1 (blind + edge; vgap clean — 15 rows):

- [blind B1] `false` — no package.json script or CI ref ever named the art script (verified by grep); live docs updated, only the dated historical plan keeps the old name.
- [blind B2] `low` — Image reuses the Model API base + provisional payload shapes; a mismatch fails clean (exit 1, no writes). Rejected: the true shape is exactly what §12 live verification settles; inventing shapes now would be fabrication.
- [blind B3] `false` — the old test never checked request construction either (regexes + one PRICING numeric); exact pins + provisional marks are what the spec ordered, and independent id confirmation is §12 live work.
- [blind B4] `false` — verified by grep: no remaining API sender of `META_MODELS.glimmer` (the art script was the sole one); PRICING key only.
- [blind B5] `false` — the art script prices image calls at $0.01 only; the small wonder/transcribe perCalls never flow through its toFixed(2).
- [blind B6] `false` — per-image $0.0025 is sourced from spec §3; the frames rate is documented for a video call path that does not exist yet, so nothing miscomputes.
- [blind B7] `low` — README keeps the endpoint-level hang diagnosis (still accurate: same base URL, still pending). Rejected: refreshing it means re-probing live (§12 work); cosmetic.
- [blind B8] `false` — verified by grep: nothing reads `fixtures/art/*.png` (writer + comments only), so absent PNGs need no handling.
- [blind B9] `false` — JOBS prompts are scene descriptions (passport-glare, DL-tilt) with no Glimmer-specific content identified; art is cosmetic backdrop with independent ground truth.
- [blind B10] `low` — provenance cites resolvable spec sections but no URLs/hashes. Rejected: doc archaeology for a comment; no behavior at stake.
- [edge E1] `low` — stale dist (no build) yields a confusing API 400 instead of a clear message. → patch: stale-dist guard at script start. Grouped with E2 (same root cause).
- [edge E2] `low` — same stale-dist root cause as E1 (undefined key → TypeError). Covered by the E1 guard. Grouped → patch.
- [edge E3] `low` — provisional test reads `.unit` before asserting the entry exists, masking failures as TypeError. → patch: assert-then-read. Grouped with E4/E5 (test hardening).
- [edge E4] `low` — glimmer's local-run-weights label unasserted. → patch: add the label assertion. Grouped → patch.
- [edge E5] `low` — spark perCall value unasserted, drift would be silent. → patch: pin the value. Grouped → patch.

Routes: 2 patch entries (G1 script guard, G2 test hardening), 0 defer entries. No intent_gap/bad_spec — no loopback.

## Design Notes

Decisions the user would not notice, recorded: rename target `scripts/image-art.mjs` (model-art pattern; no target pinned in repo); Glimmer keeps its key as the local-core label at $0 (run-weights, no API spend); provisional ids are clearly-marked placeholders pending §12 integration confirmation; `docs/spend.md` history untouched (append-only).

## Verification

**Commands:**
- `npm test` -- expected: all pass, 1 skip (live-meta, no key), no new skips.

**Manual checks (if no CLI):**
- Live-key re-verification per §12 (keys required; UNVERIFIED markers stay until then).
