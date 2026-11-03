---
title: 'VIC driver licence support, defaulted'
type: 'feature'
created: '2026-11-02'
status: 'done'
route: 'dispatch'
baseline_commit: '80d863b4151fa72c9cbf278cdb0aeb16b1552aa2'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Licence support is NSW-only (`au_dl.ts` carries NSW literals, fixtures and tests key on `nsw-dl-clean`), so the demo cannot run a Victorian licence.

**Approach:** Add VIC as an additive sibling (state-table entry, licence format, parser, fixtures) and make `vic-dl-clean` the API default; every NSW row, value, id, and pin stays byte-identical.

## Boundaries & Constraints

**Always:** Additive-only changes; all existing NSW tests stay green unmodified; check ids/semantics, DVS shapes, Decision conjunction, and `--no-meta` parity (extended to every new fixture) preserved; no full licence/card numbers in logs (AU §6 minimisation).

**Never:** Edit NSW table rows, parser, fixtures, or ground-truth values; remove or rename any fixture; change `card_number_present`/sticker/expiry semantics; invent DVS formats without marking them pilot-unverified assumptions.

**Decisions:** VIC formats ASSUMED (licence 9 digits, card number on back; pilot-unverified, DVS confirms). Default scope is RUN_IDS_FIRST_ONLY (NSW test pins stay).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY VIC clean | `vic-dl-clean` full run | Decision verified, no failures | N/A |
| VIC missing back | `vic-dl-missing-back` | `card_number_present` fails, Decision rejected | Same shape as NSW missing-back |
| API default | POST /api/session without fixtureId | Session opens on `vic-dl-clean` | N/A |
| NSW untouched | Full suite | Every NSW pin passes unmodified | Any NSW red blocks the change |
| Unknown fixture | POST /api/session with bad id | Existing 4xx behavior unchanged | No new error surface |

</frozen-after-approval>

## Code Map

- `src/au_dl.ts` -- STATE_TABLE (:31), LICENCE_FORMATS (:39), DLFields state literal (:24), parseNSWDL (:58), validateLicenceNumber (:48, zero callers); add VIC entries + VIC parser, never edit NSW rows.
- `src/fixtures.ts` -- DLFixture.state (:19), NSW constants (:79-89), entries (:95-157); add VIC constants + vic-dl-clean/missing-back entries.
- `src/measurements.ts:40` -- sole parseNSWDL caller; dispatch au_dl fixtures to the VIC parser by state, NSW path untouched.
- `src/index.ts:55` -- RUN_IDS order (default is [0]); :564 default wiring; :498 /api/runs order.
- `src/checks.ts:215-237`, `src/dvs.ts:24`, `src/flow.ts:378` -- consume DLFields generically; no NSW literals, no changes expected.
- `test/au_dl.test.js`, `test/checks.test.js`, `test/meta-demo.test.js`, `test/glimmer.test.js` -- NSW pins + parity loop; mirror for VIC, never weaken NSW.
- FROZEN (additive touch only where listed above): `src/checks|dvs|fraud|mrz|au_dl|measurements|redact.ts`, Decision conjunction, all NSW values.

## Tasks & Acceptance

**Execution:**
- [x] `src/au_dl.ts` -- widen state union, add VIC STATE_TABLE + LICENCE_FORMATS entries, add VIC parser mirroring parseNSWDL -- additive sibling, NSW rows frozen.
- [x] `src/fixtures.ts` -- add VIC_CLEAN front/back constants + vic-dl-clean and vic-dl-missing-back entries -- VIC ground truth.
- [x] `src/measurements.ts` -- dispatch au_dl fixtures to the NSW/VIC parser by fixture state -- VIC flows through checks/DVS/Decision.
- [x] `src/index.ts` -- add vic-dl-clean to RUN_IDS at [0] -- API default + first button become VIC.
- [x] `test/au_dl.test.js` + `test/checks.test.js` -- mirror VIC pins (clean verified, missing-back fails, sticker mismatch fails) -- VIC proven like NSW.
- [x] `test/meta-demo.test.js` -- extend parity coverage to VIC fixtures (or confirm the loop picks them up) -- freeze requires parity on every fixture.

