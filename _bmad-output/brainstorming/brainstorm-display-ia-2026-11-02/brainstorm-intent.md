# Intent: Display IA for the User Screen

Source: brainstorm session 2026-11-02. Goal: display plan for what the user sees per surface and stage.

## Bedrock truths

Every screen element must earn its place under these three:

1. User knows what to do at this moment (current action).
2. User knows where they are in the process (position) — so failure is locatable: which parts they could not complete.
3. User gets proven-vs-attempted, not just done-vs-failed.

## Five-moment tree

1. **Welcome** the user.
2. **Consent** — fork: consent → doc capture; deny → spoken thank-you + exit.
3. **Doc capture** — happy: capture frame, guide to perfect image, detect fraud/distress and report to backend. Unhappy: no camera permission → guide to enable; expired doc → spoken aloud; unclear doc.
4. **Selfie capture** — mirrors doc (happy + unhappy).
5. **Done** — fork: verified → thanks-complete; failed → sorry-retry.

Unhappy-ending template (from expired-doc): red blinking frame border signals failure, all captures deleted, branch ends on 3-min timeout or tab close.

## MoSCoW

Must (9): current-action, position, five-moment flow, doc unhappy paths, done copy, selfie-mirrors-doc, always auto-capture, post-capture confirm+retry, voice+transcript coaching.
Should (3): proven-vs-attempted states, expired-doc ending, deny thank-you exit. Could/Won't: empty.

## Voice-first hierarchy

Voice leads, transcript proves, chrome corroborates. Crown jewel is the coach card (not the capture frame); without it, coaching survives as voice plus transcript mirror. Proven-vs-attempted displays through the transcript-as-proof-record.

## OPEN: auto-capture contradiction

User verdict kept clusters 1, 2, 4 (bedrock, tree, voice-first) and dropped cluster 3 (auto-capture direction). This contradicts MoSCoW Musts 10/11 (always auto-capture, confirm+retry). Downstream work must re-vote: either restore auto-capture or subsume it as a mechanism under voice-first. Do not assume.
