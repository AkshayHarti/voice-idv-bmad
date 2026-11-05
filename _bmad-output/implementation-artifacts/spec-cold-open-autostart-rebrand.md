---
title: 'Cold-open /page: fixed-fixture start plus Aria rebrand'
type: 'feature'
created: '2026-11-05'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'c9e87ef0e8919817406ffce007a505d2393c4096'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `/page` cold-open asks the user to pick a fixture and press a gated Start before Aria speaks, and the header still carries the old demo title and sub-line.

**Approach:** Remove the picker and gate so the run opens on Aria's consent prompt with a fixed default fixture, and rebrand the header to the single line `Aria — Voice onboarding agent`. Decided: the run auto-starts on page load with no tap, and the `<title>` tag follows the rebrand.

## Boundaries & Constraints

**Always:** Fixed default fixture is `vic-dl-clean` (equals the server default `RUN_IDS[0]`); session-create fires on page load with no tap and the consent prompt renders and speaks immediately; first speech may ride synthesis until the user's first tap unlocks MMS audio; failures surface a shown-and-enabled `Retry` button plus the `postError` message, and all Start-named recovery copy is reworded to Retry; `<title>`, h1, and sub all carry the rebrand; DOM writes stay `textContent`-only; `test/page.test.js` source-literal assertions are updated to the new markup; verification is `npm test` green with no new skips plus `node --check` of the client script extracted from served `/page`.

**Never:** No changes to `/api/*` behavior or fixture data; no new dependencies; no browser harness; all work stays in worktree `/tmp/voice-idv-cold-open` on branch `poc-cold-open-autostart` — never touch the main checkout, never push.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Cold open | `GET /page` | No `#fixtures` picker, no start gate; session-create fires on load for `vic-dl-clean`; consent prompt renders and speaks | N/A |
| Session-create fails | `POST /api/session` throws | No stuck run: `postError` message in the listen line, `Retry` button shown and enabled | Retry re-attempts session-create |
| Session expires mid-run | Any `post` gets 404 | `Session expired` message naming Retry | Retry starts a fresh fixed-fixture run |
| MMS blocked pre-gesture | First speech before any tap | Synthesis carries the speech via the existing fallback; MMS resumes once a gesture unlocks playback | N/A |

</frozen-after-approval>

## Code Map

All paths relative to worktree `/tmp/voice-idv-cold-open` (branch `poc-cold-open-autostart` @ `c9e87ef`).

- `src/index.ts:1668` — `<title>` tag; follows the rebrand (decided)
- `src/index.ts:1770-1771` — h1 plus sub-line; replace with the single rebrand line
- `src/index.ts:1775-1777` — `#fixtures` row plus Start row; remove the picker and gate
- `src/index.ts:1959-1972` — `/api/runs` fixture-button fetch; remove with the picker
- `src/index.ts:2041-2097` — `speak`/`speakMms`/`speakSynth`; reuse the per-turn MMS-to-synthesis fallback for first speech
- `src/index.ts:2118-2122` — `postError`; reuse for the session-create failure message
- `src/index.ts:3571-3606` — Start-button handler; replace with the fixed-fixture start and add the missing session-create `catch` (today a failed create wedges Start disabled with no message)
- `src/index.ts:59-65,567-578,696-711` — `RUN_IDS`, `/api/runs`, `POST /api/session` server default; do not change
- `src/flow.ts:104-107,272-277` — `CONSENT_TEXT`/`consentTurn`/`startRun`; first turn, do not change
- `test/page.test.js` — source-literal assertions on served `/page`; update the fixtures-ordering test, the `startBtn` slice boundaries, and Start-named recovery copy; add cold-open plus header assertions

## Tasks & Acceptance

**Execution:**
- [x] `src/index.ts` -- remove the picker, gate, and runs fetch; add the fixed-fixture start with session-create failure handling; rebrand the header -- the whole slice lives in the PAGE template and its client script
- [x] `test/page.test.js` -- update picker/start assertions to the new markup and add cold-open plus header coverage -- keeps the source-literal suite green with no new skips
- [x] `test/aria.test.js` -- update `PAGE_TITLE`/`PAGE_SUB` to the rebrand line -- required by the header rebrand; found during implementation

**Acceptance Criteria:**
- Given served `/page`, when the markup is inspected, then no `#fixtures` picker exists and the header carries the single rebrand line
- Given a cold open, when the run starts, then the session uses `vic-dl-clean` and the first turn is the consent prompt
- Given session-create fails, when the failure lands, then the listen line shows the `postError` message and a retry control is enabled
- Given the full suite, when `npm test` runs in the worktree, then it is green with no new skips, and the client script extracted from served `/page` passes `node --check`

## Implementation Notes

