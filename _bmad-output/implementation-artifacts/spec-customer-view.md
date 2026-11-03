---
title: 'Customer result view: token-gated evidence page, verdict-only end user'
type: 'feature'
created: '2026-11-03'
status: 'done'
route: 'dispatch'
baseline_commit: '6535c36fd386eb71c4bfd22e1eab312f8326e48f'
review_loop_iteration: 0
context: ["{project-root}/_bmad-output/specs/spec-customer-view/SPEC.md", "{project-root}/docs/specs/2026-11-02-voice-assistant-idv-spec.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Privacy regulation requires verification evidence off the end-user screen, but the demo renders full check soup to the person being verified while the customer has no dedicated result surface.

**Approach:** Strip the end-user page to the verdict moment (banner + spoken confirmation) and add a token-gated, silent, read-only result page rendering the same deterministic report for one run.

## Boundaries & Constraints

**Always:** one link token views one run only; tokens expire after one day; customer page renders the same report the run produced (no recomputation, no second decision path); end-user surface keeps zero check ids, evidence values, or Attack Surface content; spoken quality verdicts ("sharp, all four corners in") stay — they are voice confirmations, not check evidence. DECISION link-delivery: end-user decision shows a copyable customer link beside the verdict. DECISION undecided-run: valid token on an undecided run renders a pending state naming the stage.

**Never:** no customer accounts, login, run lists, or history; no re-running checks or altering verdicts from the customer page; no voice layer or state-mutating inputs on the customer page; no transcript on the customer page (SPEC content list is exhaustive); no changes to `runChecks`/`decide`, intents, stages, or `signal()`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| decided end-user | run reaches decided on /page | verdict banner + spoken confirmation render; no checks/evidence/audit anywhere | N/A |
| customer view | GET result page + valid token, decided run | verdict, tier, failures-first evidence, limitations, Attack Surface for that run | N/A |
| wrong token | GET result page + unknown token | nothing run-specific renders | 404, no report keys leak |
| expired token | GET result page + day-old token | same as wrong token | 404, no report keys leak |
| token reuse | same token twice | same report both times (read-only, no side effects) | N/A |
| link delivery | run reaches decided | copyable customer link beside the end-user verdict | N/A |
| undecided run | valid token, run not decided | pending state naming the stage; evidence lands at decision | N/A |

</frozen-after-approval>

## Code Map

- `src/index.ts:77-108` -- `Report` shape + `evaluateFixture` (deterministic report builder; reuse verbatim, never recompute).
- `src/index.ts:187,235-257,474-477` -- `sessions` Map, `sessionId()`/`fallbackId()` token minting, session creation; add a token→session store with 1-day expiry beside it.
- `src/index.ts:415-424` -- `GET /api/run/:id` (open fixture report; the customer page must NOT reuse this unauthenticated shape — gate by token).
- `src/index.ts:481` -- `reportFor` (null until decided; reuse for the decided gate).
- `src/index.ts:843+` -- `PAGE` template; strip checks/evidence/audit render, keep verdict banner + spoken line.
- `src/index.ts:1204-1299` -- `auditPanel` + `renderDecisionFromPanel` + `#decision/#tiermsg/#checks` (decision surface to relocate behind the token gate).
- `src/index.ts:839` -- `app.get("/page")` pattern; add the result route the same way (`c.html()` + template const).
- `test/page.test.js:9-13` -- `getPage()` helper pattern; clone for the result page + assertable-absence checks.
- `src/flow.ts`, `src/telemetry.ts`, `src/panels.ts` -- untouched (no flow, wording, or panel-schema changes).

## Tasks & Acceptance

**Execution:**
- [x] `src/index.ts` server -- token mint/store/expire + gated result endpoint serving the run's report -- the gate.
- [x] `src/index.ts` client -- silent read-only result template rendering the decision surface -- the evidence room.
- [x] `src/index.ts` client -- strip checks/evidence/audit from /page, keep verdict banner + spoken -- the mandate.
- [x] `test/result.test.js` -- token gate, expiry, read-only, absence, and matrix edge cases -- locks the split.

**Acceptance Criteria:**
- Given a decided run, when its end-user page renders, then no check id, evidence value, or audit content appears in the HTML.
- Given a valid token for a decided run, when the result page loads, then verdict, tier, evidence, limitations, and Attack Surface render for that run.
- Given a wrong or day-old token, when the result page loads, then no run-specific content renders.
- Given the full suite, when it runs, then all tests pass with no new skips.

## Implementation Notes

- Token: UUID minted per session at create (`mintResultToken`, reuses `sessionId()`), stored in `resultTokens` with `createdAt`; TTL 24h enforced in `resolveResultToken` (expired entries deleted on sight, indistinguishable from wrong tokens).
- Link delivery: every step body carries `customerLink: /result/<token>` (stable for the run's life); `/page` renders it beside the verdict only at decision (anchor + readonly field + clipboard copy button).
- Customer page `GET /result/:token`: server-rendered, no script/forms/voice/transcript. Decided → verdict, tier message, failures-first evidence, limitations, Attack Surface (audit via the same `generateAudit` chain as `--meta`, annotation only). Valid-but-undecided → 200 pending naming the stage. Wrong/day-old → 404 generic page (own minimal CSS so no report-key substrings leak).
- Gated JSON twin `GET /api/result/:token`: same gate; decided returns `reportFor(session)` verbatim (deepEqual-tested against the session's decided report); pending returns `{status:"pending",stage}`; wrong/expired returns `{error:"unknown_result"}` 404.
- `/page` strip: `renderDecisionFromPanel` is now verdict-banner + customer link only; `auditPanel`, checks/limitations/attack-surface render, and the on-demand `/api/run?meta=1` audit fetch are gone. `#tiermsg`/`#checks` nodes replaced by `#customerLink`. Spoken quality verdicts (`qualityVerdict`, `GENERIC_VERDICT`, `speak(pendingVerdict)`) untouched.
- Untouched per spec: `runChecks`/`decide`, intents, stages, `signal()`; `src/flow.ts`, `src/telemetry.ts`, `src/panels.ts`.
- Existing-test updates (intentional contract moves): `aria.test.js` decision headings assert absence on `/page` (presence moved to `result.test.js`), step-shape snapshots gain `customerLink`; same additive key in two `capture-flow.test.js` shapes; `page.test.js` `panelEvidence` assertion inverted to absence.

## Spec Change Log

## Review Triage Log

Pass 1 (blind + edge + vgap; 21 rows):

- [blind B1] `low` — token map has no sweep; matches the sessions map's established no-eviction ruling at demo scope. Rejected: a sweeper is new machinery for zero demonstrated harm.
- [blind B2] `false` — UUID collision reassigning a link is negligible; minting matches the pre-existing sessionId pattern which never checks either.
- [blind B3] `low` — deny/revoke leaves the token resolving to a fixture+stage pending page. → patch: delete the token in purgeCaptures + test (mandate-aligned, 2 lines).
- [blind B4] `false` — page naming its run is specified (CAP-2 + test); fixture-id encoding is pre-existing demo scaffolding, not this story's exposure.
- [blind B5] `low` — per-view audit cost/nondeterminism on the keyed path only; the 500 claim is disproven (generateAudit catches all and falls back locally). Rejected: caching is new state for demo-scale cost.
- [blind B6] `low` — JSON/HTML shape difference is intentional (report verbatim + tested); redaction is enforced upstream by the frozen checks pipeline, not at render. Rejected.
- [blind B7] `false` — conditional disproven: hard-flag reasons live only in `queue` per the Task 4 ruling, and the customer page never renders `queue`.
- [blind B8] `low` — result routes set no no-store/noindex headers. → patch: set both headers on both routes.
- [blind B9] `false` — restart invalidating links early is fail-safe, not a TTL violation; persistence was never in scope and matches sessions architecture.
- [blind B10] `low` — session-gone branch is unreachable (sessions never delete); the exact-24h boundary is arbitrary with both sides covered. Rejected.
- [blind B11] `low` — missing head/body is parser-harmless; CSS matches /page verbatim by design. Rejected as cosmetic.
- [blind B12] `false` — esc() output lands only in text context (single quotes harmless); customerLink is server-minted so the URL constructor cannot see a malformed value.
- [blind B13] `false` — keyless test env with a skipped live test is established convention; no suite runs keyed.
- [blind B14] `false` — view audit trails need identity, which the spec's non-goals explicitly exclude; unrequested scope is not a defect.
- [edge E1] `medium` — decided step JSON still ships evidence to the end-user browser. Duplicate of the verification deferral (payload-hardening); no new entry.
- [edge E2] `low` — same per-view audit cost as B5; grouped. Rejected.
- [edge E3] `low` — same unbounded-map shape as B1; grouped. Rejected.
- [edge E4] `false` — Math.random fallback is unreachable in supported runtimes (Node has WebCrypto); same pattern as sessionId minting.
- [vgap V1] `medium` — token/session cross-use unpinned; aliasing would silently grant session auth. → patch: cross-use assertions (filed disposition weighed).
- [vgap V2] `medium` — esc() unpinned; gutting it ships green. → patch: escaped-entity assertions on the passport page.
- [vgap V3] `medium` — link wiring pinned by substrings only; nulling the call-site passes. → patch: call-site wiring pins.

Routes: 5 patch entries (G1–G5), 0 new defer entries. No intent_gap/bad_spec — no loopback.

## Verification

**Commands:**
- `npm test` -- expected: all pass, 1 skip (live-meta, no key), no new skips.
- `npm test` -- observed 2026-11-03: 114 tests, 113 pass, 0 fail, 1 skip (pre-existing live-meta). 12 new tests in `test/result.test.js`, all passing.

**Manual checks (if no CLI):**
- End-to-end: verify on /page (verdict only), open the customer link (full evidence), retry with a wrong token (nothing).
