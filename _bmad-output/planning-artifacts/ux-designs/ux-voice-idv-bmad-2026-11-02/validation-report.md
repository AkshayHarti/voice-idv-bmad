# Validation Report — Halo (voice-idv-bmad)

- **DESIGN.md:** `_bmad-output/planning-artifacts/ux-designs/ux-voice-idv-bmad-2026-11-02/DESIGN.md`
- **EXPERIENCE.md:** `_bmad-output/planning-artifacts/ux-designs/ux-voice-idv-bmad-2026-11-02/EXPERIENCE.md`
- **Run at:** 2026-11-03T09:34

## Overall verdict

**Rubric: adequate.** The pair is a strong contract on flows, tokens, shape, and the nine core components — but the visual-reference layer is broken (an orphan mock recommends the placement the spine bans), and two load-bearing decisions are uncommitted (typed-input spec, contrast targets). Fix the 3 majors and the pair is strong.

**Accessibility shifts the picture: not shippable as specified.** The confirm card is an eyesight gate smuggled into a product whose founding promise is screen-unread completion. A blind user asked to Keep/Retake an image gets no spoken quality description, no non-visual review path, and no defined alt semantics. The spines never arbitrate browser TTS against screen-reader announcements, never say where focus goes when DOM nodes dock and retire mid-run, and let variation rotation erode the predictability assistive-technology users depend on. Fix the two criticals before anything else.

**Synthesis notes.** Rubric severities mapped major→high, minor→medium. One accessibility medium (missing confirm-card mock) was invalidated during synthesis — `.working/confirm-card-mock.html` exists; its verification checklist still applies.

## Category verdicts

- Flow coverage — strong
- Token completeness — adequate
- Component coverage — adequate
- State coverage — adequate
- Visual reference coverage — broken
- Bloat & overspecification — adequate
- Inheritance discipline — adequate
- Shape fit — strong
- Accessibility review — not shippable as specified

## Findings by severity

### Critical (2)

**[Accessibility]** — Confirm card is unreviewable non-visually (Confirm card row; Choreography; Accessibility Floor)
A screen-unread user is asked to Keep/Retake an image they cannot inspect, with no spoken quality description — contradicting the founding requirement.
Fix: mandatory spoken + text quality verdict before the keep/retake question, derived from coaching telemetry. A keep/retake with no non-visual quality statement is a bug, same weight as the blind-keep bug.

**[Accessibility]** — No TTS / screen-reader arbitration (Voice and Tone; Accessibility Floor SR row)
Browser synthesis speaks the line while aria-live regions announce the same or competing updates — doubled or overlapping speech with no stated strategy.
Fix: the spoken-line text twin IS the live region (single source); "SR detected → suppress self-voicing TTS" rule or explicit toggle. Test with VoiceOver + TalkBack with TTS on.

### High (8)

**[Token completeness]** — No contrast target stated for any UI combination (EXPERIENCE.md:92 → DESIGN.md:90-99)
Deferral pointer dangles; load-bearing combos have no committed ratio and no inherited system to fall back on.
Fix: one line per load-bearing pair with a target ratio, or a blanket WCAG AA statement with measured values.

**[Component coverage]** — Typed input / Listen row has no component row in either spine (EXPERIENCE.md:58, :61, :86, :98)
The dock anchor and guaranteed fallback have no visual or behavioral contract.
Fix: add a "Typed input / Listen row" row to both tables.

**[Visual reference]** — Orphan placement mock recommends the banned behavior (.working/capture-placement-compare.html:48)
Tags option A RECOMMENDED while the spine commits C and bans A's behavior; no conflict rule settles it.
Fix: link the file naming C as the decision and A/B as rejected, update its RECOMMENDED tag, or delete it.

**[Accessibility]** — Captured-image alt semantics unspecified (Confirm card rows, both spines)
Neither decorative nor informative pinned; invites double-announcement or a silent image.
Fix: image alt="" + real caption holding the quality verdict; never a filename/framestamp as alt.

**[Accessibility]** — Live-region politeness for the confirm card unspecified (Accessibility Floor; Spoken line row)
A blocking question with a retire-on-answer lifecycle gets no level; arrival races the spoken-line update.
Fix: assertive (or role="alertdialog") for arrival; document ordering so the question never precedes the quality verdict.

**[Accessibility]** — Focus management across docking / appear / retire unspecified (frame/coach/confirm rows; Floor focus order)
Node moves can drop focus to body; "focus order follows reading order" is contradicted by reordered DOM.
Fix: focus to card heading on appearance, named restore target on retire, docking never moves focus, move focus before removing a focused node. Test keyboard-only, SR off.

