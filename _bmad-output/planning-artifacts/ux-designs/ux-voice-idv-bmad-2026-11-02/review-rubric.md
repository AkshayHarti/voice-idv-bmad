# Spine Pair Review

Spine pair: `DESIGN.md` + `EXPERIENCE.md` in `_bmad-output/planning-artifacts/ux-designs/ux-voice-idv-bmad-2026-11-02/` (Halo, status final, updated 2026-11-02).
Checked against: `design-example-mobile.md`, `design-example-shadcn.md`, `design-example-editorial.md`, `experience-example-mobile.md`, `experience-example-shadcn.md`, `design-md-spec.md`.
Question: can a downstream consumer (architecture, story-dev — human or AI) source-extract cleanly, with every reference resolving and every load-bearing decision committed?

## Overall verdict

**Adequate.** The pair is a strong contract on flows, tokens, shape, and the nine core components — but the visual-reference layer is broken (an orphan mock recommends the placement the spine bans), and two load-bearing decisions are uncommitted (typed-input spec, contrast targets). Fix the 3 majors and the pair is strong.

## 1. Flow coverage — strong

Frontmatter sources resolve (`docs/specs/2026-10-31-au-voice-idv-spec.md`, `docs/plans/2026-10-31-voice-idv-meta.md`, `docs/seeds/` — all exist). No UJ/requirement names are declared in frontmatter; the source spec's named demo paths are "1 clean + 1 tampered voice-complete run" (spec L35, L210) and both have Key Flows. Each flow has a named protagonist, numbered steps, a bold climax beat, and a failure path.

### Findings

None.

## 2. Token completeness — adequate

All 12 color tokens carry hex. All 17 frontmatter `{path.to.token}` refs and all 5 prose refs resolve against defined tokens. No critical misses.

### Findings

- **[major]** No contrast target is stated for any UI combination, and the deferral pointer dangles: EXPERIENCE.md:92 sends visual contrast to DESIGN.md, whose Colors section (DESIGN.md:90-99) gives only "lowest legible contrast" prose for hairlines. Load-bearing combos with 12px tracked-cap meta, 13px mono evidence, and verdict hues on dark have no committed ratio, and there is no inherited system (cf. shadcn example) to fall back on. *Fix:* add one line per load-bearing pair (ink-primary/secondary on base/raised, meta, evidence, verdict hues) with a target ratio, or a blanket WCAG AA statement with measured values.
- **[minor]** EXPERIENCE.md:17 claims "all `{path.to.token}` references below resolve against it", but the file contains zero real token refs — the only match is the literal `{path.to.token}` placeholder in that sentence. Boilerplate leftover that misdescribes the file. *Fix:* delete the clause or convert the backticked role mentions (`meta`, `evidence`, `display`-style) to real `{typography.*}` refs.
- **[minor]** Loose token hygiene in DESIGN.md: L124 references the whole `{typography.spoken}` object instead of a leaf token (spec pattern is leaf paths like `{typography.spoken.fontSize}`); the `capture-frame.warn` token (L64) is never invoked in prose — no amber-guide behavior is stated anywhere; the Decision banner verdict size is a bare `30px` literal (L130) with no token. *Fix:* point L124 at leaf paths; either spec the warn-guide state or drop the token; tokenize the verdict size or cite `spoken`.

## 3. Component coverage — adequate

Union of component names across both spines: Voice orb, Spoken line, Capture frame, Coach card, Confirm card, Generated panel, Transcript turn, Decision banner, Consent gate — all 9 have a row in DESIGN.md Components (L123-131) and in EXPERIENCE.md Component Patterns (L56-64) with real multi-clause rules. The misses below are secondary elements, except the input row.

### Findings

