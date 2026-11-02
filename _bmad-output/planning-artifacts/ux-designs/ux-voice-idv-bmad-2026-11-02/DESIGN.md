---
name: Halo
description: Futuristic voice-assistant identity for guided ID verification. Dark-first console; the spoken line is the hero, the camera frame is the stage.
status: final
updated: 2026-11-02
colors:
  surface-base: '#0B0E13'
  surface-raised: '#12161D'
  surface-overlay: '#1A2130'
  ink-primary: '#EDEFF4'
  ink-secondary: '#9AA3B2'
  ink-faint: '#5B6472'
  accent-voice: '#7DD3FC'
  frame-guide: '#38BDF8'
  signal-ok: '#4ADE80'
  signal-warn: '#FBBF24'
  signal-fail: '#F87171'
  border-hairline: '#222B3A'
typography:
  spoken:
    fontFamily: 'ui-sans-serif, system-ui, sans-serif'
    fontSize: 28px
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: -0.01em
  body:
    fontFamily: 'ui-sans-serif, system-ui, sans-serif'
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.55'
  meta:
    fontFamily: 'ui-sans-serif, system-ui, sans-serif'
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: 0.08em
  evidence:
    fontFamily: 'ui-monospace, monospace'
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.5'
rounded:
  sm: 6px
  md: 10px
  lg: 16px
  full: 9999px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 24px
  '6': 32px
  '7': 48px
components:
  voice-orb:
    idle: '{colors.ink-faint}'
    listening: '{colors.accent-voice}'
    speaking: '{colors.accent-voice}'
    radius: '{rounded.full}'
  capture-frame:
    guide: '{colors.frame-guide}'
    locked: '{colors.signal-ok}'
    warn: '{colors.signal-warn}'
    radius: '{rounded.lg}'
  coach-card:
    background: '{colors.surface-raised}'
    border: '{colors.border-hairline}'
    radius: '{rounded.md}'
  spoken-line:
    text: '{colors.ink-primary}'
    size: '{typography.spoken.fontSize}'
  decision-verified:
    text: '{colors.signal-ok}'
  decision-rejected:
    text: '{colors.signal-fail}'
  decision-unverified:
    text: '{colors.signal-warn}'
---

## Brand & Style

Halo is the visual identity of a voice assistant that verifies identity — not a form that talks, but a guide that sees. The aesthetic posture is **night-ops console**: deep dark surfaces, one cool voice-light, and a luminous capture frame that behaves like a halo locking onto its target. The current spoken line is always the largest thing on screen; everything else (transcript, evidence, chrome) recedes. Futuristic here means *calm precision*, not neon clutter: no gradients-as-decoration, no particle fields, no mascot. The camera frame and the voice orb are the only two luminous objects; when both are quiet, the screen is nearly still.

## Colors

- **Base (`#0B0E13`)** is the canvas. Near-black with a blue undertone; camera previews sit in it without a visible seam.
- **Raised (`#12161D`) / Overlay (`#1A2130`)** lift panels and sheets by tone only. No shadows for hierarchy on the base surface.
- **Voice sky (`#7DD3FC`)** means *the assistant is alive*: orb pulse while listening/speaking, the active transcript line's edge. Never used for state (pass/fail) or decoration.
- **Frame blue (`#38BDF8`)** draws capture guides: document quad corners, face oval, alignment rails. Turns `{colors.signal-ok}` only when a capture locks.
- **Signal green / amber / red** carry the demo's existing verdict semantics: ok `#4ADE80`, warn `#FBBF24`, fail `#F87171`. Reserved strictly for check results, decisions, and capture diagnostics — never for brand or voice.
- **Hairline (`#222B3A`)** separates evidence rows and transcript turns at the lowest legible contrast.

Avoid: light mode (Halo is dark-first; [ASSUMPTION] no light theme for v1), chromatic voice colors (voice is always sky), red/green anywhere except verdicts and capture lock.

## Typography

Three roles plus evidence. The `spoken` role (28px semibold) sets the current utterance as the hero line on the Assistant and Capture surfaces — one line, never a paragraph. `body` (16px) carries transcript history and coach cards. `meta` (12px tracked caps) labels stages, speakers, and panel titles. `evidence` (13px mono) sets check ids, measurements, and redacted refs on the Decision surface only.

