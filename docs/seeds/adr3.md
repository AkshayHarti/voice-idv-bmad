# Stage is moved by code; the LLM only writes Turns

A single "current state" that both the backend and the language model can write
would let the model advance the flow — which means the model can, in effect,
decide a run is ready to compare or ready to pass. We keep two vocabularies: a
**Stage** enum owned exclusively by backend code, advancing only when a Check or
capture actually returns, and **Turns** (spoken intents) which the LLM may
compose freely from a closed set.

**Consequences**: the LLM cannot skip a capture, cannot shorten a wait, and
cannot report a result that has not been computed — the worst it can do is
produce an unhelpful sentence. Stage transitions become a small, testable state
machine with no model in the loop. Because Turns are a closed set, the
deterministic template fallback is trivial to write and the voice layer can be
tested without any model at all.