- **[major]** The persistent typed input / Listen row — the dock anchor ("dock zone above the input/Listen row", EXPERIENCE.md:58; "docked card above the input", :61; "docked above the input", :171) and the guaranteed fallback ("typing never does [fail]", :86; "typed input focusable", :98) — has no row in either spine. Only DESIGN.md:119 assigns it `rounded/sm` in passing. A consumer building the dock zone has no visual or behavioral contract for the thing it docks above. *Fix:* add a "Typed input / Listen row" row to both tables (placement, chrome, focus, placeholder/voice-unavailable treatment).
- **[minor]** Generated-panel primitives (confirm row, choice list, progress steps, evidence peek, retake pair — EXPERIENCE.md:60, :127) are named but have no per-primitive visual or behavioral spec beyond "every choice has a text equivalent". *Fix:* one rule line per primitive in the Generated panel rows, or a small primitives table in the Generated UI Contract.
- **[minor]** Attack Surface / audit panel and its Run control are named in four places (EXPERIENCE.md:64, :75, :118 "Run adversarial audit", :130) with no component row; DESIGN.md:130 mentions the panel only as a Decision-banner part. Trigger control, placement, and loading/timeout UI are unspecified. *Fix:* add an Attack Surface panel row to both tables (or fold explicit rules into the Decision banner rows).
- **[minor]** The abort-confirm sheet has its surface token (DESIGN.md:115, `surface-overlay`) and behavior (EXPERIENCE.md:78) scattered outside the component tables, so a consumer extracting component rows misses it. *Fix:* add an abort-sheet row to both tables, or cross-link the existing lines from the Consent gate rows.
- **[minor]** "Status dots" own `rounded/full` alongside the orb (DESIGN.md:119) but are named nowhere else and have no spec. *Fix:* spec them in one sentence or delete the mention.

## 4. State coverage — adequate

Surfaces walked: Assistant, Capture, Decision, Consent. Covered: cold open, listening, coaching, capturing, processing, decided, offline/degraded, camera-denied, abort, consent deny/revoke, audit timeout. Each miss below has adjacent coverage that softens it.

### Findings

- **[minor]** Mic permission denied has no state. Voice-may-fail is acknowledged (typed fallback in EXPERIENCE.md:70, :86; silence re-ask in :71), but the denial moment — announcement, orb state, path to typed-only mode — is unspecified in a voice-first product. *Fix:* add a "Mic denied" row to State Patterns.
- **[minor]** Camera initializing / cold-load has no state. "Frame guides live" (EXPERIENCE.md:73) assumes a warm camera; permission-pending, warm-up, and black-preview UI are unspecified. *Fix:* add a "Camera starting" row (skeleton/black-preview + spoken "opening the camera" or equivalent).
- **[minor]** Capture failure has no state. Lock success is fully choreographed (flash + haptic + spoken confirm, EXPERIENCE.md:73) but a failed frame grab has no treatment. *Fix:* add a "Capture failed" row (silent retry vs coach-card notice + spoken line).

## 5. Visual reference coverage — broken

Files on disk: `.working/capture-placement-compare.html` (3 capture-frame placement options with an interactive sim), `.working/confirm-card-mock.html` (docked confirm-card review mock). `imports/` exists but is empty; no `mockups/` or `wireframes/` dirs. Neither spine links to either file; no spines-win-on-conflict rule is stated anywhere.

### Findings

- **[major]** `.working/capture-placement-compare.html:48` tags option A ("Scroll into view — frame lives at top") RECOMMENDED, while the spine commits placement C (dock at chat: EXPERIENCE.md:24, DESIGN.md:109, :125) and DESIGN.md:141 explicitly bans A's behavior ("Frame stranded at page top while the user chats at the bottom"). An unlinked orphan recommends the banned behavior with no conflict rule to settle it. *Fix:* link the file from the IA Capture row and Layout section naming C as the decision and A/B as rejected, update its RECOMMENDED tag, or delete it.
- **[minor]** `.working/confirm-card-mock.html` (docked confirm card: image + caption + Keep/Retake) illustrates the Confirm card faithfully but is orphaned — authority unclear. *Fix:* link it inline from both Confirm card rows naming what it illustrates, or delete it.
- **[minor]** EXPERIENCE.md:30 claims "spine-only in v1 (no mocks rendered; fast path)", which is false while `.working/` holds two rendered mocks. *Fix:* correct the line to name the `.working/` files as non-normative exploration, or remove the files.
- **[minor]** No spines-win-on-conflict statement exists. EXPERIENCE.md:30 ("Surfaces build from these tables alone") is a build note, not a conflict rule; DESIGN.md is silent. *Fix:* state once, next to the IA composition line, that spines win on conflict with any mock.

