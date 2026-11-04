---
title: 'Server OCR on locked crops, rendered on customer page'
type: 'feature'
created: '2026-11-02'
status: 'done'
route: 'dispatch'
baseline_commit: 'd771b485b3551adf2d90336d28be276c5cab6cf2'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Captures are opaque refs and the report derives from fixture ground truth, so the customer page never shows details read from the actual captured document.

**Approach:** Post the locked doc crop at lock time, extract fields server-side via Meta vision OCR, attach them to the capture, and render a redacted details section on the token-gated customer page (HTML + JSON twin).

## Boundaries & Constraints

**Always:** Only locked doc-front/doc-back crops traverse TLS (never viewfinder frames, never selfie/challenge pixels); crop bytes dropped immediately after OCR (refs + fields only); fields rendered with esc() + redactRef; Meta call follows the segment pattern (image_base64, 8s budget, spend logged after success, skipped[] on failure, never throws); customer page stays read-only, silent, no-store/noindex.

**Never:** Feed OCR fields into checks/DVS/Decision (frozen core decides from fixture measurements; OCR is display-only); new consent disclosure (Rev 2 §8 + AU §§2-4 already cover locked-crop OCR); OCR details on the end-user /page (verdict-only); raw crops or full numbers in logs; offshore OCR fallback.

**Decisions:** FALLBACK is FIXTURE_LABELED (offline renders fixture fields labeled as fallback).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY OCR | Lock with crop, Meta keyed | Fields extracted, stored on capture, rendered redacted on customer page | N/A |
| Meta fails | Timeout/error/unkeyed | Per FALLBACK decision (fixture-labeled or omitted) | skipped[] records why; run continues |
| Retake/deny | Pending discarded / revoked | Pending fields dropped with the ref; deny purges stored fields + token | Same lifecycle as captures |
| Oversize crop | Crop beyond cap | Lock still succeeds; OCR skipped with reason | Never 4xx a lock for OCR |
| Non-doc lock | Selfie/challenge lock | No OCR attempted, no section for that capture | N/A |

</frozen-after-approval>

## Code Map

- `src/index.ts` -- performLock (accept crop, run OCR, store fields), Session captures store, reportFor/evaluateFixture (attach fields), resultDecidedPage + /api/result twin (render section), purgeCaptures/doKeep/doRetake (field lifecycle).
- `src/providers.ts` -- clone segment Meta block (image_base64 + 8s, :256-262) into an OCR call parsed with responseText (:85); reuse postJson timeouts, configuredProviders keys, skipped[] conventions.
- `src/meta-models.ts` -- wonder is the only text-from-image candidate (provisional); pin + price the OCR call; logSpend after success only.
- `src/redact.ts:5` -- redactRef (last-2 masking); checks.ts:146,160,220 redacted-evidence pattern to follow.
- `test/result.test.js` -- CHECK_IDS/REPORT_KEYS pins, HTML + JSON twin pins, expiry/read-only pins; extend, never weaken.
- `test/sam.test.js`, `test/audit.test.js`, `test/meta-models.test.js` -- provider test patterns (stub pin, fallback, live-meta skip).
- FROZEN: checks/DVS/fraud/mrz/au_dl/measurements/redact semantics, Decision conjunction, fixture ground truth, token gate/TTL.

## Tasks & Acceptance

**Execution:**
- [x] `src/providers.ts` (+ `src/meta-models.ts` pin/price) -- add OCR call: crop in, DL fields out; Meta-first, skipped[] fallback, never throws -- the extraction engine.
- [x] `src/index.ts` server -- accept locked crop on lock, run OCR, store fields keyed by capture ref; drop crop bytes after OCR -- fields enter the pipeline.
- [x] `src/index.ts` server -- attach stored fields to the report; purge/discard with their capture -- lifecycle matches captures.
- [x] `src/index.ts` RESULT template + JSON twin -- render redacted OCR details section from the same report object -- customer-visible details.
- [x] `src/index.ts` client -- post the locked snapshot crop with the lock request (doc stages only); cap size client-side -- the only new pixel flow.
- [x] `test/result.test.js` + provider tests -- pin OCR section shape (HTML + twin), redaction, fallback behavior, lifecycle purge -- matrix edge coverage.

**Acceptance Criteria:**
- Given a doc lock with Meta keyed, when the customer page opens, then it shows the extracted fields redacted alongside the existing report.
- Given OCR unavailable, when the customer page opens, then it follows the FALLBACK decision and the run is otherwise unaffected.
- Given any lock, when OCR fails or the crop is oversize, then the lock still succeeds with the standard confirm card.
- Given retake or deny, when captures are discarded, then their OCR fields are discarded with them.
- Given the end-user page, when a run completes, then zero OCR details appear (verdict + link only).

## Implementation Notes

