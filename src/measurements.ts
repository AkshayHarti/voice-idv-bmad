// Demo ground-truth measurements (AU voice-IDV demo slice).
// Single source shared by the stage machine (flow.ts, entering `comparing`)
// and the session report builder (index.ts, `evaluateFixture`), so both
// decide identically per fixture. Demo only: fields come from fixture
// ground truth, never from a live capture.
import { parseNSWDL } from "./au_dl.js";
import type { Measurements } from "./checks.js";
import { loadFixture } from "./fixtures.js";
import { parseTD3 } from "./mrz.js";

/** Demo run date (ISO); expiry comparisons baseline here, not wall-clock. */
export const RUN_TODAY = "2026-10-31";

/** Build check-engine measurements from fixture ground truth (demo only). */
export function buildMeasurements(fixtureId: string): Measurements {
  const fx = loadFixture(fixtureId);
  if (fx.kind === "au_passport") {
    const parsed = parseTD3(fx.mrz_lines[0], fx.mrz_lines[1]);
    return {
      kind: "au_passport",
      mrz_lines: fx.mrz_lines,
      viz: {
        passportNumber: parsed.passportNumber,
        dob: parsed.dob,
        expiry: parsed.expiry,
      },
      dl: null,
      today: RUN_TODAY,
      image_quality_inconclusive: false,
      portrait_present: true,
      splice_found: false,
      face: { similarity: 0.81, band: "high", certified: false },
      challenge_completed: true,
    };
  }
  return {
    kind: "au_dl",
    mrz_lines: null,
    viz: null,
    dl: parseNSWDL(fx.front, fx.back),
    today: RUN_TODAY,
    image_quality_inconclusive: false,
    portrait_present: true,
    splice_found: false,
    face: { similarity: 0.81, band: "high", certified: false },
    challenge_completed: true,
  };
}
