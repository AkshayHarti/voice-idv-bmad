# Accessibility Review (round 3)

Scope: `DESIGN.md` + `EXPERIENCE.md` (Halo spine, updated 2026-11-02), round-3 additions —
(a) auto-capture as primary with manual Lock fallback; (b) new Armed state (short run of
clean samples, guides settle, fixed hold-still beat "Hold still... captured", movement
interrupts and re-arms); (c) detection stays invisible; (d) the beat joins the
rotation-exempt fixed functional prompts — plus code-level review of
`.working/autofire-mock.html` (which, unlike last round's missing mock, now exists under
the design directory, so mock findings are verifiable this time). Founding requirement
unchanged: full run completable by voice + haptics with the screen unread.

## Overall verdict

**Not shippable as specified — the frame arms silently and fires on people who were never
told the rules.** Round 2's spine work was real: both prior criticals and nearly every
high are genuinely resolved (see resolution check). But round 3 smuggles in a new
eyesight gate wearing a convenience costume: the Armed state is entered, held, broken,
and re-entered with guides-settling as its only specified signal — a purely visual event
a screen-unread user never perceives. The interrupt contract (stillness fires, movement
re-arms) is disclosed nowhere, so a blind user who fidgets during the beat gets trapped
in silent re-arm loops with no diagnosis, and a blind user who holds still gets a shutter
they never consented to per-shot — in direct tension with the spine's own "silent
auto-capture is a consent violation" rejection. The Lock fallback, the one agency
restoring control, is specified as "stays visible" — visible to whom? Mock credits where
due: `alt=""` decorative image, 44px Keep/Retake/Lock targets, reduced-motion glow kill,
and a dashed→solid guide change (a real non-color cue) all verify clean. But the mock
ships zero live regions and never moves focus, so the code currently demonstrates the
exact silent experience this review condemns. Fix the two criticals and the veto/lock
highs before anything else.

## Prior-round resolution check

Checked `review-accessibility.md` against the current spine: both criticals resolved
(mandatory spoken + text quality verdict before keep/retake; TTS/SR arbitration with the
text twin as single live region and SR-yield rule). All five highs resolved (decorative
`alt=""` + verdict caption; assertive `alertdialog` confirm arrival ordered after the
verdict; focus-into-card with named restore and docking-never-steals-focus; stage-context
button names; functional prompts exempt from rotation with shared transcript tags). Nine
of ten mediums/low resolved (near-miss echo, instant reduced-motion docking, confirm mock
landed, SR-aware re-ask, diagram text twins, mute-keeps-captions, check-tick + label lock
signal, twin punctuation freedom, barge-in "Interrupted." note, 44pt + 8px targets,
per-confirm transcript turns). One low lingers: the orb's reserved long-press function
still has only a promised "documented accessible path," never the path itself.

## Findings

