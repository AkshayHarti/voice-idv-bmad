# Meta API spend log

Credit ceiling: **$150**. Tripwire: **stop and report at $120 projected (80%)**.
Every Meta API call is logged here: model, calls, est. cost, running total.
`SPEND_LEDGER` in `src/meta-models.ts` is the in-memory mirror for tests;
this file is the durable, human-audited record.

| Date (UTC) | Task | Model | Calls | Est. cost (USD) | Running total (USD) | Notes |
|---|---|---|---|---|---|---|
| 2026-11-01 | 0 | — | 0 | 0.00 | 0.00 | Live probe blocked: sandbox egress outage (all api.meta.ai calls hang, auth or not). IDs/prices in `src/meta-models.ts` are UNVERIFIED candidates. Re-probe in Task 4. |
| 2026-11-01 | 1 | sam-3 | 0 | 0.00 | 0.00 | Meta branch verified via stub fetchers only; no live calls (egress still down). |
| 2026-11-01 | 2 | muse-spark-1.3 | 0 | 0.00 | 0.00 | Audit + narration verified via stub fetchers only; no live calls (egress still down). |
| 2026-11-01 | 3 | glimmer | 0 | 0.00 | 0.00 | Art script run: 1 bare 404, rest hung (egress flaky ~1/15 through). No image billed. Art pending rerun; fixtures + ground truth green. |
| 2026-11-01 | 4 | all | 0 | 0.00 | 0.00 | Meta report path verified via stubs; live test skips without key in env. No live calls billed. |
| 2026-11-04 | ASR | muse-voice-transcribe-1.0 | 1 | 0.00 | 0.00 | ID verification probes: /models lists the ID; /responses rejects it (model_not_found — ASR has its own endpoints); POST /v1/asr/transcribe 200 on a 0.56 s tone (empty transcript, ~$0.00003). Request shape: multipart request{mode,audioEncoding}+audio WAV. |

Running total: **$0.00**
