import { test } from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import app, { LOCK_NOW_UTTERANCE } from "../dist/index.js";
import { AUTO_CAPTURE_BEAT, matchIntent } from "../dist/flow.js";

// Goal 2 page structure: Halo tokens, assistant surfaces, capture loop
// wiring. Source-literal assertions (no browser harness exists); the
// on-device lock/deny run is the manual gate. Precondition: build.

async function getPage() {
  const response = await app.request("/page");
  assert.equal(response.status, 200);
  return response.text();
}

test("Halo tokens render: dark console, sky voice, frame-blue guides", async () => {
  const html = await getPage();
  for (const token of ["#0B0E13", "#12161D", "#7DD3FC", "#38BDF8", "#4ADE80", "#222B3A"]) {
    assert.ok(html.includes(token), `missing token ${token}`);
  }
});

test("assistant posture: orb, one spoken line, coach card, panel slot", async () => {
  const html = await getPage();
  for (const id of ["orb", "spoken", "coach", "panel"]) {
    assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
  }
  const spoken = [...html.matchAll(/id="spoken"/g)];
  assert.equal(spoken.length, 1, "exactly one live spoken line");
  assert.ok(html.includes("coachEl.replaceChildren()"), "coach card single-replaces");
  assert.ok(html.includes("panelEl.replaceChildren()"), "panel slot single-replaces");
});

test("live viewfinder with guides, lock, and announced capture", async () => {
  const html = await getPage();
  assert.ok(html.includes("<video"), "viewfinder video element");
  assert.ok(html.includes("getUserMedia"), "camera-first capture");
  assert.ok(html.includes("drawGuides"), "guide overlay");
  assert.ok(html.includes("announceLock"), "every lock is announced");
  assert.ok(html.includes("navigator.vibrate"), "haptic tick on lock");
});

test("coach loop samples strictly and never double-posts", async () => {
  const html = await getPage();
  assert.ok(html.includes("sampleTick"), "coach loop tick");
  assert.ok(html.includes("setInterval(sampleTick, 200)"), "~5Hz sampling");
  assert.ok(html.includes("sampling === true"), "strict sampling guard");
  assert.ok(html.includes("sampleInflight === true"), "in-flight guard");
  assert.ok(html.includes("res.announced === true"), "repeat episodes hold");
});

test("facing mode follows the capture kind; track end parks the run", async () => {
  const html = await getPage();
  assert.ok(html.includes("facingMode"), "per-kind facing mode");
  assert.ok(html.includes("'environment'"), "documents use the rear camera");
  assert.ok(html.includes("'user'"), "challenge/selfie face the user");
  assert.ok(html.includes("onended"), "track-end handler exists");
  assert.ok(html.includes("cameraDenied"), "denied/end routes to the park path");
  assert.ok(html.includes("stand-in capture") || html.includes("standinBtn"), "fixture stand-in path");
});

test("retake pair and panel renderer with no dead controls", async () => {
  const html = await getPage();
  assert.ok(html.includes("renderPanel"), "panel renderer");
  assert.ok(html.includes("retake-pair"), "retake-pair primitive renders");
  assert.ok(html.includes("'/keep'") || html.includes("/keep"), "Keep posts to keep");
  assert.ok(html.includes("'/retake'") || html.includes("/retake"), "Retake posts to retake");
  assert.ok(!html.includes("'retry'"), "no dead retry control");
});

test("late responses are dropped; stand-in cannot double-fire or stall", async () => {
  const html = await getPage();
  assert.ok(html.includes("tickSession"), "telemetry staleness token");
  assert.ok(html.includes("tickStage"), "stage token");
  assert.ok(html.includes("lockSession"), "lock staleness token");
  assert.ok(html.includes("standinBusy"), "stand-in busy guard");
  assert.ok(html.includes("drawGuides(captureStage, false)"), "retake redraws guidance guides");
});