- **[critical]** Armed entry is silent to anyone not watching: the only specified arm
signal is guides "settle to steady" — a visual event — with no live-region announcement,
so a screen-unread user never hears the frame armed (EXPERIENCE.md State Patterns Armed
row; Component Patterns Capture frame row; Accessibility Floor "Every capture stage
announces state changes"). *Fix:* specify a distinct polite arm announcement ahead of the
fire ("Steady — hold still to capture."), separate from the lock confirm; the beat's
"Hold still…" half must function as that announcement with a specified minimum lead time
before the fire, not as narration of a fire already decided.
- **[critical]** The interrupt contract is undisclosed and the re-arm is silent: nothing
tells a blind user that stillness fires and movement re-arms, and "movement before the
fire returns to Capturing" names no announcement — so a fidget silently discards the arm
and the user waits on a hold that already died, potentially looping stages forever with
no diagnosis (EXPERIENCE.md Voice-Camera Choreography auto-primary rule; State Patterns
Armed row). *Fix:* state the contract once in the stage instruct turn ("Hold still and
I'll capture — moving restarts the hold."), and announce every re-arm politely
("Moved — holding again.") with a coaching diagnosis after repeats, mirroring the
telemetry escalation rule.
- **[high]** Auto-fire gives no confirm-before-fire and no voice veto: the beat's lead
time is unspecified (it may be heard ~simultaneously with the shutter), and while
"barge-in stays live throughout," nothing says a "wait!" utterance during Armed vetoes
the fire — speech moves no pixels, so the frame likely fires through the protest, against
the spine's own "a capture the user didn't confirm is a consent violation" rejection
(EXPERIENCE.md Voice-Camera Choreography; Inspiration "Rejected — silent auto-capture";
Interaction Primitives barge-in rule). *Fix:* pin a minimum perceivable beat lead time
(≥1.5s between "Hold still…" and the fire) and specify that barge-in/closed "wait" intent
during Armed vetoes this arm (fire cancelled, polite "Holding off — say when ready.").
- **[high]** The Lock fallback is specified visually and operable by nobody non-visual:
"stays visible" names no accessible name, no stage entry announcement, no focus path, no
keyboard shortcut, and no closed voice intent ("lock now") — the exact user who needs the
fallback (auto-fire never arms for them) cannot discover or fire it (DESIGN.md Capture
frame "A Lock control stays visible"; EXPERIENCE.md Voice-Camera Choreography "The Lock
control stays as manual fallback"). *Fix:* stage-context accessible name ("Lock document
front now"), announce availability at stage entry, map a closed voice intent + keyboard
path, and offer it proactively after N silent seconds ("Auto-capture hasn't fired — say
'lock now' or press…").
- **[high]** Settled-vs-live guides have no non-visual twin: "settle to steady" is the
arm cue and haptics are specified only for lock + decision, so the hold-still window —
the moment the user most needs a signal — arrives with no haptic pre-pulse and no audio
marker distinct from speech (EXPERIENCE.md Component Patterns Capture frame row;
Accessibility Floor haptic row "Haptic ticks on capture lock and decision"). *Fix:*
specify an arm haptic distinct from the lock tick (e.g. double pre-pulse = armed, single
firm tick = locked) plus the polite arm announcement; document the full haptic vocabulary
so patterns never collide.
- **[high]** The 10s silence re-ask can ambush the hold: the Listening timer is not
suspended during Armed/Capturing, so deliberate hold-still silence can trigger a re-ask
that startles movement, breaks the arm, and Hejduk-loops the user — stillness misread as
absence (EXPERIENCE.md State Patterns Listening row vs Armed row). *Fix:* suspend the
silence timer while Armed (stillness IS the answer); if a re-ask ever fires near capture,
queue it politely and never mid-arm.
- **[medium]** The fixed beat verbatim × 4 stages revives the robot the rotation policy
killed: "Hold still… captured" identical at doc-front, doc-back, challenge, and selfie
re-enacts "the identical sentence twice in a row reads as a machine stuck" — now four
times a run — and "captured" with no object leaves SR users unsure WHAT fired
(EXPERIENCE.md Variation policy exemption; Inspiration "Rejected — verbatim repeats").
*Fix:* fixed skeleton with a stage slot — "Hold still… front captured." — fixed wording
per stage, varied across stages; predictability kept, monotony and ambiguity gone.
- **[medium]** Detection-invisible creates a proximity cliff for blind users: with no
"almost there" gradient between coaching faults and the sudden arm, framing is pass/fail
with no approach feedback — a sighted user sees the guides converging, a blind user gets
nothing until the beat (EXPERIENCE.md Component Patterns Capture frame "Detection stays
invisible"; Inspiration "Rejected — detection narration"). *Fix:* define an allowed
proximity vocabulary that is coaching, not internals ("Nearly there — hold that."), fired
once on approach-to-arm; the ban stays on corner counts and "document found" callouts.
- **[medium]** The mock has zero live regions: the spoken line, the meta label, and the
confirm card are plain silent divs with no `aria-live` anywhere and no `alertdialog`
semantics — stepping through the demo with a screen reader announces nothing, and the
spine's "text twin IS the single live region" architecture is undemonstrated
(`.working/autofire-mock.html` `#line`, `#meta`, `#confirm`). *Fix:* make `#line` the
polite live region, `#meta` a polite status, confirm arrival assertive per the spine, and
announce step transitions; the mock should model the arbitration it claims.
- **[medium]** The mock never manages focus and its Lock is decorative: confirm appears
with no focus move and no restore target, Keep/Retake/steps leave focus wherever it was,
and `#lockBtn` has no handler at all — the manual fallback the spine depends on is a
dead button in the demo (`.working/autofire-mock.html` `show()`, `#lockBtn`,
`#confirm`). *Fix:* focus the confirm heading on arrival with restore on retire per the
spine's focus rule; wire Lock to force-advance to Locked (that's its whole job); move
focus to `#line` region on state steps.
- **[medium]** Mock button names contradict the spine and the armed meta text drifts:
"Lock" / "Keep" / "Retake" are bare (spine requires "Keep document front"-style
stage-context names) and the mock invents armed meta text "steady — hold still…" that the
spine never specifies — the Armed row names no meta string at all
(`.working/autofire-mock.html` lockrow/pair buttons, `show()`; EXPERIENCE.md State
Patterns Armed row). *Fix:* stage-context accessible names in the mock; pin the armed
meta string in the spine (or bless the mock's) so "Spines win on conflict" has something
to win with.
- **[low]** The beat's ellipsis prosody is unverified on the fixed string: "…" may render
as a clean pause or as "dot dot dot" depending on engine, and because the beat is
rotation-exempt fixed wording it cannot dodge a bad rendering by rephrasing
(EXPERIENCE.md Variation policy; Voice and Tone "Speech shaping"). *Fix:* verify the
literal beat string on target TTS + at least one SR, and confirm the text-twin-may-differ
punctuation escape hatch explicitly covers the beat.
- **[low]** Mock demo chrome under-serves AT: the state step buttons carry no
`aria-current`/pressed state for the active step and miss the 44px target rule the content
buttons meet (`.working/autofire-mock.html` `.steps button`). *Fix:* `aria-current="true"`
on the active step; 44px minimum even for demo chrome — the demo is also the a11y exhibit.
- **[low]** Lingering from round 1: the orb's reserved long-press function still has no
documented accessible path, only the promise of one — now one round older
(EXPERIENCE.md Component Patterns Voice orb row; DESIGN.md Components voice-orb).
*Fix:* name the path (settings toggle? double-tap alternative? voice command?) or drop
the reservation claim.
