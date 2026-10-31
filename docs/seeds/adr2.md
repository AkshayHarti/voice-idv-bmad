# The LLM narrates; deterministic code decides

The obvious build asks a language model to "check 20 fraud patterns" on a
Document image and describe what it finds. We split the two instead: every Check
is deterministic code with a stable id and computable Evidence, and the LLM's
only job is to turn a CheckResult into one spoken sentence.

**Why**: a model asked to assess fraud will produce confident prose about checks
it never performed, and the failure is invisible in a demo — the output looks
identical whether or not anything was tested. Determinism also makes the Checks
unit-testable against Fixtures with recorded ground truth, and lets the LLM be
removed entirely (a deterministic template renders the same Turn) if it is slow,
rate-limited, or unavailable during a live demo.

**Considered options**: LLM-as-judge for all 20 patterns (fast to write, no
Evidence, untestable); hybrid where the LLM decides borderline cases (keeps the
hallucination surface, adds a second failure mode).

**Consequences**: the "20 patterns" claim is only as good as the 20 checks, so
the count is fixed by code rather than by prompt length. Voice output degrades
gracefully to templates instead of failing with the model.