test("microphone failures name the remedy and retry next turn", async () => {
  const html = await getPage();
  assert.ok(html.includes("activeRecognition"), "overlapping recognizers guarded");
  assert.ok(html.includes("browser's site settings"), "blocked mic names the remedy");
  assert.ok(html.includes("No microphone found"), "missing device named");
  assert.ok(html.includes("Speech service unreachable"), "network errors named, not counted as silence");
  assert.ok(html.includes("silentStreak >= 3"), "only sustained dead air parks");
  assert.ok(html.includes("voiceGen"), "retired generations cannot speak into new runs");
  assert.ok(!html.includes("listenGen"), "single generation counter, no duplicate");
  assert.ok(html.includes("silenceParked"), "silence parks lift on typed proof of presence");
  assert.ok(html.includes("START_RETRY_SUFFIX"), "parked remedies share one recovery tail");
  assert.ok(html.includes("retries next turn"), "only network retries next turn");
  assert.ok(!html.includes("micBroken"), "permanent latch is gone");
});

test("speech prefers a friendly female voice", async () => {
  const html = await getPage();
  assert.ok(html.includes("pickVoice"), "voice picker present");
  assert.ok(html.includes("getVoices"), "selects from system voices");
  assert.ok(html.includes("u.voice = voice"), "picked voice is wired into the utterance");
  assert.ok(html.includes("u.pitch"), "warmer pitch tuning");
});

test("failure paths message instead of stalling silently", async () => {
  const html = await getPage();
  const routed = html.split("postError(err)").length - 1;
  assert.ok(routed >= 6, `every failure catch routes through postError (found ${routed})`);
  assert.ok(html.includes("Session expired"), "expired sessions name the recovery");
  assert.ok(html.includes("err.status === 404"), "404 diagnosed separately");
  assert.ok(html.split("sampleFails = 0").length - 1 >= 3, "fail counter resets with capture lifecycle");
  assert.ok(html.split("setCoach('')").length - 1 >= 3, "coach clears when capture stops");
  assert.ok(html.includes("sampleFails"), "sampler counts consecutive failures");
  assert.ok(html.includes("Connection lost"), "dead server announced on coach card");
  assert.ok(!html.includes("panelEvidence"), "end-user page renders no panel evidence (see test/result.test.js)");
  assert.ok(html.includes("err.status"), "thrown errors carry HTTP status");
  assert.ok(html.includes("err.status === 409"), "stale lock stays disabled");
  assert.ok(html.includes("Something went wrong"), "malformed steps bail with recovery");
  assert.ok(html.includes("sampleDownUntil"), "dead server backs polling off");
  assert.ok(html.includes('id="listen" aria-live="polite"'), "remedies announced to screen readers");
});

test("capture frame docks at the chat on capture start (placement C)", async () => {
  const html = await getPage();
  assert.ok(html.includes('id="dockZone"'), "dock zone above the input");
  assert.ok(
    html.indexOf('id="dockZone"') > html.indexOf('id="listen"'),
    "dock lands below the chat line it answers"
  );
  assert.ok(
    html.indexOf('id="dockZone"') < html.indexOf('id="typed"'),
    "dock lands above the typed input"
  );
  assert.ok(html.includes("function dockFrame"), "docking routine exists");
  assert.ok(html.includes("dockZone.appendChild(captureWrap)"), "frame node moves to the dock");
  assert.ok(html.includes("captureWrap.scrollIntoView"), "view follows the frame");
  assert.ok(html.includes("frameHome.insertBefore"), "frame returns home at stage close");
  assert.ok(html.includes("REDUCED_MOTION ? 'auto' : 'smooth'"), "docking honors reduced motion");
  assert.ok(html.includes("dockFrame(on)"), "show/hide drives the dock");
});

test("telemetry stays numeric; v1 zero-heuristics are disclosed", async () => {
  const html = await getPage();
  assert.ok(html.includes("videoSample"), "client-side heuristics");
  assert.ok(html.includes("no viewfinder frames are uploaded"), "no frame upload");
  assert.ok(html.includes("moire: 0"), "v1 moire zero disclosed");
});