System font stacks throughout (no webfont dependency — the demo must run offline). Dynamic type honored: the spoken line wraps to two lines at the largest setting rather than truncating.

## Layout & Spacing

4-based scale (4–48px). One-column reading surface, max width 56rem, 24px page margins on mobile. The Assistant surface stacks: orb + spoken line (top, sticky), generated panel (middle), transcript (scrolling history below). The Capture surface is full-bleed camera with the frame overlay and a bottom coach card; the spoken line docks above the coach card so guidance and viewfinder share one glance. On the single-page realization the capture frame **docks at the chat**: at capture start the frame node moves to the dock zone above the Listen/input row and the view follows it — the viewfinder meets the user where they are, never stranded at the page top while they chat at the bottom. It returns home when the stage closes.

Panels the assistant generates slot into the middle region only — they never move the orb, the spoken line, or the capture frame. Generated content inherits page margins; camera overlays are the sole full-bleed exception.

## Elevation & Depth

Tonal layering, not shadows: base → raised → overlay. The coach card and generated panels sit on `{colors.surface-raised}` with a hairline border; modal sheets (consent, abort confirm) use `{colors.surface-overlay}`. The capture frame and orb glow via low-opacity outer bloom in their own hue — the only permitted glow, and it signals *live instrument*, not decoration. Honor reduced-motion by rendering the glow static.

## Shapes

`rounded/md` (10px) for cards, panels, and coach cards. `rounded/lg` (16px) for the camera frame container and sheets. `rounded/sm` (6px) for chips, inputs, and small controls. `rounded/full` belongs to the voice orb and status dots only — no pill buttons. Capture guide corners are square-cut brackets (viewfinder language), not rounded — precision reads sharper.

## Components

- **Voice orb** — the assistant's face. Idle: faint ring. Listening/speaking: sky pulse synced to audio energy (static glow under reduced motion). Tap toggles mute; long-press reserved for system use.
- **Spoken line** — current utterance in `{typography.spoken}`. Updates per Turn; the previous line collapses into the transcript. Never shows two live lines at once.
- **Capture frame** — full-bleed camera with guide overlay: corner brackets for documents, oval for faces, rails for alignment. Guides render `{colors.frame-guide}`; on lock they flash `{colors.signal-ok}` once and hold. Haptic tick on lock where available. Docked at the chat on capture start (see Layout & Spacing); docking animates opacity/position only — guides never re-lay-out mid-capture.
- **Coach card** — one coaching instruction at a time (`surface-raised`, hairline border): short imperative + optional diagram slot. Replaces, never stacks — a new instruction retires the old.
- **Generated panel** — assistant-assembled UI for the current Turn (field confirmations, retake options, progress). Middle region only; composed from primitives in `EXPERIENCE.md` Component Patterns. Must always include a text equivalent of any choice it presents.
- **Transcript turn** — history rows: speaker label in `meta`, text in `body`. System turns carry a left edge tick; sky tick marks the most recent.
- **Decision banner** — verdict in 30px semibold, verdict-hued. Followed by tier message, failures-first evidence list in `evidence` type, limitations block, and the Attack Surface panel.
- **Consent gate** — full-surface sheet before any capture: purpose statement, what is captured, spoken-consent prompt. No pre-checked anything; deny path as prominent as consent.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Spoken line largest on screen, one live line at a time | Two live utterances, or transcript styled louder than speech |
| Voice sky for aliveness only; verdict hues for verdicts only | Sky pass/fail badges, green/red voice states |
| One coach card, replaced per instruction | Stacked coaching tips or persistent hint bars |
| Generated panels in the middle region from approved primitives | Assistant-invented surfaces, nav, or chrome |
| Frame docks at the chat on capture start | Frame stranded at page top while the user chats at the bottom |
| Static glow + haptics under reduced motion | Pulsing orb, flashing frame, animated gradients |
| Mono evidence type on Decision only | Mono body copy elsewhere |
| Dark-first console, tonal layering | Light theme, drop-shadow hierarchy, decorative gradients |
