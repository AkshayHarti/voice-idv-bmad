# Aria — Voice-First IDV — Cerebral Valley submission (indie track)

## The problem

Every KYC flow assumes you can read a screen, find a button, and line up a
document inside a box. Blind and low-vision people are excluded from all of
them — and the exclusion is invisible, because the flow looks fine to
everyone else. This demo does the same verification work with the visual
channel removed: instructions spoken, document read by Aria, result
spoken back, with a transcript on screen only for sighted observers.

## What Meta tooling does here (beyond basic)

- **SAM 3** — live segmentation behind the capture stages: passport
  MRZ/photo zones, the NSW DL back card-number region, face quads in
  challenge frames. Region crops sit behind every check as Evidence.
  Falls back to exact fixture geometry when no image is present.
- **Muse Spark** — live narration (polishing the 8 closed Turn kinds) plus
  the adversarial self-audit: 3 attack hypotheses per report ("how a human
  could have fooled me, and whether it was caught"), shown in the Attack
  Surface panel. Template-first: a late model turn is discarded, never
  spliced, holding the 1.5s first-audio floor.
- **Glimmer** — visual bases for edge-case fixtures (glare, tilt). The MRZ
  and card-number regions are always composed programmatically, so ground
  truth stays exact and the art is backdrop only.

The decision engine is deterministic code and frozen: models narrate and
segment only, they never decide. `--no-meta` decides identically to
`--meta` on every fixture (parity test).

## Architecture in 5 lines

1. Hono + TypeScript server, one page: voice-guided stage machine (code
   moves stages; speech resolves prompts only).
2. Check engine: named checks with computed Evidence; Decision is a
   conjunction — `verified` iff all pass, `inconclusive` never approves.
3. Provider chains: Meta → OpenRouter/Replicate → local templates /
   fixture geometry; every link records why it was skipped, never throws.
4. DVS stub gateway + risk tier (auto-approve / step-up / silent hard
   flag); consent gate with full capture purge on deny/revoke.
5. `--meta` report path adds the Spark audit + providers used + spend to
   the same deterministic Decision; Decision screen renders checks
   failures-first with the limitations block and Attack Surface panel.

## Judging-criteria map

- Impact 30% — the blind/low-vision access story above; full run by voice.
- Tooling 25% — SAM-tracked capture, adversarial audit, Glimmer edge cases.
- Depth 20% — deterministic check core, 30+ tests, parity + degradation pinned.
- Demo 25% — 2:15 video (below) + live `--meta` run at the demo URL.

## Demo

- URL: `TBD — deploy pending (wrangler)`; local: `npm start` → `/page`
- Video (2:15): `TODO — shoot Nov 1` — problem 15s → clean 45s →
  tampered 40s → Decision screen 25s → limitations 10s.

## What this does not claim

Not liveness certification — motion confirms responsiveness only. Not
forgery proof — splice-not-found is not authenticity. Uncertified match —
face similarity is a value + band, uncertified. Enforced in code and UI copy.

## Spend

See `docs/spend.md`. Total: **$0.00** of $150 credits (all live paths
verified via stub fetchers; live verification pending a healthy network
path — the sandbox egress to api.meta.ai hangs on most attempts).