test("auto-capture arms on the clean run with a fixed beat and vetoes", async () => {
  const html = await getPage();
  assert.ok(html.includes("enterArm"), "arm entry runs the fire clock");
  assert.ok(html.includes("BEAT_TWIN"), "fixed beat twin");
  assert.ok(html.includes("Perfect — hold still, capturing."), "beat wording matches the server turn");
  assert.ok(html.includes(AUTO_CAPTURE_BEAT), "served beat twin matches the server beat constant");
  assert.ok(html.includes("cancelArmSilent"), "vetoes cancel silently");
  assert.ok(html.includes("disarmToCoaching"), "vetoes resume coaching");
  assert.ok(html.includes("armPulse"), "arm haptic pre-pulse");
  assert.ok(html.includes("navigator.vibrate([12, 60, 12])"), "double pre-pulse distinct from the lock tick");
  assert.ok(html.includes("startCaptureListener"), "capture-stage command listener");
  assert.ok(html.includes("captureWatchdog"), "capture-stage command watchdog");
  assert.ok(!html.includes("pendingRef !== null || armed === true"), "command listener stays live while Armed");
  assert.ok(html.includes("fireFrameVetoed"), "fire-time frame re-grade");
  assert.ok(html.includes("fireVetoes"), "consecutive fire-time vetoes counted");
  assert.ok(html.includes("FIRE_VETO_OFFER"), "fire-veto loop has a spoken escape");
  assert.ok(html.includes("one missed tick, never a dead loop"), "failed peek never sticks the sampler");
  assert.ok(html.includes("err.status === 409 || err.status === 404"), "expired sessions keep Lock disabled");
  assert.ok(html.includes("restartCaptureListener"), "recognizer restarts back off on persistent errors");
  assert.ok(html.includes("speechSynthesis.cancel()"), "beat jumps the TTS queue at arm entry");
  assert.ok(html.includes("prevLuma"), "motion baseline across samples");
  assert.ok(html.includes("MOTION_THRESHOLD"), "motion veto threshold");
  assert.ok(html.includes("LOCK_NOW_HEARD"), "lock-now command words");
  assert.ok(html.includes("voiceLock"), "voice locks share the confirm landing");
  assert.ok(html.includes("tickArm === armGen"), "mid-flight vetoes retire stale ticks");
  assert.ok(html.includes("Lock ' + CAPTURE_SHORT[stage]"), "Lock naming carries the stage");
});

test("client and server command matchers agree on the lock/wait vocabulary", async () => {
  const html = await getPage();
  const lockHeard = eval(html.match(/const LOCK_NOW_HEARD = (\/.*?\/i);/)[1]);
  const waitHeard = eval(html.match(/const WAIT_HEARD = (\/.*?\/i);/)[1]);
  for (const s of ["lock", "lock it", "lock now", "lock this", "lock it now", "lock now please", "please lock now", "lock now!", "lock now?"]) {
    assert.ok(LOCK_NOW_UTTERANCE.test(s), `server must fire on ${s}`);
    assert.ok(lockHeard.test(s), `client must hear ${s}`);
  }
  for (const s of ["locker", "unlock now", "don't lock now"]) {
    assert.ok(!LOCK_NOW_UTTERANCE.test(s), `server must ignore ${s}`);
    assert.ok(!lockHeard.test(s), `client must ignore ${s}`);
  }
  for (const s of ["wait", "hold on", "hold off"]) {
    assert.equal(matchIntent(s), "wait", `server must veto on ${s}`);
    assert.ok(waitHeard.test(s), `client must hear ${s}`);
  }
});

test("confirm card shows the snapshot with a verdict caption and the pair", async () => {
  const html = await getPage();
  assert.ok(html.includes("dockZone.append(card)"), "confirm card docks above the input");
  assert.ok(html.includes("card.scrollIntoView"), "view follows the docked card");
  assert.ok(html.includes("dropConfirmCard"), "card node drops on retire and re-render");
  assert.ok(html.includes("#dockZone .card"), "docked card keeps card chrome");
  assert.ok(html.includes("takeSnapshot"), "snapshot grab at lock");
  assert.ok(html.includes("toDataURL"), "snapshot encoded locally");
  assert.ok(html.includes("createElement('img')"), "confirm-card img branch");
  assert.ok(html.includes("img.alt = ''"), "snapshot img is decorative");
  assert.ok(html.includes("confirm-img"), "confirm image styling");
  assert.ok(html.includes("pendingVerdict"), "verdict caption state");
  assert.ok(html.includes("pverdict"), "verdict caption styling");
  assert.ok(html.includes("retake-pair"), "pair still offered on the card");
  assert.ok(html.includes("alertdialog"), "card arrival is assertive");
  assert.ok(html.includes("Keep document front"), "pair names carry the capture");
  assert.ok(html.includes("setAttribute('aria-label'"), "accessible pair names");
});

