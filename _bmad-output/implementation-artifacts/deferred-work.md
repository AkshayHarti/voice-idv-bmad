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
