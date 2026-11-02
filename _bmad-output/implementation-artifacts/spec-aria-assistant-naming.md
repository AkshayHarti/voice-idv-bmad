---
title: 'Name the assistant Aria across product surfaces'
type: 'feature'
created: '2026-11-02'
status: 'done'
route: 'dispatch'
baseline_commit: 4c9c11db5a0a0a41bb492f1bc0b87f41d0f8ff54
review_loop_iteration: 0
context: ["{project-root}/docs/seeds/GLOSSARY.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The voice assistant has no name; the demo page and transcript speak as a generic system, which undersells the Aria identity picked for the submission.

**Approach:** Name the assistant Aria consistently across product surfaces (page chrome, transcript labels, spoken consent intro, submission writeup), with consent self-introduction by design — in both voice and visual.

## Boundaries & Constraints

**Always:** Keep API response key sets identical at every depth on every `/api/*` route; only consent-derived values may change (consent `text`, transcript entries carrying it, `narration.text`). Map labels at render time; stored `who` values and API payloads stay byte-identical. Honor the non-claims vocabulary (`challenge_compliance`, `portrait_splice_artifact`, `face_match` uncertified).

**Never:** Touch the decision engine, Turn/Stage sets, or provider chains; add new surfaces or navigation; change TTS/ASR providers, voices, pacing, or recognition logic (turn-text strings below are the sole allowed speech-content change); rename the dynamic narration note or decision/limitations/audit headings; soften the limitations block.

**Accepted:** Model narration polish may paraphrase the intro on `--meta` runs; template turns always carry the name.

## Frozen literals

- Consent turn: "I'm Aria. I'll guide you by voice to verify your ID. Nothing is uploaded until you say so. Say — I consent — to start."
- Page `<title>` and h1: "Aria — AU Voice IDV demo"
- Sub-line: "Voice-guided capture with Aria. Deterministic checks decide; voice narrates, never decides."
- Transcript assistant label: exactly `Aria` (subject stays `you`); render with `text-transform:none`
- Submission title: "Aria — Voice-First IDV — Cerebral Valley submission (indie track)"; body line 9 "read by the system" → "read by Aria"

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior |
|----------|--------------|---------------------------|
| Page chrome | GET /page | Title, h1, sub-line match frozen literals |
| Transcript labels | Any run transcript | Assistant `.who` node renders exactly `Aria`; subject node renders `you`; unknown `who` falls through to `you` |
| Spoken intro | Run start (consent turn) | Consent text matches frozen literal (contains `Aria` + `I consent` cue); replay repeats it verbatim by design |
| API stability | Every `/api/*` route incl. errors | Key sets identical at every depth; only consent-derived values change |
| Submission | docs/submission.md | Title/intro/line 9 match frozen literals; limitations block byte-identical |

</frozen-after-approval>

## Code Map

- `src/index.ts` -- PAGE strings (title, h1, sub) + `renderTranscript` label literal (assistant side renders `Aria`); explicit unknown-`who` fallthrough to `you`; `.who` keeps `text-transform:none`
- `src/flow.ts` -- `CONSENT_TURN` text → frozen literal; all other turns untouched
- `docs/submission.md` -- title, intro, line 9 → frozen literals; limitations block untouched
- `docs/specs/2026-10-31-au-voice-idv-spec.md` -- consent-row cell → frozen literal (keeps spec/code conformance)
- `test/aria.test.js` -- NEW: label-node assertions (case-sensitive, never page-wide `system`/`aria` substrings); per-endpoint key-set snapshots (`/api/session`, `/say`, `/signal`, `/runs`, `/run/:id`, `/providers` incl. error shapes); precondition `npm run build` (tests import `../dist`)
- Do not change: `src/checks.ts`, `src/providers.ts`, `src/audit.ts`, `src/measurements.ts`, existing tests (none assert exact copy), `README.md`, narration prompts, note line, decision headings

## Tasks & Acceptance

**Execution:**
- [x] `src/index.ts` -- apply chrome + label rename
- [x] `src/flow.ts` -- apply consent literal
- [x] `docs/submission.md` + AU spec consent cell -- apply doc literals
- [x] `test/aria.test.js` -- add rename + stability tests

**Acceptance Criteria:**
- Given GET /page, when fetched, then title/h1/sub match the frozen literals and the assistant `.who` node renders exactly `Aria`
- Given POST /api/session, when the consent turn returns, then `text` and the first transcript entry match the frozen consent literal
- Given every `/api/*` route, when responses are compared pre/post change, then key sets are identical at every depth
- Given docs/submission.md, when read, then it names the assistant Aria per frozen literals with byte-identical limitations
- Given the full suite, when run, then every test passes with zero failures

## Implementation Notes

- `text-transform:none` applied to the shared `.turn .who` rule (covers assistant + subject labels); textContent assertions unaffected.
- Suite: 40 tests, 39 pass, 0 fail, 1 skip (live-meta, no key in env). All 5 matrix rows covered by ran tests.

## Spec Change Log

## Review Triage Log

- blind/values-unpinned: `low` — other turn texts are unchanged in the diff and Turn kinds are covered elsewhere; pinning every string fights the no-exact-copy convention. Rejected: unlikely met, fix adds brittle surface.
- blind/submission-intro: `false` — line 9 is the intro paragraph's system reference; frozen literals define exactly two edits and both landed + tested.
- blind/who-fallthrough: `false` — `who` is typed `system|you` with literal-only call sites (index.ts:155,200); unknown values unreachable, and the mapping is frozen-spec-mandated.
- blind/shared-who-rule: `low` — shared rule also lowercases the subject label's rendering; spec pins only text. Patch: scope `text-transform:none` to assistant labels.
- blind/new-function-helper: `low` — first-match extraction could test the wrong statement if duplicated. Patch: assert single match (grouped with helper-uniqueness).
- blind/helper-uniqueness: `low` — tagText/subLine/whoRule assert existence, not count of one. Patch: assert `matchAll` length 1.
- blind/limitations-substring: `low` — `includes()` passes if softening text is appended; headings unpinned. Patch: exact section-slice equality + heading assertions.
- blind/meta-paraphrase-untested: `false` — template path already asserted in the consent test; meta-paraphrase coverage is explicitly Accepted as untestable in the frozen block.
- blind/error-400s: `false` — no 400 paths exist (malformed JSON and missing fields default everywhere, index.ts:239,281,311); all real error shapes (404s) are covered.
- blind/deferred-entry: `false` — entry matches the workflow-mandated format exactly; no owner/acceptance fields exist in it.
- blind/re-identify: `false` — consent-only intro and untouched strings are the human-decided frozen scope; fix would edit frozen intent.
- blind/evidence-missing: `false` — triage log fills in this step by design; test evidence (40/39/0/1) recorded in Implementation Notes; key snapshots are the contract.
- blind/voice-assessment: `false` — speak timeout is length-adaptive, matchIntent reads user speech only, no stage timers exist; nothing to regress.
- edge/duplicate-title-h1: `low` — first-match helper misses duplicates. Patch: assert single match (grouped with helper-uniqueness).
- edge/duplicate-sub: `low` — same. Patch: assert single match (grouped with helper-uniqueness).

## Verification

**Commands:**
- `npm test` -- expected: all tests pass, 0 fail (1 live-test skip without META_API_KEY in env)