test("verdict turn sounds before the keep/retake question", async () => {
  const html = await getPage();
  assert.ok(html.includes("speak(pendingVerdict)"), "verdict turn spoken");
  assert.ok(
    html.indexOf("speak(pendingVerdict)") < html.indexOf("announceLock(res.text)"),
    "verdict sounds before the question",
  );
  assert.ok(html.includes("GENERIC_VERDICT"), "generic verdict fallback");
});

test("review gate renders retained snapshots plus detail rows with a confirm pair", async () => {
  const html = await getPage();
  assert.ok(html.includes("review-confirm"), "review-confirm primitive renders");
  assert.ok(html.includes("stageSnapshots"), "per-stage snapshots retained for review");
  assert.ok(html.includes("retainSnapshot"), "locks retain their snapshot");
  assert.ok(html.includes("clearSnapshots"), "decided/purged/restarted runs drop snapshots");
  assert.ok(html.includes("review-img"), "review image styling");
  assert.ok(html.includes("reviewHeading"), "review heading focus target");
  assert.ok(html.includes("focusReviewHeading"), "focus moves to the review card");
  assert.ok(html.includes("doConfirm"), "confirm posts the review signal");
  assert.ok(html.includes("review_confirmed"), "confirm fires review_confirmed");
  assert.ok(html.includes("choice.id === 'confirm'"), "confirm choice routes to doConfirm");
});

test("snapshot stays client-side and clears on keep/retake/stop", async () => {
  const html = await getPage();
  assert.ok(html.includes("never posted"), "snapshot never leaves the device");
  assert.ok(html.includes("pendingSnapshot = null"), "snapshot cleared");
  assert.ok(html.includes("retireCard"), "card retires with review state");
  assert.ok(html.includes("clearReviewState"), "stop/restart clears review state");
  assert.ok(html.includes("retireCard()"), "drive retires the card when the pair closes");
  assert.ok(html.includes("'/keep', {}"), "keep POSTs stay {}");
  assert.ok(html.includes("'/retake', {}"), "retake POSTs stay {}");
});

test("stand-in path locks with a fixture label and generic verdict", async () => {
  const html = await getPage();
  assert.ok(html.includes("standin-label"), "fixture label styling");
  assert.ok(html.includes("Stand-in capture"), "fixture label instead of photo");
  assert.ok(html.includes("pendingStandin"), "stand-in review state");
  // Live locks carry the locked crop; only the pixel-less stand-in posts bare.
  const bareLockPosts = html.split("'/lock', {}").length - 1;
  assert.equal(bareLockPosts, 1, `stand-in lock posts bare {} (found ${bareLockPosts})`);
  assert.ok(html.includes("takeCrop"), "live lock grabs a downscaled crop");
  assert.ok(html.includes("crop ? { crop } : {}"), "live lock attaches the crop when present");
  assert.ok(html.includes("CROP_MAX_CHARS"), "crop capped client-side");
});

test("focus moves to the card heading and back to the spoken line", async () => {
  const html = await getPage();
  assert.ok(html.includes("confirmHeading"), "card heading target");
  assert.ok(html.includes("focusConfirmHeading"), "focus-in on card appearance");
  assert.ok(html.includes("focusConfirmHeading()"), "lock paths focus the card");
  assert.ok(html.includes("spokenEl.focus"), "focus restores to the spoken line");
  assert.ok(html.includes('id="spoken" aria-live="polite" tabindex="-1"'), "spoken line is focusable");
});

test("self-voicing yields to screen readers unless the toggle overrides", async () => {
  const html = await getPage();
  assert.ok(html.includes("srDetected"), "screen-reader detection");
  assert.ok(html.includes("voiceOverride"), "user toggle override");
  assert.ok(html.includes('id="voiceToggle"'), "voice toggle control");
  assert.ok(html.includes("Voice: auto"), "toggle starts in auto");
  assert.ok(html.includes("aria-pressed"), "toggle exposes pressed semantics");
});