- Implemented in worktree `/tmp/voice-idv-cold-open`, branch `poc-cold-open-autostart`, via implementation subagent; only `src/index.ts`, `test/page.test.js`, `test/aria.test.js` changed. No `/api/*` or fixture-data changes.
- Stale-expectation fix (post-subagent): the old `no dead retry control` assertion (`!includes("'retry'")`) encoded "no retry control exists", which the approved spec inverts — Retry is now the live recovery control, pinned positively by the new failure test. Removed the stale line and reverted the subagent's double-quoted `$("retry")` workaround to `$('retry')` for consistency.
- Strengthened the failure test: Retry's listener line is asserted to call `startFixedRun()`, so "retry re-attempts" is pinned, not just "retry is wired".
- Verified by the orchestrator after the final edit: `npm test` 195 tests / 194 pass / 0 fail / 1 skipped (the skip is the pre-existing `{ skip: !LIVE }` live-meta test in untouched `test/meta-demo.test.js`); client `<script>` extracted from served `/page` (69,944 chars) passes `node --check`. Matrix rows cover: cold open, session-create failure, session expiry, MMS-to-synthesis fallback — all covering tests ran and passed.
- Review patch (orchestrator-applied; implementer subagent could not continue): review found failure copy naming Retry while Retry stayed hidden at 8 sites — surfaced Retry 404-guarded in doKeep/doRetake/standin/doConfirm/reading-signal catches and unconditionally at the three mic parks; pinned all of them plus the previously unpinned doLock-404/drive-bail/respond pairs with slice assertions (3 new tests). Re-verified: `npm test` 198 / 197 pass / 0 fail / 1 pre-existing skip; extracted client script (70,683 chars) passes `node --check`.
- Follow-up fix (post-done, human-renegotiated): the rebrand rendered the title twice (identical h1 + sub). Removed the `/page` header sub-line so the single line shows once; updated the aria/page header tests to pin title + h1 with no sub-line. Re-verified: `npm test` 198 / 197 pass / 0 fail / 1 pre-existing skip.

## Spec Change Log

## Review Triage Log

- blind/sub-duplication — low: h1/sub/title triplication is real but is the frozen rebrand verbatim; any fix renegotiates intent. Rejected (fix edits spec).
- blind/hardcoded-fixture — false: fixed `vic-dl-clean` is the specified behavior, other fixtures remain exercisable via untouched `POST /api/session`, and explicit-id posts cannot drift. Rejected on refutation.
- blind/auto-start-guards — low: Retry is hidden+disabled during create and after success so taps cannot double-create, and bfcache restores do not re-execute scripts; residual JS-crawler sessions are negligible demo-side. Rejected (unlikely + fix adds guards).
- blind/first-speech-unheard — false: pre-gesture synthesis is the approved mechanism; AudioContext suspensions touch only transcribe/VAD paths; per-turn MMS retry needs no resume listener; timeouts plus rendered text guarantee progress. Rejected on refutation.
- blind/retry-incomplete — medium: 409 clause refuted (transient, run continues, test-pinned) and pair-open-404 clause refuted (404 falls to the else branch, which surfaces Retry); park-path clause verified. Grouped into patch entry A.
- blind/voice-reset — false: `startFixedRun` resets voiceGen, aborts recognition, stops recording, and clears micParked/silenceParked/silentStreak (3578-3587); reviewer read diff hunks only. Rejected on refutation.
- blind/create-copy — low: misleading "expired" copy needs a 404-on-create, possible only with missing fixture data; recovery action identical either way. Rejected (unlikely + fix adds branching).
- blind/SR-race — low: consent is announced via the aria-live spoken line; residual one-sentence SR overlap and the providers race (pre-existing pattern) are minor. Rejected (minor + fix adds complexity).
- blind/literal-tests — false: the MMS-fallback row is covered by the synthesis-fallback test (ran+passed); source-literal style is the repo convention and the spec forbids a browser harness. Rejected on refutation.
- blind/spec-hygiene — false: Code Map/Tasks paths are repo-relative and the Triage Log fills in this step; /tmp references are accurate session context. Rejected (fix edits spec).
- edge/409-no-recovery — false: 409 is transient mid-flight staleness (pre-existing, test-pinned); disarm runs and the advanced stage re-enables Lock; no strand. Rejected on refutation.
- edge/mic-park-retry — medium: all three park assignments (3453/3486/3492) name Retry while it stays hidden; pre-change Start was always visible. Grouped into patch entry A.
- edge/typed-race — low: typed Send during create posts to a null session (pre-existing race, window narrowed by auto-start); outcome is stale text plus a stray Retry. Rejected (unlikely + fix adds a guard).
- verify/dolock-404-unpinned — medium: pre-verified gap finding, disposition patch trusted. Patch entry B.
- verify/drive-bail-unpinned — medium: pre-verified gap finding, disposition patch trusted. Patch entry B.
- verify/respond-404-unpinned — medium: pre-verified gap finding, disposition patch trusted. Patch entry B.
- Entry A (patch): failure copy names Retry while Retry stays hidden — park paths plus doKeep/doRetake/standin/doConfirm/reading-signal 404 catches found during verification. Entry B (patch): existing Retry lines outside the starter slice lack assertions. No intent_gap/bad_spec; no loopback.

## Design Notes

First speech rides the existing per-turn fallback: `speakMms` already falls back to `speakSynth` when `audio.play()` rejects, so the auto-started consent line speaks via synthesis pre-gesture and MMS resumes after the user's first tap.

## Verification

**Commands:**
- `npm test` (in `/tmp/voice-idv-cold-open`) -- expected: green, no new skips or failures
- Extract the client `<script>` from served `/page` to `/tmp/page-client.js`, then `node --check /tmp/page-client.js` -- expected: parses clean (the client JS lives in a template literal `tsc` cannot parse)