**Acceptance Criteria:**
- Given a VIC clean fixture, when the full run completes, then the Decision is verified with zero failures.
- Given POST /api/session with no fixtureId, when the session opens, then its fixture is vic-dl-clean.
- Given the full suite, when it runs, then every pre-existing NSW assertion passes unmodified.
- Given a VIC missing-back fixture, when evaluated, then card_number_present fails exactly as the NSW missing-back does.

## Implementation Notes

- Dispatch build: VIC state entry + 9-digit format (ASSUMED pilot-unverified) + parseVICDL + vic-dl-clean/missing-back fixtures + state dispatch + RUN_IDS[0]; NSW byte-identical. Suite 142 pass.
- Host added the missing unknown-fixture matrix pin during step-03 audit (no covering test existed). Review round 1: 15 findings (4 low patched, 10 false, 1 rejected spec-edit). Implementer followup lost tool access again, so the host applied all 5 patches directly: back-requirement comment, licence-format pins, null-back fallback assertions (au_dl + checks), id-echo assert. Suite 144 pass / 1 pre-existing live-Meta skip.

## Spec Change Log

## Review Triage Log

- [blind] fixtures.ts "NSW requires back" comment stale after VIC widening — verdict: low — evidence: comment at :99 predates the VIC union and misleads the next state adder; route: patch (direct correction).
- [blind] VIC licence regex untested; validateLicenceNumber still callerless — verdict: low — evidence: widened dead export carries the pilot-unverified pattern with no valid/invalid pin; route: patch (test-only pin).
- [blind] No VIC card-number format; masking/DVS/evidence unspecified — verdict: false — evidence: NSW has no card format either (presence-only, sibling pattern), redactRef is fully generic (last-2 masking), and DVS/checks consume DLFields generically.
- [blind] parseVICDL duplicates parseNSWDL; dispatch ternary duplicated — verdict: false — evidence: duplication is the spec-mandated tradeoff; sharing a helper would edit the frozen NSW parser the spec requires byte-identical.
- [blind] VIC lacks expired/sticker/glare/tilt fixtures vs NSW — verdict: false — evidence: no expired-DL fixture exists for NSW either, and the in-memory sticker mutation matches the NSW test technique; VIC mirrors the required core pair.
- [blind+verif-gap] VIC null-back fallback shape unverified at both levels — verdict: low — evidence: pre-verified gap (au_dl never calls parseVICDL(front,null); checks never reads the missing-back sticker result); a bad fallback ships green; route: patch (both assertions).
- [blind] Default test omits rest-of-order, NSW presence, loop-cap proof — verdict: false — evidence: the decided assertion fails on cap-hit, NSW presence is covered by the green NSW suite, and full-order pinning is brittle overspec beyond intent.
- [blind] Unknown-fixture test omits the id echo — verdict: low — evidence: body also carries `id: fixtureId` (src/index.ts:569), unpinned; route: patch (one assertion).
- [blind] No VIC redaction pin; spec lines stale — verdict: low — evidence: redaction half is false (redactRef generic, see above); spec-staleness half rejected, its only fix edits this build's spec.
- [edge] validateLicenceNumber with out-of-union runtime state throws — verdict: false — evidence: zero callers and a type-bounded parameter; the program cannot reach it.
- [edge] measurements dispatch mislabels an unknown state as NSW — verdict: false — evidence: state is type-bounded over a static fixture registry; unreachable.
- [edge] Test helper same unknown-state dispatch — verdict: false — evidence: same type-bounded reachability; test-only regardless.
- [edge] parseVICDL with null front throws raw TypeError — verdict: false — evidence: front is non-null by type and the frozen NSW sibling has the identical shape; guarding VIC alone would diverge.
- [edge] Missing parsed_address flows undefined into evidence — verdict: false — evidence: required by type and always present in fixtures; partial-OCR robustness belongs to the deferred OCR story.

## Verification

**Commands:**
- `npm test` -- expected: full suite green, new VIC pins passing, zero NSW modifications.
- `npm run build && PORT=8787 npm start`, POST /api/session {} -- expected: fixture vic-dl-clean.
