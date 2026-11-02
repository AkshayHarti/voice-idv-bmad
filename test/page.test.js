import { test } from "node:test";
import assert from "node:assert/strict";
import app from "../dist/index.js";

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

test("failure paths message instead of stalling silently", async () => {
  const html = await getPage();
  const serverMsg = html.split("Could not reach the server.").length - 1;
  assert.ok(serverMsg >= 6, `every failure catch messages (found ${serverMsg})`);
  assert.ok(html.includes("sampleFails"), "sampler counts consecutive failures");
  assert.ok(html.includes("Connection lost"), "dead server announced on coach card");
  assert.ok(html.includes("panelEvidence"), "empty panel evidence falls back to report");
  assert.ok(html.includes("err.status"), "thrown errors carry HTTP status");
  assert.ok(html.includes("err.status === 409"), "stale lock stays disabled");
});

test("telemetry stays numeric; v1 zero-heuristics are disclosed", async () => {
  const html = await getPage();
  assert.ok(html.includes("videoSample"), "client-side heuristics");
  assert.ok(html.includes("no viewfinder frames are uploaded"), "no frame upload");
  assert.ok(html.includes("moire: 0"), "v1 moire zero disclosed");
});
