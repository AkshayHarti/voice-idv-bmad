# Display Plan — What the User Sees

**IA principle:** Voice leads, transcript proves, chrome corroborates.

## Bedrock truths

1. **What now** — the user knows what to do at this moment.
2. **Where am I** — the user knows their position in the five-moment flow, so any failure is locatable.
3. **Proven vs attempted** — the user sees proven-vs-attempted, not just done-vs-failed, via the transcript-as-proof-record.

## Per-moment display

| Moment | Happy | Unhappy / fork |
|---|---|---|
| 1. Welcome | Current action + position; idle until doc appears | — |
| 2. Consent | Consent → proceeds to doc capture | Deny → spoken thank-you + exit |
| 3. Doc capture | Capture frame shown; voice+transcript coach guides to processing-ready image; auto-capture when ready; post-capture confirm + retry; fraud/distress reported to backend | No camera permission → guide to enable; unclear doc → re-coach to recapture; expired doc → spoken aloud + unhappy ending below |
| 4. Selfie | Mirrors doc: coach to natural face, auto-capture when processing-ready, confirm + retry | Mirrors doc unhappy paths |
| 5. Done | Verified → thanks-complete | Failed → sorry-retry |

Coaching survives as voice + transcript mirror even without the coach card; the capture frame is subordinate chrome.

## Unhappy-endings template (from expired-doc ending)

- **Signal:** red blinking frame border + spoken failure aloud.
- **State handling:** all captures deleted; transcript records attempted, not proven.
- **Termination:** branch ends on 3-min timeout or tab close.

## Open questions

- **Auto-capture re-vote:** dropping cluster 3 (auto-capture direction) contradicts MoSCoW Musts 10–11 (always auto-capture, post-capture confirm+retry). Re-vote, or keep auto-capture as mechanism under voice-first?
- **Red-blink vs reduced-motion:** blinking red border is the failure signal — what is the reduced-motion / non-color equivalent that still reads as terminal?
