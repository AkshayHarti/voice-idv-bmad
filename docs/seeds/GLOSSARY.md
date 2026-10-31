# Voice-First IDV

A voice-driven identity verification demo. The Subject is guided entirely by
speech through presenting a Document and performing a motion challenge; the
system returns a Decision backed by deterministic Checks. It exists to show that
a KYC flow can work without a screen a person has to read.

## Language

### Flow

**Verification run**:
One end-to-end attempt to verify one Subject with one Document, producing exactly
one Report.
_Avoid_: session, attempt, submission, job

**Stage**:
The backend job the run is currently executing (`awaiting_document`,
`reading_document`, `awaiting_challenge`, `awaiting_selfie`, `comparing`,
`decided`). Stage advances only when backend code moves it; no language model
can change a Stage.
_Avoid_: state, phase, step

**Turn**:
One spoken utterance from the system, drawn from a closed set of intents
(`instruct`, `re-ask`, `replay`, `progress`, `warn`, `result`, `abort_confirm`).
_Avoid_: message, prompt, line, response

**Transcript**:
The on-screen mirror of every Turn, kept for sighted observers and as an
accessible fallback. Never the primary channel.
_Avoid_: caption, subtitle, overlay, log

### Judgement

**Check**:
One deterministic test with a stable id that reads the Document, the Document
image, or the captured frames and returns a CheckResult.
_Avoid_: rule, test, pattern, assertion

**CheckResult**:
`pass`, `fail`, or `inconclusive`, plus the Evidence that decided it. Only
`image_quality` may return `inconclusive`.
_Avoid_: score, finding, rating

**Evidence**:
The concrete datum a CheckResult cites — a computed check digit, a measured
region discontinuity, a similarity value. Evidence is what makes a Check
falsifiable.
_Avoid_: reason, citation, explanation

**Decision**:
The overall outcome of a run: `verified` only when every Check passed;
`rejected` when any Check failed; `not_verified` when none failed but at least
one was inconclusive. Never a weighted score and never a fraction.
_Avoid_: verdict, grade, confidence, trust score

**Report**:
The durable artifact of a run: every CheckResult with its Evidence, the
Decision, the limitations block, and run metadata.
_Avoid_: results, output, summary

### Claims we deliberately do not make

**Challenge compliance**:
The Check that the requested motion occurred inside the capture window, measured
as pose delta across sampled frames. Confirms responsiveness, not that a living
person is present.
_Avoid_: liveness, liveness detection, anti-spoofing, presentation-attack detection

**Portrait splice artifact**:
A detected discontinuity between the portrait region and the surrounding print
pattern. Reports that an artifact was not detected — never that a Document is
authentic.
_Avoid_: tamper detection, forgery detection, authenticity check

**Face match**:
A similarity comparison between the Document portrait and the selfie, reported
as a value and a band, explicitly uncertified.
_Avoid_: biometric verification, identity confirmation

### Data

**Subject**:
The person being verified, real or simulated.
_Avoid_: user, applicant, customer

**Document**:
The passport or national ID presented by the Subject. Passport TD3 only.
_Avoid_: ID, credential, doc, licence

**Fixture**:
A synthetic Document image, selfie, or frame set paired with a `fixture.json`
recording the exact Checks that must fail on it.
_Avoid_: sample, mock, test data, dummy

**Synthetic**:
Generated for this project, never derived from a real person or a real Document.
_Avoid_: fake, dummy, mock
