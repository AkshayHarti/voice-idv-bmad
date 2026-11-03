---
id: SPEC-customer-view
companions: []
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Customer Result View

## Why

Mandate to meet: privacy regulation requires verification evidence to stay off the end-user screen. Today the demo renders raw check soup to the person being verified (seven identical `n/a for au_dl` lines); the customer who needs that evidence has no dedicated surface. This spec splits the audiences: the end user gets the verdict moment, the customer gets the evidence room.

## Capabilities

- **CAP-1**
  - **intent:** End user completes verification seeing only the verdict moment (banner + spoken confirmation) with no check details.
  - **success:** A decided run's end-user surface contains zero check ids, evidence values, or Attack Surface content; the verdict banner and spoken confirmation still render.
- **CAP-2**
  - **intent:** Customer opens a result-view page for an end-user run to review the verdict and its evidence.
  - **success:** Given a valid run link token, the page renders verdict, tier message, failures-first evidence, limitations, and the Attack Surface panel for that run; given a wrong token, it renders nothing run-specific.

## Constraints

- Customer page gated by unguessable run link token: one link views one run only; tokens expire after one day.
- Customer view renders the same deterministic report the run produced; no second decision path, no recomputation.
- Customer page is silent and read-only: no voice layer, no inputs that mutate state.
- End-user surface must contain zero check ids, evidence values, or Attack Surface content (assertable absence).

## Non-goals

- No customer accounts, login, run lists, or history — one link, one run, read-only.
- Customer view never re-runs checks or alters the verdict.

## Success signal

- A DL run ends with the end user seeing only Verified, while the customer link for that run renders the full evidence — and a wrong token renders nothing.