## 6. Bloat & overspecification — adequate

Density is information here: the Capture Guidance, Choreography, and Generated UI sections specify the product's novel core, and genuine guesses are flagged `[ASSUMPTION]` (no light theme, diagram slot, no account surface, landscape side-dock, Laplacian, MRZ contrast). One discipline slip.

### Findings

- **[minor]** Inconsistent assumption-flagging in the Capture Guidance criteria table (EXPERIENCE.md:140-144): Laplacian ≥ 120 and MRZ contrast ≥ 3:1 carry `[ASSUMPTION]`, but the equally invented minimums (1600px / 720p / 1080px, 25% oval, ±15% centering, 3+ frames, 60–90% fill) do not — none were found in the source spec (only ~5Hz telemetry is spec-sourced, spec L154). Unflagged numbers read as committed requirements. *Fix:* flag the invented minimums `[ASSUMPTION]` or cite their source.

## 7. Inheritance discipline — adequate

Clean scoping ("deterministic decision core is unchanged and out of scope", EXPERIENCE.md:13), no UI-system restating, system font stacks with an offline rationale (DESIGN.md:105). One unresolvable pointer.

### Findings

- **[minor]** The inheritance pointers "the current demo page's proven patterns" (EXPERIENCE.md:17) and "the demo's existing verdict semantics" (DESIGN.md:96) give no repo path, so a consumer cannot resolve what is inherited. Softened because the three patterns and the verdict hues are restated inline. *Fix:* add the demo page path (or "patterns fully restated below; no external lookup needed").

## 8. Shape fit — strong

DESIGN.md carries all 8 canonical sections in locked order (Brand & Style → Colors → Typography → Layout & Spacing → Elevation & Depth → Shapes → Components → Do's and Don'ts); frontmatter token types match the spec (flat hex colors, nested typography with allowed keys only, rounded/spacing dims, component `{path.to.token}` refs; `status`/`updated` follow the EXPERIENCE-example convention). EXPERIENCE.md has every required default (Foundation, IA, Voice and Tone, Component Patterns, State Patterns, Interaction Primitives, Accessibility Floor, Key Flows, Responsive & Platform, Inspiration & Anti-patterns); the three invented sections are labeled "Product-specific" and earn their place.

### Findings

None.

## Mechanical notes

- Flow mechanics: Flow 1 (Sienna) EXPERIENCE.md:103-112 and Flow 2 (Tom) :114-121 each have protagonist, numbered steps, `**Climax:**` beat, `Failure:` line. Consent-deny, abort, and retake-loop are covered as states/panels rather than flows — acceptable, no named UJ requires more.
- Token extraction: 12/12 colors with hex; typography roles spoken/body/meta/evidence; rounded sm/md/lg/full; spacing 1-7; 8 component token objects. Every `{path}` ref in DESIGN.md resolves; EXPERIENCE.md has none (see §2 boilerplate finding).
- Key Flows sit mid-file (before Generated UI Contract) rather than last as in both EXPERIENCE examples; no order lock applies to EXPERIENCE.md, so not a finding.
- Weak-but-present coverage, no finding raised: typed-input focus ("typed input focusable", EXPERIENCE.md:98); OCR/processing failure narration (generic `progress` narration, :74); evidence-list/limitations/tier-message subsumed under Decision banner rows.
- `imports/` is empty and `mockups/`/`wireframes/` do not exist — no action; the §5 findings concern only the two `.working/` files versus the "no mocks" claim.
- Severity scale used: critical = blocks source-extraction or silently misdirects implementation of core behavior; major = load-bearing gap or contradiction a consumer will likely trip on; minor = real gap with adjacent coverage, or cheap fix.