test("speech-in is Transcribe-first when keyed, recognition then typed otherwise", async () => {
  const html = await getPage();
  assert.ok(html.includes("asrPrimary"), "keyed flag routes speech input");
  assert.ok(html.includes("Muse Voice Transcribe"), "note line names the primary ASR");
  assert.ok(html.includes("function listenTranscribe"), "transcribe-first turn listener");
  assert.ok(html.includes("function listenSpeech"), "on-device turn listener kept as fallback");
  assert.ok(html.includes("function captureTranscribe"), "transcribe-first command listener");
  assert.ok(html.includes("function captureSpeech"), "on-device command listener kept as fallback");
  assert.ok(html.includes("recordUtterance"), "utterance recorder with VAD silence-stop");
  assert.ok(html.includes("MediaRecorder"), "mic recording for upload");
  assert.ok(html.includes("blobToWav16k"), "recordings downmix to 16 kHz mono WAV");
  assert.ok(html.includes("decodeAudioData"), "recorded blobs decode before upload");
  assert.ok(html.includes("transcribeUtterance"), "utterances post to the ASR endpoint");
  assert.ok(html.includes("'/transcribe'"), "client posts audio to /transcribe");
  assert.ok(html.includes("stopRecording"), "retire paths release the mic");
  assert.ok(html.includes("ASR_MAX_CHARS"), "utterance uploads capped client-side");
  // The ladder never cycles: transcribe misses fall to SR, SR parks never climb back.
  const transcribeFn = html.indexOf("function listenTranscribe");
  const speechFn = html.indexOf("function listenSpeech");
  const fallbackCall = html.indexOf("listenSpeech();", transcribeFn);
  assert.ok(
    fallbackCall !== -1 && fallbackCall < speechFn,
    "transcribe misses fall back to on-device recognition",
  );
});

test("speech-out prefers the local sidecar voice with synthesis fallback", async () => {
  const html = await getPage();
  assert.ok(html.includes("ttsLocal"), "keyed flag routes speech output");
  assert.ok(html.includes("TTS_VOICE_LABELS"), "note line maps the ttsVoice id");
  assert.ok(html.includes("Seamless v2 voice"), "Seamless label present");
  assert.ok(html.includes("local MMS voice"), "MMS label kept for the MMS sidecar");
  assert.ok(html.includes("function speakSidecar"), "sidecar playback path");
  assert.ok(html.includes("function speakSynth"), "synthesis path kept as fallback");
  assert.ok(html.includes("stopTtsAudio"), "barge-in and interrupts stop playback");
  assert.ok(html.includes("'/api/tts'"), "turns post to the TTS endpoint");
  const mmsFn = html.indexOf("function speakSidecar");
  assert.ok(
    html.indexOf("speakSynth(text, gen, onStart)", mmsFn) !== -1 &&
    html.indexOf("speakSynth(text, gen, onStart)", mmsFn) < html.indexOf("function speakSynth"),
    "MMS misses fall back to synthesis for the same sentence",
  );
});

test("barge-in: hot mic during playback cuts on speech, drives the step", async () => {
  const html = await getPage();
  const speakFn = html.indexOf("function speak(text)");
  assert.ok(speakFn !== -1, "speak choke point exists");
  const speakSidecarFn = html.indexOf("function speakSidecar");
  const speakBlock = html.slice(speakFn, speakSidecarFn);
  assert.ok(speakBlock.includes("startLiveStream"), "speak opens a barge watch stream");
  assert.ok(speakBlock.includes("liveSocket === null"), "watch never fights an owned stream");
  assert.ok(speakBlock.includes("BARGE_GRACE_MS"), "self-echo grace window");
  assert.ok(speakBlock.includes("bargeArmedAt"), "grace arms at playback start");
  assert.ok(speakBlock.includes("stopVoicePlayback"), "armed speechStart cuts playback");
  assert.ok(speakBlock.includes("drive(step)"), "interruption step drives the turn");
  assert.ok(speakBlock.includes("BARGE_STEP_WAIT_MS"), "cough without a step resumes");
  assert.ok(html.includes("speakAbort.abort()"), "cut aborts the in-flight TTS fetch");
  assert.ok(html.includes("finishSilent"), "late TTS resolves silent, never plays over the user");
  assert.ok(html.includes("speakGen += 1"), "cuts retire the speech generation");
});

