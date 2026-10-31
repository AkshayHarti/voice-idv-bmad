# A Decision is a conjunction of named Checks, never a score

A verification result could be presented as a single 0–100 confidence value, a
weighted average of Checks, or a plain conjunction: `verified` only if every
Check passed. We chose the conjunction because a weighted score is
unfalsifiable — a viewer cannot tell what 87/100 means, cannot audit it, and
cannot see which specific test failed. For a demo whose argument is "you can
trust this without a screen to read", an opaque number undermines the argument.

**Consequences**: every Check must be individually nameable and must carry
Evidence, so the Report is a list of 20 results rather than one figure.
`inconclusive` is a first-class outcome and never counts as a pass, which means
the system can refuse to decide rather than guess. We give up the ability to say
"95% confident", which some viewers will expect.
