---
id: SPEC-meta-live-reachability
companions: []
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Meta Live Reachability

## Why

Pain to kill: every Meta call falls back to local even with a valid key — the app aborts at 1s while the API needs ~6s, and the parser cannot read the nested message shape it returns. Live models never serve, and §12 verification stays blocked.

## Capabilities

- **CAP-1**
  - **intent:** Provider chain parses the live nested message shape so a completed Meta response yields its text.
  - **success:** Given a recorded live payload (output/message/content/output_text), the parser returns the spoken sentence; given the old flat shapes, it still returns them.
- **CAP-2**
  - **intent:** Requests ask for fast responses, and measured latency decides any timeout change.
  - **success:** Live-keyed probe reports per-call latency with low reasoning effort; timeout edits happen only with a measured basis recorded.

## Constraints

- Fallback chains and never-throw behavior unchanged; local templates still serve when Meta is slow or down.
- No timeout raised without a measured latency basis; the voice-turn latency budget stays intact.
- No live Meta calls in the test suite; live verification is a manual keyed probe.

## Non-goals

- No new model roles or roster changes.
- No retry storms or backoff machinery; one attempt per turn, then fallback.

## Success signal

- A live-keyed narration call returns `provider: meta` with the spoken sentence — or the skip reason names the exact measured cause (latency vs shape vs auth).

## Open Questions

- Does the API accept a low reasoning-effort parameter, and what latency does it yield? (Settled by the keyed probe during build.)