test("barge-in: superseded turns return early, fresh turns retire watchers", async () => {
  const html = await getPage();
  assert.ok(html.includes("if (await speak(step.echo)) return"), "echo barge abandons the turn");
  assert.ok(
    html.includes("if (await speak(step.narration.text)) return"),
    "narration barge skips the stale continuation",
  );
  assert.ok(html.includes("return speak(text)"), "announceLock propagates the barged flag");
  assert.ok(
    html.includes("if (await announceLock(step.text)) return"),
    "verdict-path barge skips the lock announce",
  );
  const respondFn = html.indexOf("async function respond(utterance)");
  const nextFn = html.indexOf("async function", respondFn + 1);
  const respondBlock = html.slice(respondFn, nextFn);
  assert.ok(
    respondBlock.includes("voiceGen += 1"),
    "fresh turns retire live listeners and barge watches",
  );
});

test("speech-in routes the realtime relay first with commands mode", async () => {
  const html = await getPage();
  assert.ok(html.includes("asr-live"), "relay upgrade path");
  assert.ok(html.includes("AudioWorklet"), "mic PCM worklet");
  assert.ok(html.includes("idv-pcm"), "worklet processor name");
  assert.ok(html.includes("function listenLive"), "live turn listener");
  assert.ok(html.includes("function captureLive"), "live command listener");
  assert.ok(html.includes("startLiveStream"), "shared stream setup");
  assert.ok(html.includes("stopLiveAudio"), "retire paths release mic + socket");
  assert.ok(html.includes("stopVoicePlayback"), "barge-in stops playback");
  assert.ok(html.includes("'commands'"), "capture selects commands mode");
  assert.ok(html.includes("Hearing: "), "partials caption the turn");
});

test("near-miss echo sounds before the resolved turn", async () => {
  const html = await getPage();
  assert.ok(html.includes("step.echo"), "echo carried on the step");
  assert.ok(html.includes("speak(step.echo)"), "echo spoken first");
});

test("progress steps stick to the top of the page while the run scrolls", async () => {
  const html = await getPage();
  assert.ok(html.includes('id="progressDock"'), "progress dock slot at the top");
  assert.ok(
    html.indexOf('id="progressDock"') < html.indexOf('id="fixtures"'),
    "progress dock lands above the run controls"
  );
  assert.ok(html.includes("#progressDock { position:sticky; top:0;"), "progress dock sticks to the viewport top");
  assert.ok(html.includes("progressDock.replaceChildren()"), "progress dock single-replaces with the panel");
  assert.ok(html.includes("progressDock.append(card)"), "progress-steps cards render in the top dock");
  assert.ok(html.includes("#progressDock ol.steps"), "step list keeps its chrome in the dock");
});

test("capture frame sticks to the dock above the input while chat scrolls", async () => {
  const html = await getPage();
  assert.ok(html.includes('id="composerDock"'), "composer dock wraps dock zone and input");
  assert.ok(
    html.indexOf('id="composerDock"') < html.indexOf('id="dockZone"') &&
    html.indexOf('id="dockZone"') < html.indexOf('id="typed"'),
    "composer keeps the dock above the typed input"
  );
  assert.ok(html.includes("#composerDock { position:sticky; bottom:0;"), "composer pins frame and input to the viewport bottom");
});

test("captured preview replaces the live frame until keep/retake resolves", async () => {
  const html = await getPage();
  const hideAt = html.indexOf("captureWrap.hidden = true");
  assert.ok(
    hideAt > html.indexOf("function renderPanel") && hideAt < html.indexOf("dockZone.append(card)"),
    "confirm card hides the live frame before docking"
  );
  assert.ok(
    html.indexOf("captureWrap.hidden = false") < html.indexOf("drawGuides(captureStage, false)"),
    "retake unhides the frame before guides redraw"
  );
  assert.ok(html.includes("drawGuides(stage, false)"), "resumed capture redraws guidance guides");
});

test("served client module parses: template-literal escapes must survive", async () => {
  // A single backslash inside the PAGE template literal is consumed by
  // TypeScript (e.g. '\n' becomes a real newline), shipping a script that
  // kills the whole module: dead buttons, no fixtures, no narration.
  const html = await getPage();
  const match = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(match, "inline client module present");
  assert.doesNotThrow(
    () => new Script(match[1], { filename: "client.mjs" }),
    "served client script must parse"
  );
});