**[Accessibility]** — Keep/Retake accessible names lack stage context (Confirm card row; Interaction Primitives)
Bare "Keep" / "Retake" across all four stages — unlabeled out of context.
Fix: "Keep document front" / "Retake document front" via aria-label or visually-hidden context.

**[Accessibility]** — Variation rotation breaks the predictability AT users rely on (Variation policy; Inspiration)
N phrasings for one meaning: unsearchable transcript, no stable phrase for voice-control/switch users.
Fix: exempt functional prompts (consent, keep/retake, abort) from rotation; cap rotation to coaching color; shared transcript tag per meaning.

### Medium (20)

**[Token completeness]** — "All token references resolve" claims a file with zero token refs (EXPERIENCE.md:17). Fix: delete the clause or convert mentions to real refs.
**[Token completeness]** — Loose token hygiene: whole-object ref, unused warn token, bare 30px literal (DESIGN.md:124, :64, :130). Fix: leaf paths; spec or drop warn; tokenize verdict size.
**[Component coverage]** — Generated-panel primitives lack per-primitive rules (EXPERIENCE.md:60, :127). Fix: one rule line per primitive.
**[Component coverage]** — Attack Surface / audit panel has no component row (EXPERIENCE.md:64, :75, :118, :130). Fix: add a row to both tables.
**[Component coverage]** — Abort-confirm sheet spec scattered outside component tables (DESIGN.md:115; EXPERIENCE.md:78). Fix: add rows or cross-link.
**[Component coverage]** — "Status dots" own rounded/full but exist nowhere else (DESIGN.md:119). Fix: spec or delete.
**[State coverage]** — Mic permission denied has no state (State Patterns). Fix: add a "Mic denied" row.
**[State coverage]** — Camera initializing / cold-load has no state (EXPERIENCE.md:73). Fix: add a "Camera starting" row.
**[State coverage]** — Capture failure has no state (EXPERIENCE.md:73). Fix: add a "Capture failed" row.
**[Visual reference]** — Confirm-card mock orphaned (.working/confirm-card-mock.html). Fix: link from both Confirm card rows or delete.
**[Visual reference]** — "No mocks rendered" claim is false (EXPERIENCE.md:30). Fix: correct the line or remove the files.
**[Visual reference]** — No spines-win-on-conflict statement (EXPERIENCE.md:30). Fix: state once next to the IA composition line.
**[Bloat]** — Invented capture minimums inconsistently flagged (EXPERIENCE.md:140-144). Fix: flag [ASSUMPTION] or cite source.
**[Inheritance]** — Inherited-pattern pointers give no repo path (EXPERIENCE.md:17; DESIGN.md:96). Fix: add path or "fully restated below".
**[Accessibility]** — Near-miss resolution has no confirmation echo (Interaction Primitives). Fix: echo "Keeping the front."; record heard → resolved; low-confidence re-asks.
**[Accessibility]** — Reduced-motion docking unspecified (Capture frame rows; Floor). Fix: instant docking under prefers-reduced-motion; announcement still fires.
**[Accessibility]** — 10s silence re-ask can fire mid-SR-announcement (Listening row). Fix: extend/suppress timer around SR latency; polite-queued re-ask.
**[Accessibility]** — Coach-card diagram slot has no text-equivalent rule (Coach card rows). Fix: text twin as specific as the visual, or decorative-only by contract.
**[Accessibility]** — Tap-to-mute can kill the founding channel (orb + captions rows). Fix: mute changes audio only; announce "Muted. Captions continue."
**[Accessibility]** — Lock signal may be color-only (Capture frame rows). Fix: pair with shape/label change; spoken + haptic unconditional.

### Low (4)

**[Accessibility]** — Pause-shaping commas leak into SR/braille twins (Speech shaping). Fix: verify with SR + braille pass; allow twin punctuation to differ.
**[Accessibility]** — Barge-in marking has no announcement rule (Interaction Primitives; Transcript row). Fix: polite "Interrupted." + labeled transcript marker.
**[Accessibility]** — Tap-target spacing and orb size underspecified (Floor; Voice orb). Fix: 8px gaps, orb ≥44pt, accessible long-press path.
**[Accessibility]** — Confirm-card image has no transcript standing (Transcript row; retire rule). Fix: one transcript turn per confirm step.

### Info (1)

**[Accessibility]** — Confirm-card mock verification checklist (finding invalidated — mock exists). Verify: image alt, assertive arrival, focus in/restore, contextual button names, ≥44pt targets with ≥8px gaps, keyboard operability.

## Reviewer files

- `review-rubric.md`
- `review-accessibility.md`
