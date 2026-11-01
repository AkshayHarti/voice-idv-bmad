# Voice-IDV Meta Phase Implementation Plan (Muse execution)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the demo slice to real Meta models (SAM 3, Muse Spark, Glimmer) behind the existing `--meta` seams, keeping `--no-meta` parity, and produce the Cerebral Valley submission.

**Architecture:** Same Hono + TS repo (`repos/voice-idv-bmad`). Task 0 probes and pins exact model IDs/pricing into one constants module; Tasks 1–3 consume those constants to fill the stubbed Meta branches in `src/providers.ts`; Task 4 hardens the demo and writes the submission. Model calls narrate and segment only — the check engine still decides.

**Tech Stack:** Node + TypeScript + Hono; Meta Model API (`https://api.meta.ai/v1`); `npm test` = `npm run build && node --test` (no network in tests — all Meta calls tested via injected stub fetchers).

**Spec:** `docs/superpowers/specs/2026-10-31-au-voice-idv-spec.md` §§4–5, 7, plus the Official Rules constraints below (executors read both).

## Model review (rules-grounded, approved direction)

The rules name **Muse Spark, Glimmer, SAM 3** (+ anything on the Event page) — not "SAM 3.1" or "Muse Image". Corrections to the earlier assumption:

| Model | Role in this slice | Why it wins judging weight |
|---|---|---|
| **SAM 3** | Live segmentation: passport MRZ/photo/hologram zones, NSW DL back card-number region, face quads in challenge frames | Segmentation-driven fraud evidence (region crops behind every check) is beyond-basic integration |
| **Muse Spark** | Live narration (Turn polishing) + fraud-pattern reasoning + adversarial self-audit (3 attack hypotheses per report) | Adversarial audit is the "unexpected capability" for the 25% tooling criterion |
| **Glimmer** | Fixture art: visual bases for edge-case fixtures (glare, blur, tilt variants); MRZ always composed programmatically so ground truth stays exact | Real-image edge cases make the demo hold up live (25% demo criterion) |

Judging map: Impact 30% (blind/low-vision access story, unchanged) · Tooling 25% (SAM-tracked challenge + adversarial audit + Glimmer edge cases) · Depth 20% (21-test deterministic core, unchanged) · Demo 25% (2:15 video, live `--meta` run). Credits: $150 Meta Model API, 10-day window — every call logged, running total in `docs/spend.md`, hard stop before exhaustion. Submit via the Cerebral Valley portal, indie track.

## Global Constraints

- Exact model IDs and per-call prices are pinned by Task 0 into `src/meta-models.ts` as `META_MODELS = {spark, sam, glimmer}` + `PRICING`; Tasks 1–3 consume those constants, never hardcoded strings.
- `$150` credit ceiling; every Meta call appends to `docs/spend.md` (model, calls, est. cost, running total); implementer stops and reports if projected total exceeds `$120` (80% tripwire).
- `--no-meta` Decisions identical to `--meta` on all fixtures (parity test per task); no keys → full offline demo.
- Template-first audio ≤1.5s; Meta calls time out at ≤1000ms and degrade to local (never throw past the chain; `narrate`/`segment` keep their never-throw contract).
- Narration never decides; adversarial hypotheses are report annotations only, never check inputs.
- Non-claims vocabulary (`challenge_compliance`, `portrait_splice_artifact`, `face_match` uncertified); no `liveness`/`tamper detection`/`biometric verification` outside Avoid/negation.
- Demo fixtures 100% synthetic; redacted refs only in logs; consent gate + deny purge unchanged.

## Review Focus

- SAM returns no regions on a real capture → expect fallback to fixture geometry with `skipped` recorded and Decisions unchanged.
- Spark times out mid-demo → expect template narration inside 1.5s and the run continuing to a Decision.
- Glimmer art renders an unreadable MRZ → expect MRZ recomposed programmatically (art is backdrop only) and fixture ground truth still exact.
- Credit tripwire ($120) hit mid-task → expect implementer to stop, report spend, and leave `--no-meta` green.
- Adversarial hypotheses must never alter a Decision → expect a test asserting identical Decisions with audit on vs off.

---

### Task 0: Probe + pin models + spend budget

**Files:**
- Create: `repos/voice-idv-bmad/src/meta-models.ts`
- Create: `repos/voice-idv-bmad/docs/spend.md`
- Test: `repos/voice-idv-bmad/test/meta-models.test.js`

**Interfaces:**
- Consumes: `META_API_KEY` (env only, never committed)
- Produces: `META_MODELS: {spark: string, sam: string, glimmer: string}`, `PRICING: Record<string, {perCall: number, unit: string}>`, `logSpend(model, calls, estCost): void` shape used by Tasks 1–3

- [ ] **Step 1: Write the failing test**

```js
test("pinned model IDs and request shapes", () => {
  assert.match(META_MODELS.spark, /muse-spark/i);
  assert.match(META_MODELS.sam, /^sam-?3/i);
  assert.match(META_MODELS.glimmer, /glimmer/i);
  assert.equal(typeof PRICING[META_MODELS.spark].perCall, "number");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd repos/voice-idv-bmad && npm test`
