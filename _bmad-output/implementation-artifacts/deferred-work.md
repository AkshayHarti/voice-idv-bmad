- source_spec: none
  summary: Build the assistant concept (Capture surface plus telemetry/coach loop, UI generator plus panel schema, Halo reframe) with Goal 2 spec conformed to the Cerebral Valley rules PDF (SAM 3.1, Muse Image, Voice Transcribe, Wonder, Glimmer/Spark Open as run-weights).
  evidence: split from Aria-naming intent at step-01 scope gate; independently shippable, deferred per user lock on Goal 1.
- source_spec: `_bmad-output/implementation-artifacts/spec-goal-2-assistant-concept.md`
  summary: Correct Meta model pins per Rev 2 §11 (sam-3-1, Muse Image art role, Glimmer local core, provisional Wonder/Transcribe) with consumers, pricing, script rename, and pin tests.
  evidence: split from Goal 2 spec at step-02 token gate; independently shippable, no page/flow dependency.
- source_spec: `_bmad-output/implementation-artifacts/spec-goal-2-assistant-concept.md`
  summary: Feed capture-layer inputs (persistent-fault counters, moiré flag) into the fraud matrix per Rev 2 §7 with the tier rule unchanged.
  evidence: split from Goal 2 spec at step-02 token gate; consumes the telemetry counters the surfaces build emits.
- source_spec: `_bmad-output/implementation-artifacts/spec-goal-2-assistant-concept.md`
  summary: Run the manual on-device lock acceptance (flash plus haptic plus spoken confirm, deny parks) as the gate for the Capture surface.
  evidence: review found the page suite cannot observe the announceLock call site and no browser harness exists to execute it.
- source_spec: `_bmad-output/implementation-artifacts/spec-goal-2-assistant-concept.md`
  summary: Fire a fresh instruct Turn when the DL-back auto-park parks at awaiting_doc_back instead of keeping the stale front Turn.
  evidence: review found backMissing auto-park predates Goal 2 with a stale last_turn that generated panels now render.
- source_spec: `_bmad-output/implementation-artifacts/spec-friendlier-voice.md`
  summary: Add the auto-capture re-vote banner to brainstorm.html so the keepsake alone cannot mislead an implementer.
  evidence: review found the keepsake declares AUTO-CAPTURE ALWAYS decided while the intent doc records cluster 3 dropped with re-vote open.
- source_spec: `_bmad-output/implementation-artifacts/spec-mic-unavailable.md`
  summary: Correct the spec Intent to match the implemented never-latch policy for permission and device errors.
  evidence: review found the frozen text says device/permission loss parks while the code parks only on 3x silence; frozen text cannot be edited in-run.
- source_spec: `_bmad-output/implementation-artifacts/spec-mic-unavailable.md`
  summary: Post microphone failure mix (block/capture/silence counts) so it is observable like the capture counters.
  evidence: review found mic failures emit no telemetry while sibling subsystems count theirs; new API surface, follow-up sized.
- source_spec: `_bmad-output/implementation-artifacts/spec-human-capture-confirm.md`
  summary: Confirm the suppressed-mode quality verdict reaches screen readers (it may flash past SR when self-voicing yields).
  evidence: review maybe-false (medium if true); settle with the on-device VoiceOver/TalkBack pass, then specify a dwell or transcript-announcement rule if the verdict is lost.
- source_spec: `_bmad-output/implementation-artifacts/spec-human-capture-confirm.md`
  summary: Add executed DOM/speech-order coverage for the confirm-card lifecycle, verdict/echo ordering, and SR arbitration.
  evidence: review found page tripwires are string-literal only; no browser harness exists and the on-device lock run is the stated manual gate.
- source_spec: `_bmad-output/implementation-artifacts/spec-customer-view.md`
  summary: Keep check evidence out of end-user API payloads, not just rendered HTML (step JSON still carries the full report; /api/run/:id serves fixture reports openly).
  evidence: verification found the audience split is render-level per spec; true payload-hardening changes pinned API shapes and needs a spec-level decision.
- source_spec: `_bmad-output/implementation-artifacts/spec-meta-live-reachability.md`
  summary: Concatenate multi-part Responses text instead of first-part-only when an observed multi-part payload defines join semantics.
  evidence: review found responseText returns the first output_text part; all observed payloads carry one part.
- source_spec: `_bmad-output/implementation-artifacts/spec-meta-live-reachability.md`
  summary: Handle OpenAI-style array-of-parts choices content when an observed OpenRouter array payload exists.
  evidence: review found content typed string-only (pre-existing, safe-direction local fallback).
- source_spec: `_bmad-output/implementation-artifacts/spec-meta-live-reachability.md`
  summary: Design a custom-model escape hatch for the unconditional reasoning param if a META_TEXT_MODEL target rejects it.
  evidence: review found no env override; retry is a spec non-goal and no rejecting model is known.
- source_spec: `_bmad-output/implementation-artifacts/spec-auto-capture.md`
  summary: Harden veto-adjacent deny phrasing ("no wait", "no wait, lock now") so a hold-off attempt cannot purge the run.
  evidence: review confirmed the deny regex matches bare "no" by documented contract, making the purge specified behavior, but the trap is new with the wait intent and needs an intent-level fix (confirm-before-purge or carve-out).
- source_spec: `_bmad-output/implementation-artifacts/spec-auto-capture.md`
  summary: Harden veto phrasing against affirm precedence ("ok wait" reads as affirm and the arm auto-fires).
  evidence: review confirmed affirm matches bare "ok" by documented contract; widening veto precedence needs an intent-level decision, not a patch.
- source_spec: `_bmad-output/implementation-artifacts/spec-auto-capture.md`
  summary: Cover the client auto-fire clock (beat-to-lock timing, veto fall-through) with executing verification or a recorded manual on-device pass.
  evidence: review verified the fire clock is pinned only by source-text checks; a wrong delay or dropped doLock stays green, and the spec gates client behavior on the manual run.
- source_spec: none
  summary: Run OCR on the captured document (server Meta vision on the locked crop) and send extracted details to the customer page.
  evidence: split from the VIC+OCR intent as the second goal; VIC goes first to settle field shapes.
- source_spec: `_bmad-output/implementation-artifacts/spec-doc-ocr.md`
  summary: Cover the client takeCrop flow with executing verification (DOM/canvas harness) instead of source-text pins.
  evidence: review verified a runtime-broken takeCrop stays green while all live locks silently degrade to fixture fallback; no harness precedent exists in the repo.
- source_spec: `_bmad-output/implementation-artifacts/spec-doc-ocr.md`
  summary: Add global rate limiting (per-IP/per-key lock and session-mint caps) at deployment; per-stage OCR attempt caps only bound single sessions.
  evidence: party elicitation confirmed open session mint + per-session-only caps still allow multi-session spend loops once hosted publicly.