- Dispatch build: ocrCrop provider call (Wonder pin, 8s, spend-after-success, never throws), locked-crop post on doc locks, per-ref field store with immediate crop drop, report attach + lifecycle purge, redacted customer twins, fixture-labeled fallback. Suite 154 pass.
- Review round 1: 22 findings (1 high, 2 medium patched; 1 medium + 2 low deferred/rejected; 11 false; 1 low rejected as spec-edit). Implementer followup lost tool access a third time, so the host applied all patches directly: DL-kind OCR gate, layered-cap comment, aria-hidden bullets, performLock staleness guard + verdict fallback, and 8 test additions (passport skip, partial reads, mixed sources, non-image crop, action-form crop, HTML escaping, empty JSON, deny-mid-await resurrection). Suite 161 pass / 1 pre-existing live-Meta skip.

## Spec Change Log

## Review Triage Log

- [blind] reportFor mutation leaks OCR across sessions if shared — verdict: false — evidence: evaluateFixture builds a fresh object literal per call (verified in code); nothing is shared.
- [blind] Fixture fallback shows fake PII for real docs — verdict: low — evidence: rejected; FIXTURE_LABELED is the human-approved frozen decision on synthetic demo data, so the only fix renegotiates the spec.
- [blind+edge] Passport doc locks OCR under DL field labels — verdict: medium — evidence: ocrSide keys on stage only, but passport runs have doc stages; keyed passport locks would render DL-labeled garbage as ocr-sourced; route: patch (gate on fixture kind au_dl + test).
- [blind] Brace-slicing drops prose-braced/numeric reads; partial reads lack a side indicator — verdict: false — evidence: every path degrades to the designed fallback/unread outcome; per-field "unread" is the completeness signal and no bad outcome was demonstrated.
- [blind] Numbers untrimmed; "unread" collision; silent 200-truncation — verdict: low — evidence: unreachable via OCR (provider trims + drops empties); collision/truncation are negligible cosmetics whose fix exceeds direct correction; rejected.
- [blind] No MIME/base64 validation; undocumented layered caps; silent skips — verdict: low — evidence: validation half false (garbage fails safe to labeled fallback, spend only after success); cap-rationale half patched (one comment).
- [blind] handleLock re-parses a consumed body on the alias path — verdict: false — evidence: redundant but harmless; re-parse triggers only when no crop key exists (call site always passes the key), yielding null either way.
- [blind] In-memory PII retention; discarded skipped[]; unenforced never-logged — verdict: false — evidence: retention matches the accepted session-map pattern and clearing on decide would break the token-served report; no request-body logging exists to enforce against; skipped-reason surfacing would add new surface for nil everyday harm (rejected).
- [blind] Decorative bullets lack aria-hidden — verdict: low — evidence: one-attribute direct correction on the new markup; route: patch.
- [blind] Snake-case keys, no unavailable message, no voice mirror on customer page — verdict: false — evidence: consistent with the frozen customer-view contract (snake ids, silent read-only surface, mandated shape preservation).
- [blind] No behavioral tests for OCR units/paths — verdict: false — evidence: test/ocr.test.js behaviorally covers ocrCrop, precedence, fallback, validation, and twin parity (10 tests); only client takeCrop is source-text, sharing the repo's no-harness constraint.
- [edge] OCR-await race family: null-verdict hold, stale clobber, stale attach, deny resurrection — verdict: high — evidence: the 8s OCR await splits performLock with no staleness check, so mid-await keep/deny/signal corrupts or resurrects state (revoked-field resurrection is the sharp edge); route: patch (post-await guard + verdict fallback + resurrection test).
- [verif-gap] Partial reads render "unread" unpinned — verdict: low — evidence: pre-verified regression gap; route: patch (partial-JSON twins test).
- [verif-gap] Mixed per-side sources never built — verdict: low — evidence: pre-verified regression gap; route: patch (one-sided OCR test).
- [verif-gap] Non-image crops skip untested — verdict: low — evidence: pre-verified regression gap; route: patch (non-image crop test).
- [verif-gap] Action-form lock crop path untested — verdict: low — evidence: pre-verified regression gap; route: patch (/capture-with-crop test).
- [verif-gap] OCR HTML-escaping untested — verdict: medium — evidence: pre-verified gap on a markup-injection boundary (behavior correct, unpinned); route: patch (HTML-special values test).
- [verif-gap] Empty-JSON null contract untested — verdict: low — evidence: pre-verified regression gap; route: patch ({} / unknown-keys test).
- [verif-gap] Client takeCrop source-text-only — verdict: medium — evidence: pre-verified; no DOM/canvas harness exists and failure degrades fail-safe to labeled fallback; route: defer.

## Verification

**Commands:**
- `npm test` -- expected: full suite green, OCR section/redaction/fallback/lifecycle pins passing.
- Live-keyed probe (optional, needs META_API_KEY): lock with a real crop, assert extracted fields render; unkeyed run asserts fallback.