Expected: FAIL with "META_MODELS not defined".

- [ ] **Step 3: Probe live API (manual, once) and pin constants in `src/meta-models.ts`**

Send one minimal call per model with `META_API_KEY` (text prompt for spark, segmentation probe for sam, tiny image prompt for glimmer); record exact accepted model IDs, per-call cost, and latency into `docs/spend.md`. If any ID differs from the `muse-spark-1.3` / SAM-3 / Glimmer candidates, use the accepted one. Do not commit the key.
- Observed 2026-11-01: unauthenticated Meta endpoint answers ~3.1s, so the 1000ms `postJson` default aborts first. Prescription (binding): inline narration keeps ≤1000ms with template-first fallback (holds the 1.5s floor); non-blocking calls (audit, SAM segmentation behind `progress` Turns) use ≤8000ms via `postJson`'s `timeoutMs` param. Live `provider: "meta"` is proven on post-first-turn calls, not by slowing session creation.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd repos/voice-idv-bmad && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/meta-models.ts docs/spend.md test/meta-models.test.js
git commit -m "feat: pin Meta model IDs and spend budget"
```

### Task 1: SAM 3 live segmentation

**Files:**
- Modify: `repos/voice-idv-bmad/src/providers.ts` (Meta branch of `segment`)
- Test: `repos/voice-idv-bmad/test/sam.test.js`

**Interfaces:**
- Consumes: `META_MODELS.sam`, `PRICING` from Task 0; `Region`, `SegmentRequest` (unchanged)
- Produces: live `segment()` Meta branch (used by Task 4 demo; no caller changes)

- [ ] **Step 1: Write the failing test**

```js
test("SAM branch returns regions on image, falls back without", async () => {
  const live = await segment({label: "document quad", imageBase64: "iVBOR…"}, [], {env: {META_API_KEY: "test"}, fetcher: stubSam(["document quad"])});
  assert.equal(live.provider, "meta");
  assert.equal(live.regions[0].label, "document quad");
  const off = await segment({label: "document quad"}, [{label: "document quad", quad: [0,0,1000,1000]}], {env: {}});
  assert.equal(off.provider, "local");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd repos/voice-idv-bmad && npm test`
Expected: FAIL (Meta branch never returns `meta` — current code always skips).

- [ ] **Step 3: Implement the Meta branch in `segment()` in `src/providers.ts`**

When `imageBase64` is present and `META_API_KEY` set, POST `${META_BASE}/responses` with `META_MODELS.sam` (1000ms timeout); parse region quads into `Region[]` (0–1000 space); log spend. Absent image → keep current skip (`meta: no image supplied (fixture geometry used)`). Any failure → fall through to Replicate → local unchanged. Never throw.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd repos/voice-idv-bmad && npm test`
Expected: PASS, including the existing parity suite. Additionally pin fallback: stub fetcher returning no regions → `provider: "local"` with `skipped` recorded (add assertion in the test file).

- [ ] **Step 5: Commit**

```bash
git add src/providers.ts test/sam.test.js docs/spend.md
git commit -m "feat: SAM 3 live segmentation with fallback"
```

### Task 2: Muse Spark live narration + adversarial audit

**Files:**
- Modify: `repos/voice-idv-bmad/src/providers.ts` (replace hardcoded `"muse-spark-1.3"` with `META_MODELS.spark`)
- Create: `repos/voice-idv-bmad/src/audit.ts`
- Test: `repos/voice-idv-bmad/test/audit.test.js`

**Interfaces:**
- Consumes: `META_MODELS.spark` from Task 0; `CheckResult[]`, `Decision` from check engine
- Produces: `generateAudit(checks, decision, deps): Promise<{hypotheses: [string, string, string], provider: ProviderName}>` — report annotation only

- [ ] **Step 1: Write the failing test**

```js
test("audit returns 3 hypotheses and never changes the Decision", async () => {
  const checks = runChecks(measurementsFor("aus-passport-tampered-digit"));
  const before = decide(checks);
  const audit = await generateAudit(checks, before, {env: {}, fetcher: stubSpark("hypothesis text")});
  assert.equal(audit.hypotheses.length, 3);
  assert.equal(decide(checks), before);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd repos/voice-idv-bmad && npm test`
Expected: FAIL with "generateAudit not defined".

- [ ] **Step 3: Implement `generateAudit` in `src/audit.ts`, swap narration model constant**

Prompt Spark with check ids + results + evidence (redacted), asking for exactly 3 attack hypotheses ("how a human could have fooled me, and whether it was caught"), ≤40 words each. Timeout 1000ms; failure → 3 local template hypotheses (generic, marked `provider: "local"`). Hypotheses never feed back into checks. Replace both hardcoded spark IDs with `META_MODELS.spark`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd repos/voice-idv-bmad && npm test`
Expected: PASS (21 prior + new green). Additionally pin degradation: throwing fetcher → `provider: "local"` template text (add assertion — proves the timeout/failure path holds the 1.5s floor).

- [ ] **Step 5: Commit**

```bash
git add src/audit.ts src/providers.ts test/audit.test.js docs/spend.md
git commit -m "feat: Spark narration plus adversarial audit"
```

### Task 3: Glimmer edge-case fixture art

**Files:**
- Create: `repos/voice-idv-bmad/scripts/glimmer-art.mjs`
- Modify: `repos/voice-idv-bmad/src/fixtures.ts` (append-only, 2 fixtures)
- Test: `repos/voice-idv-bmad/test/glimmer.test.js`

**Interfaces:**
- Consumes: `META_MODELS.glimmer` from Task 0; `loadFixture`, `expectedFailures` (append-only)
- Produces: fixtures `aus-passport-glare` (clean, challenging art) and `nsw-dl-tilt` (clean, challenging art), each with exact `expectedFailures: []`

- [ ] **Step 1: Write the failing test**

```js
test("Glimmer-backed fixtures keep exact ground truth", () => {
  assert.deepEqual(expectedFailures("aus-passport-glare"), []);
  assert.deepEqual(expectedFailures("nsw-dl-tilt"), []);
  assert.equal(loadFixture("aus-passport-glare").art, "glimmer");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd repos/voice-idv-bmad && npm test`
Expected: FAIL with unknown fixture id.

- [ ] **Step 3: Generate art via `scripts/glimmer-art.mjs`, add fixtures append-only**

Script calls Glimmer once per fixture (visual base only: passport photo page, NSW DL front), saves under `fixtures/art/` with spend logged. MRZ + card-number regions composed programmatically as in Tasks 1–2 so `verifyCheckDigits` and `card_number_present` stay exact. Art is backdrop; legibility thresholds must still pass on the composed regions.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd repos/voice-idv-bmad && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/glimmer-art.mjs src/fixtures.ts test/glimmer.test.js fixtures/art docs/spend.md
git commit -m "feat: Glimmer edge-case fixture art"
```

### Task 4: Live demo hardening + submission

**Files:**
- Modify: `repos/voice-idv-bmad/src/index.ts` (report includes `audit.hypotheses`; Decision screen shows Attack Surface panel)
- Create: `repos/voice-idv-bmad/docs/submission.md`
- Test: `repos/voice-idv-bmad/test/meta-demo.test.js`

**Interfaces:**
- Consumes: all Tasks 0–3
- Produces: `--meta` live demo path; `docs/submission.md` (Cerebral Valley writeup: problem, Meta tooling use, architecture, video link, spend total)

- [ ] **Step 1: Write the failing test**

```js
test("live meta run verifies clean and rejects tampered", async () => {
  const clean = await runFixtureMeta("aus-passport-clean");
  const tamp = await runFixtureMeta("aus-passport-tampered-digit");
  assert.equal(clean.decision, "verified");
  assert.equal(tamp.decision, "rejected");
  assert.equal(tamp.audit.hypotheses.length, 3);
  assert.equal(clean.spend.total <= 150, true);
});
```

(`runFixtureMeta` helper lives in the test file only; it calls the live API and is skipped without `META_API_KEY`.)

- [ ] **Step 2: Run test to verify it fails (or skips without key)**

Run: `cd repos/voice-idv-bmad && npm test`
Expected: FAIL with "runFixtureMeta not defined" (or SKIP without key after implementation).

- [ ] **Step 3: Implement the live path + Attack Surface panel + submission doc**

`evaluateFixture` gains `{meta: true}` path calling live `segment`/`narrate`/`generateAudit`; Decisions must equal `--no-meta` (assert in test). Decision screen adds Attack Surface panel (3 hypotheses, expandable). `docs/submission.md` covers: accessibility problem, SAM/Spark/Glimmer use (beyond-basic: tracked challenge, adversarial audit, edge-case art), architecture in 5 lines, judging-criteria map, video link placeholder, final spend total.

- [ ] **Step 4: Run suite + manual live demo**

Run: `cd repos/voice-idv-bmad && npm test && npm start`
Expected: PASS/SKIP per key presence; manual: 1 clean + 1 tampered over `--meta`, verdicts spoken, audit visible. Record URL, actions, observed verdicts, spend total in the test report. Shoot the 2:15 video (problem 15s → clean 45s → tampered 40s → Decision 25s → limitations 10s).

- [ ] **Step 5: Commit**

```bash
git add src/index.ts test/meta-demo.test.js docs/submission.md docs/spend.md
git commit -m "feat: live meta demo path plus submission writeup"
```

## Follow-up (out of scope)

- Public URL deploy (`wrangler`) if not done in Task 4; Nov 3 repo-public flip; submit early via portal.
- Remaining 7-state DL validation, Medicare/ImmiCard, prod DVS, session TTL (from AU slice parked list).
