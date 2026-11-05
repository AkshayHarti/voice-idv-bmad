---
title: 'Introduce Aria with a spoken intro turn'
type: 'feature'
created: '2026-11-05'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '3c95467de03599e2ee536f2f6cae7cac86164a94'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The run opens straight onto the consent gate, so Aria's only self-introduction is folded into the consent ask instead of introducing her as the user's onboarding agent first.

**Approach:** Give Aria an explicit spoken introduction at run start while keeping the consent gate's guarantees intact. Decided: a separate intro turn ahead of consent (consent text untouched) that auto-advances to the consent ask. Intro copy (drafted for approval): "Hi, I'm Aria, your voice onboarding agent. I'll walk you through your ID check, one step at a time."

## Boundaries & Constraints

**Always:** The first spoken line is a separate intro turn introducing Aria by name and onboarding-agent role, auto-advancing to the consent ask with no user input between; consent text stays byte-identical and still gates everything (affirm advances, deny/revoke purges, nothing captured or uploaded before affirm); the intro speaks through the existing speak pipeline (MMS-first with synthesis fallback) and renders in transcript plus spoken line like other turns; API response key sets stay identical; verification is `npm test` green with no new skips plus `node --check` of the extracted client script when client JS changes.

**Never:** No decision-engine, check, provider, voice, pacing, or recognition changes; no page-chrome changes; no new endpoints; all work stays in worktree `/tmp/voice-idv-cold-open` on branch `poc-cold-open-autostart` — never touch the main checkout, never push.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Run start | Auto session-create | First spoken line is the intro turn; consent ask follows automatically and still gates everything | N/A |
| Consent flow | User affirms or denies | Unchanged gate behavior: affirm advances, deny purges | N/A |

</frozen-after-approval>

## Code Map

All paths relative to worktree `/tmp/voice-idv-cold-open` (branch `poc-cold-open-autostart`).

- `src/flow.ts:104-107` — `CONSENT_TEXT`/`consentTurn`; frozen by the naming spec, touch only if enriched-consent wins
- `src/flow.ts:272-277` — `startRun`; first turn of the run, intro attaches here or ahead of it
- `src/flow.ts:299+` — `say()` consent handling plus `matchIntent`; reuse for any intro acknowledgment
- `src/index.ts:660-690` — step body and narration; client speaks `narration.text` via `drive`
- `test/aria.test.js` — consent-literal pins plus page-chrome assertions; update if consent text changes
- `test/flow.test.js`, `test/capture-flow.test.js` — consent-gate behavior; must stay green unchanged
- `docs/specs/2026-10-31-au-voice-idv-spec.md` — consent-row cell; update if consent text changes
- Prior specs: `spec-aria-assistant-naming.md` (frozen consent literal + API-stability rule), `spec-cold-open-autostart-rebrand.md` (auto-start speaks the first turn immediately; synthesis carries pre-gesture speech), `spec-friendlier-voice.md` (voice tuning untouched)
- Do not change: `src/checks.ts`, decision engine, providers, voices, page chrome

## Tasks & Acceptance

