# Spine Pair Review (round 3)

Spine pair: `DESIGN.md` + `EXPERIENCE.md` in `_bmad-output/planning-artifacts/ux-designs/ux-voice-idv-bmad-2026-11-02/` (Halo, status final, updated 2026-11-02).
Checked against: `design-example-mobile.md`, `design-example-shadcn.md`, `design-example-editorial.md`, `experience-example-mobile.md`, `experience-example-shadcn.md`, `design-md-spec.md`.
Prior report: `validation-report.md` (2026-11-03T09:34 run; rubric adequate + a11y not-shippable; 2 critical / 8 high / 20 medium / 4 low / 1 info).
Round-3 scope (weighed hardest): auto-capture (auto primary + manual fallback, Armed state, hold-still beat, settled guides), detection-invisibility, new anti-patterns, new `.working/autofire-mock.html`.
Question: can a downstream consumer (architecture, story-dev — human or AI) source-extract cleanly, with every reference resolving and every load-bearing decision committed?

## Overall verdict

**Adequate, borderline strong.** All 35 prior validation findings are resolved in the spines — both criticals (non-visual confirm review, TTS/SR arbitration), all 8 highs (contrast targets, typed-input rows, placement-mock tagging + links, alt/live-region/focus/naming/rotation rules), and every medium and low. The round-3 additions land cleanly: Armed state, hold-still beat, settled guides, detection-invisibility, and three new anti-patterns are coherently specified across both spines with no new token, shape, or inheritance debt. What keeps the pair from strong is 6 cheap minors: 3 in the visual-reference layer (the new autofire mock is orphaned; the confirm mock now contradicts the spine contract it illustrates; placement option B is untagged) and 3 round-3 behavior/placement gaps (Lock-tap semantics, Armed meta label, Lock placement drift in the autofire mock). Fix the 6 minors and the pair is strong.

## 1. Flow coverage — strong

Frontmatter sources resolve (`docs/specs/2026-10-31-au-voice-idv-spec.md`, `docs/plans/2026-10-31-voice-idv-meta.md`, `docs/seeds/` with adr1–3, GLOSSARY, PLAN — all verified on disk). Both named demo paths (1 clean + 1 tampered voice-complete run) have Key Flows with protagonist, numbered steps, bold `**Climax:**` beat, and `Failure:` line. Flow 1 step 4 (EXPERIENCE.md:114) exercises the round-3 auto-fire rhythm (hold-still beat → flash + tick → image → verdict → question) and the coach→lock→confirm rhythm is stated to repeat across all four stages.

### Findings

None.

## 2. Token completeness — adequate

All 12 color tokens carry hex; all 5 typography roles use spec-allowed keys only; rounded sm/md/lg/full and spacing 1–7 are complete; every `{path.to.token}` ref in DESIGN.md resolves to a defined leaf (the prior whole-object ref is now `{typography.spoken.fontSize}`, DESIGN.md:82; the `verdict` role tokenizes the prior bare 30px literal, DESIGN.md:138; the `warn` token is now invoked by stated amber-guide behavior, DESIGN.md:132). Contrast targets are committed (DESIGN.md:104: WCAG AA, 4.5:1 text / 3:1 large/UI, measurement pending under `[ASSUMPTION]`). The false "all token refs resolve" boilerplate is gone from EXPERIENCE.md:17. Round-3 adds no new color/state tokens — settled guides reuse `{colors.frame-guide}`, the beat is voice-only — so no new token debt.

### Findings

None.

## 3. Component coverage — adequate

Union across both spines: Voice orb, Spoken line, Capture frame, Coach card, Confirm card, Generated panel, Transcript turn, Typed input / Listen row, Consent gate (+abort sheet via cross-link), Decision banner (+Attack Surface folded in), Attack Surface panel (EXPERIENCE.md:66) — all with real multi-clause behavioral rules, and the Generated UI Contract now carries a per-primitive rules table (EXPERIENCE.md:135-141). Status dots are gone (`rounded/full` belongs to the orb only, DESIGN.md:126).

