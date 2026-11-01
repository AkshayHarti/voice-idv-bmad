# Meta API spend log

Credit ceiling: **$150**. Tripwire: **stop and report at $120 projected (80%)**.
Every Meta API call is logged here: model, calls, est. cost, running total.
`SPEND_LEDGER` in `src/meta-models.ts` is the in-memory mirror for tests;
this file is the durable, human-audited record.

| Date (UTC) | Task | Model | Calls | Est. cost (USD) | Running total (USD) | Notes |
|---|---|---|---|---|---|---|
| 2026-11-01 | 0 | — | 0 | 0.00 | 0.00 | Live probe blocked: sandbox egress outage (all api.meta.ai calls hang, auth or not). IDs/prices in `src/meta-models.ts` are UNVERIFIED candidates. Re-probe in Task 4. |

Running total: **$0.00**