**Execution:**
- [x] `src/flow.ts` -- implement the decided intro shape (separate turn or enriched consent) with its decided advance behavior -- the run's opening turns live here
- [x] `src/index.ts` -- adjust step, narration, or client handling only if the decided shape needs it -- keeps the pipeline consistent with the new opening
- [x] `test/aria.test.js`, `test/page.test.js`, `test/flow.test.js` (+ `test/panels.test.js` for the new kind's panel binding) -- pin the intro turn and update consent-literal consumers if consent text changes -- keeps the suite's copy and behavior contracts green
- [x] `docs/specs/2026-10-31-au-voice-idv-spec.md` -- N/A, correctly skipped: consent text stayed byte-identical so the consent-row cell still conforms -- keeps spec/code conformance

**Acceptance Criteria:**
- Given a new run, when it starts, then the first spoken line introduces Aria by name and onboarding-agent role
- Given the introduction, when it completes, then the consent gate still enforces affirm-before-advance with deny purge intact
- Given the full suite, when `npm test` runs in the worktree, then it is green with no new skips, and the extracted client script passes `node --check` when client JS changed

## Implementation Notes

- Implemented in worktree `/tmp/voice-idv-cold-open`, branch `poc-cold-open-autostart`, via implementation subagent. Touched: `src/flow.ts` (new `intro` kind, `INTRO_TEXT` verbatim, `intro_done` signal), `src/index.ts` (client `drive()` auto-advance only), `src/panels.ts` (intro→text binding), `src/providers.ts` (doc comment), tests (`aria`/`flow`/`page`/`panels`). Consent text byte-identical; no endpoint, chrome, provider, or voice changes.
- Shape note: create's panel key-shape moved `PANEL_CHOICE_LIST`→`PANEL_BASE` because the opening turn is now the text-only intro (consent still yields the choice-list); no route schema changed, only which turn opens the run.
- Race note (for review): a typed utterance landing during intro speech is handled as a consent response (stage never leaves `awaiting_consent`), so mid-intro affirm advances without the ask being spoken; the affirm-before-capture invariant still holds.
- Verified by the orchestrator after the final edit: `npm test` 201 tests / 200 pass / 0 fail / 1 skipped (pre-existing `{ skip: !LIVE }` in untouched `test/meta-demo.test.js`); extracted client script (71,368 chars) passes `node --check`. Matrix rows (run start, consent flow) covered by ran+passed tests.
- Review patch (orchestrator-applied; implementer subagent could not continue): fixed the typed-during-intro race — client drops non-consent intro_done serves, server skips pushTurn for non-advancing intro_done; pinned post-advance transcript [INTRO, CONSENT] and consent panel shape, the full advance guard plus response guard, and stray-advance transcript stability (1 new test); fixed stale kind counts in docs. Triage correction: the alleged dropped replay pin was verified present, finding refuted. Re-verified: `npm test` 202 / 201 pass / 0 fail / 1 pre-existing skip; extracted client script (71,577 chars) passes `node --check`.
- Follow-up fix (post-done, human-renegotiated): consent dropped its redundant "I'm Aria." open (intro now introduces her); updated the aria CONSENT pin, the no-redundant-naming assertion, and the docs consent cell. Re-verified: `npm test` 202 / 201 pass / 0 fail / 1 pre-existing skip.

## Spec Change Log

## Review Triage Log

- blind/transcript-after-advance — low: the route pushTurns on every signal, so [intro, consent] is correct via the shared path; only the pin is missing. Patch entry P2.
- blind/say-during-intro — false: say() has zero intro-specific code — identical by construction; existing awaiting_consent tests now run with last_turn=intro and pass. Rejected on refutation.
- blind/intro-failure-strand — false: non-404 leaves typed-Send recovery (sessionId set, say path live); 404 surfaces Retry; mirrors the reading branch. Rejected on refutation.
- blind/retry-lingers — false: startFixedRun hides+disables Retry before every create and only it drives intro. Rejected on refutation.
- blind/advance-loop — false: intro_done deterministically serves consent from awaiting_consent; no reorder mechanism exists. Rejected on refutation.
- blind/narration-assume — false: shared speak path, speak() null-safe on falsy text, server always sends narration. Rejected on refutation.
- blind/barge-comment — false: intro matches every turn's speak-then-listen cadence; no turn voice-barges mid-speech; comment meaning unchanged. Rejected on refutation.
- blind/replay-pin-dropped — false: re-check before patching showed `assert.equal(replay.body.text, CONSENT)` present at test/aria.test.js:131, identical to baseline; the reviewer misread the hunk. Rejected on refutation.
- blind/consent-panel-unpinned — low: consent panel code untouched (choice-list intact); only the post-advance shape pin is missing. Patch entry P2.
- blind/api-dup-untested — low: the /signal route is fully generic (only camera_denied plus stage-change attaches); unit tests cover signal(). Rejected (marginal value).
- blind/panel-tail-skip — false: the switch tail only validates/falls back to textPanel — intro's early return produces exactly that, matching the default case, provider threaded. Rejected on refutation.
- blind/untyped-turn — false: no kind-keyed dispatch exists (template path voids turn; keyed path uses it as a prompt label only). Rejected on refutation.
- blind/spec-docs-nits — low: Code Map lines are approximate anchors (fix edits spec) and the providers touch is comment-only; only the docs kind list missing intro is real. Patch entry P5 for that clause.
- blind/slice-anchors — low: a moved anchor fails loudly; mic-after-consent is unchanged behavior covered by voice-flow suites. Rejected.
- blind/unheard-intro — low: text always renders, repeat covers the live turn, identity also in chrome/transcript; dedicated replay is new surface. Rejected.
- edge/typed-race-dupspeak — medium: verified — stray intro_done pushTurns again server-side and the client re-drives the post-answer turn (no guards either side). Patch entry P1.
- verify/guard-operator-unpinned — medium: pre-verified gap finding, disposition patch trusted. Patch entry P4.
- verify/submission-nine — low: docs/submission.md "9 closed Turn kinds" stale — verified by read. Patch entry P5.
- Entries: P1 typed-race double-speak/dup-transcript (code, both sides + tests); P2 post-advance transcript/panel pins; P4 guard pins; P5 stale kind-count docs. (P3 voided: replay pin verified present.) No intent_gap/bad_spec; no loopback.

## Design Notes

Consent currently doubles as the introduction ("I'm Aria…" inside the ask) by frozen naming-spec design; the decided shape splits the introduction into its own turn ahead of consent. The cold-open auto-start speaks the intro immediately, pre-gesture, via the existing MMS-to-synthesis fallback, then the consent ask follows automatically.

## Verification

**Commands:**
- `npm test` (in `/tmp/voice-idv-cold-open`) -- expected: green, no new skips or failures
- When client JS changes: extract the client `<script>` from served `/page` to `/tmp/page-client.js`, then `node --check /tmp/page-client.js` -- expected: parses clean