### Findings

- **[minor]** Lock-control tap semantics are unspecified (DESIGN.md:132; EXPERIENCE.md:167). Round-3 keeps the Lock control visible as manual fallback ("frame meta row, ≥44pt") and Choreography names it for "edge cases, stand-ins" — but no row states what a tap *does*: immediate lock bypassing the beat, entry into Armed, or a lock attempt with the same confirm-card landing. A consumer wiring the fallback trigger has placement without behavior. *Fix:* one sentence in the Capture frame rows, e.g. "Lock tap fires the lock path immediately (same confirm-card landing as auto-fire), whatever the Armed state."
- **[minor]** The autofire mock's Lock placement drifts from the spine: DESIGN.md:132 pins the control to the "frame meta row", but `.working/autofire-mock.html:57` renders it in a separate row below the frame ("Manual fallback stays put"). Non-normative and spines-win settles it, but the round-3 centerpiece mock should match the contract. *Fix:* move the mock's Lock button into the frame meta row, or soften the spine pin to "adjacent to the frame".

## 4. State coverage — adequate

All four IA surfaces walked. Assistant: cold open, listening, mic denied, processing. Capture: coaching, camera starting, capturing, Armed (new, EXPERIENCE.md:78), capture failed, camera denied. Decision: decided. Consent/abort: gate + abort rows. Global: offline/degraded. The Armed row covers the round-3 core (consecutive-clean run, steady guides, fixed beat, movement → back to Capturing, stillness → lock). Detection-invisibility needs no state (it is an absence, correctly specified in the frame rows + anti-pattern).

### Findings

