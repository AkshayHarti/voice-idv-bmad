---
title: 'Meta live reachability: parse nested shape, request fast responses'
type: 'bugfix'
created: '2026-11-03'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: ["{project-root}/_bmad-output/specs/spec-meta-live-reachability/SPEC.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Live Meta calls never serve: the parser reads only flat `output_text`/`choices` shapes while the API returns nested `output/message/content` parts, and requests default to high reasoning effort (~6s) against a 1s abort.

**Approach:** Parse the nested message shape, ask for fast responses, and measure live latency before any timeout change — fallbacks and never-throw behavior unchanged.

</frozen-after-approval>

## Implementation Notes

- Live probe first: `reasoning.effort=low` accepted at 5.8s, `minimal` accepted at 2.3/2.5/7.7s. Variance rules out any sub-8s budget that serves reliably.
- `src/providers.ts`: `responseText` walks `output[].message.content[]` for `output_text` parts (flat + choices shapes kept first); narration sends `reasoning: {effort: "minimal"}` with an explicit 8000ms timeout. Audit keeps default effort (quality, off voice path, 8s already fits); segmentation untouched (regions shape, 8s already).
- `test/audit.test.js`: nested-shape stub (recorded shape) for narration (asserts minimal effort) + audit (asserts default effort); flat-shape tests untouched.
- Live verification via app code: `provider: meta`, 2513ms, no skips — first live serve. SPEC open question settled on measured basis.
- No live calls in the suite; probes used the repo-local key with user authorization.
- Review (blind hunter, 12 findings): user chose 8s-inline over the ≤1000ms header rule — header + SPEC constraint reconciled to measured reality. Patched: null-guard in responseText, logSpend on narration serve, timed/classified skip reasons (Abort→timeout+ms, keeps `meta:` prefix), legacy/empty-shape unit tests, latency basis rendered into SPEC. Deferred: multi-part concat, choices-array content, custom-model reasoning escape (all need observed payloads). Re-verify live after patches: provider meta, 1912ms.