- **[minor]** The Armed meta-label text is unspecified (EXPERIENCE.md:78; DESIGN.md:132). DESIGN.md:132 pins the label flip `capturing…` → `locked` with no Armed value in between, so `.working/autofire-mock.html:88` invents one (`steady — hold still…`). A consumer building the frame meta row has no authoritative Armed string. *Fix:* pin the Armed label in the Armed state row or the frame rows (adopt the mock's or name another).

## 5. Visual reference coverage — adequate

Files on disk: `.working/capture-placement-compare.html` (linked EXPERIENCE.md:24, :30; DESIGN.md:116; A now tagged REJECTED, C CHOSEN), `.working/confirm-card-mock.html` (linked EXPERIENCE.md:61; DESIGN.md:134), `.working/autofire-mock.html` (NEW in round 3 — Armed/beat walkthrough). `imports/` is empty; no `mockups/` or `wireframes/` dirs. Spines-win-on-conflict is stated exactly once (EXPERIENCE.md:30). Prior "no mocks" falsehood corrected. Up from broken; residuals below are cheap.

### Findings

- **[minor]** `.working/autofire-mock.html` is orphaned: zero references in either spine (verified by grep). The round-3 Armed-state walkthrough — the one artifact that shows guides settling, the beat, and the Lock fallback together — is unreachable from the contract. *Fix:* link it inline from the Armed state row (EXPERIENCE.md:78) and both Capture frame rows as non-normative illustration.
- **[minor]** `.working/confirm-card-mock.html` now contradicts the spine contract it illustrates: its img carries informative alt (`alt="Captured document front (device-local snapshot)"`, mock L46) while both spines pin `alt=""` decorative (DESIGN.md:134; EXPERIENCE.md:61), and its caption ("Front of your licence, captured.") carries no quality verdict while both spines require the caption to carry it. Spines-win settles authority, but a builder copying mock markup inherits the exact bug the prior critical banned. *Fix:* update the mock to `alt=""` with a verdict caption ("Front captured: sharp, all four corners in.").
- **[minor]** Placement-mock option B is untagged while the spines claim "A/B rejected" (EXPERIENCE.md:30; DESIGN.md:116): the mock tags A REJECTED and C CHOSEN (2 tag matches verified) but B carries no verdict tag, and its sim note still reads celebratory ("✓ Frame was already pinned at top"). *Fix:* tag B REJECTED in the mock header.

## 6. Bloat & overspecification — strong

Round-3 additions are lean: Armed is one state row + frame clauses, the beat is a fixed 3-word string, detection-invisibility is one clause plus one anti-pattern line, and the three new anti-patterns (manual-only, detection narration, countdown — EXPERIENCE.md:181-183) each earn their place by banning a concrete temptation. The auto-fire trigger stays deliberately unquantified ("a short run of consecutive clean samples", EXPERIENCE.md:78, :167) rather than inventing a sample count — correct restraint. All Capture Guidance minimums now carry `[ASSUMPTION]` where invented (EXPERIENCE.md:156-158). No overspecification found.

### Findings

None.

## 7. Inheritance discipline — strong

Both inheritance pointers now resolve with repo paths (`src/index.ts`, served at `/page`) plus "patterns fully restated below, no external lookup needed" (EXPERIENCE.md:17; DESIGN.md:101). Decision-core scoping holds ("deterministic decision core is unchanged and out of scope", EXPERIENCE.md:13). System font stacks keep their offline rationale (DESIGN.md:112). No UI-system restating; round-3 names the TTS engine ("browser synthesis", EXPERIENCE.md:36) without specifying its internals. No finding.

### Findings

None.

## 8. Shape fit — strong

DESIGN.md carries all 8 canonical sections in locked order (Brand & Style → Colors → Typography → Layout & Spacing → Elevation & Depth → Shapes → Components → Do's and Don'ts; DESIGN.md:91–141); frontmatter token types match the spec (flat hex colors, nested typography with allowed keys only, rounded/spacing dims, component `{path.to.token}` refs; `status`/`updated` follow the EXPERIENCE-example convention). EXPERIENCE.md has every required default (Foundation, IA, Voice and Tone, Component Patterns, State Patterns, Interaction Primitives, Accessibility Floor, Key Flows, Responsive & Platform, Inspiration & Anti-patterns); the three invented sections stay labeled "Product-specific" and round-3 content lands in the right homes (Armed in State Patterns, beat in Choreography, invisibility in frame rows, new bans in Anti-patterns).

### Findings

None.

## Mechanical notes

- Prior-findings audit: all 35 validation-report findings verified resolved in current spine text — 2/2 critical, 8/8 high, 20/20 medium, 4/4 low, 1/1 info (mock-exists invalidation stands; checklist items now spine-pinned). Two §5 findings above are *residual variants*, not reopenings: the confirm mock is now linked (prior fix) but its markup lags the new alt/caption contract; the placement mock is now tagged (prior fix) but B's tag is missing.
- Flow mechanics: Flow 1 (Sienna) EXPERIENCE.md:109-118, Flow 2 (Tom) :120-127 — protagonist, numbered steps, `**Climax:**`, `Failure:` each. Manual-fallback and movement-interrupt paths are covered as state/component behavior, not flows — acceptable, no named UJ requires more.
- Token extraction: 12/12 colors hex; 5 typography roles; rounded 4 levels; spacing 7 levels; 8 component token objects. All DESIGN.md `{path}` refs resolve; EXPERIENCE.md has none (correct — no dangling claim remains).
- Weak-but-present, no finding raised: `decision-verified/rejected/unverified` component tokens are defined but never invoked by path in prose (behavior stated as "verdict-hued", DESIGN.md:138 — matches the shadcn-example pattern where component tokens need not be prose-referenced); Attack Surface has an EXPERIENCE.md row with DESIGN.md coverage folded into the Decision banner row (an explicitly permitted prior fix); Armed has no timeout row (coaching escalation covers repeated failure); stand-in capture path inherits the Lock-tap gap filed in §3 — not double-counted.
- Severity scale: critical = blocks source-extraction or silently misdirects core behavior; major = load-bearing gap/contradiction a consumer will likely trip on; minor = real gap with adjacent coverage, or cheap fix. No criticals or majors remain.
- Finding counts: 0 critical / 0 major / 6 minor (§3: 2, §4: 1, §5: 3).
