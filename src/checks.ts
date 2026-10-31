// Check engine + Decision (AU voice-IDV demo slice, spec §§3/5/6).
// Pure functions, no deps beyond sibling helpers. Decision is conjunction:
// `verified` iff all checks pass; `rejected` if any fail; `not_verified`
// if none failed but ≥1 `inconclusive`. Only `image_quality` may be
// `inconclusive`; `inconclusive` never approves.
// Avoid: not liveness, not tamper detection, not biometric verification —
// motion confirms responsiveness, splice-not-found is not authenticity,
// face similarity is a value + band, uncertified (spec §1 non-claims).
// Never log full numbers/MRZ: evidence uses redacted refs (see redact.ts).
import { checkDigit, parseTD3 } from "./mrz.js";
import type { DLFields } from "./au_dl.js";
import { redactRef } from "./redact.js";

export type CheckOutcome = "pass" | "fail" | "inconclusive";

export interface CheckResult {
  id: string;
  result: CheckOutcome;
  evidence: string;
  /** face_match value (0–1 similarity), uncertified. */
  value?: number;
  /** face_match band. */
  band?: "high" | "medium" | "low";
  /** face_match is always uncertified in this slice. */
  certified?: boolean;
}

export type Decision = "verified" | "rejected" | "not_verified";

export interface VizFields {
  passportNumber: string;
  dob: string;
  expiry: string;
}

export interface FaceSignals {
  similarity: number;
  band: "high" | "medium" | "low";
  certified: false;
}

export interface Measurements {
  kind: "au_passport" | "au_dl";
  mrz_lines: [string, string] | null;
  viz: VizFields | null;
  dl: DLFields | null;
  /** Run date as ISO YYYY-MM-DD (expiry comparison baseline). */
  today: string;
  /** True when capture telemetry needs a re-ask (never approves). */
  image_quality_inconclusive: boolean;
  portrait_present: boolean;
  /** True when a portrait splice discontinuity was found. */
  splice_found: boolean;
  face: FaceSignals;
  challenge_completed: boolean;
}

/** MRZ YYMMDD → ISO date. Pivot: yy >= 50 → 19yy, else 20yy. */
function mrzDateToIso(yyMMdd: string): string {
  const yy = Number(yyMMdd.slice(0, 2));
  const full = yy >= 50 ? 1900 + yy : 2000 + yy;
  return `${full}-${yyMMdd.slice(2, 4)}-${yyMMdd.slice(4, 6)}`;
}

function digitEvidence(field: string, content: string, printed: string): string {
  return `${field} computed ${checkDigit(content)} vs printed ${printed}`;
}

export function runChecks(m: Measurements): CheckResult[] {
  const out: CheckResult[] = [];
  const na = (id: string, why: string): void => {
    out.push({ id, result: "pass", evidence: `n/a for ${m.kind} (${why})` });
  };

  // --- TD3 document checks (pass n/a for driver licences) ---
  if (m.mrz_lines === null) {
    for (const id of [
      "line_count",
      "char_set",
      "td3_length",
      "check_digit_docnum",
      "check_digit_dob",
      "check_digit_expiry",
      "check_digit_composite",
      "mrz_viz_match",
    ]) {
      na(id, "no mrz");
    }
  } else {
    const [l1, l2] = m.mrz_lines;
    out.push({
      id: "line_count",
      result: m.mrz_lines.length === 2 ? "pass" : "fail",
      evidence: `${m.mrz_lines.length} mrz lines present`,
    });
    const joined = l1 + l2;
    out.push({
      id: "char_set",
      result: /^[A-Z0-9<]+$/.test(joined) ? "pass" : "fail",
      evidence: "charset A-Z0-9< only",
    });
    out.push({
      id: "td3_length",
      result: l1.length === 44 && l2.length === 44 ? "pass" : "fail",
      evidence: `line lengths ${l1.length}x${l2.length} (expect 2x44)`,
    });
    const doc = l2.slice(0, 9);
    const dob = l2.slice(13, 19);
    const expiry = l2.slice(21, 27);
    const personal = l2.slice(28, 42);
    const docCases: Array<[string, string, string]> = [
      ["check_digit_docnum", doc, l2.slice(9, 10)],
      ["check_digit_dob", dob, l2.slice(19, 20)],
      ["check_digit_expiry", expiry, l2.slice(27, 28)],
    ];
    for (const [id, content, printed] of docCases) {
      out.push({
        id,
        result: checkDigit(content) === printed ? "pass" : "fail",
        evidence: digitEvidence(id, content, printed),
      });
    }
    const compositeContent =
      doc +
      l2.slice(9, 10) +
      dob +
      l2.slice(19, 20) +
      expiry +
      l2.slice(27, 28) +
      personal +
      l2.slice(42, 43);
    const compositePrinted = l2.slice(43, 44);
    out.push({
      id: "check_digit_composite",
      result: checkDigit(compositeContent) === compositePrinted ? "pass" : "fail",
      evidence: digitEvidence("check_digit_composite", compositeContent, compositePrinted),
    });
    if (m.viz === null) {
      na("mrz_viz_match", "no viz");
    } else {
      const parsed = parseTD3(l1, l2);
      const mismatches: string[] = [];
      if (m.viz.passportNumber !== parsed.passportNumber) {
        mismatches.push(
          `passport_number viz ${redactRef("passport_number", m.viz.passportNumber)} vs mrz ${redactRef("passport_number", parsed.passportNumber)}`,
        );
      }
      if (m.viz.dob !== parsed.dob) {
        mismatches.push(`dob viz vs mrz mismatch`);
      }
      if (m.viz.expiry !== parsed.expiry) {
        mismatches.push(`expiry viz vs mrz mismatch`);
      }
      out.push({
        id: "mrz_viz_match",
        result: mismatches.length === 0 ? "pass" : "fail",
        evidence:
          mismatches.length === 0
            ? `viz agrees with mrz (${redactRef("passport_number", parsed.passportNumber)})`
            : mismatches.join("; "),
      });
    }
  }

  // --- Expiry vs run date ---
  if (m.kind === "au_passport" && m.mrz_lines !== null) {
    const expiryIso = mrzDateToIso(m.mrz_lines[1].slice(21, 27));
    out.push({
      id: "expiry_vs_today",
      result: expiryIso >= m.today ? "pass" : "fail",
      evidence: `expiry ${expiryIso} vs today ${m.today}`,
    });
  } else if (m.dl !== null) {
    out.push({
      id: "expiry_vs_today",
      result: m.dl.expiry_date >= m.today ? "pass" : "fail",
      evidence: `expiry ${m.dl.expiry_date} vs today ${m.today}`,
    });
  } else {
    na("expiry_vs_today", "no document");
  }

  // --- Driver-licence back checks (pass n/a for passports) ---
  if (m.dl === null) {
    na("card_number_present", "passport has no card number");
    na("address_sticker_match", "passport has no sticker");
  } else {
    const present = m.dl.card_number.length > 0;
    out.push({
      id: "card_number_present",
      result: present ? "pass" : "fail",
      evidence: present
        ? `card_number ${redactRef("card_number", m.dl.card_number)} present`
        : "card_number missing (back capture required)",
    });
    const sticker = m.dl.address_sticker;
    if (!sticker.present) {
      out.push({
        id: "address_sticker_match",
        result: "pass",
        evidence: "no address sticker present",
      });
    } else {
      const match = sticker.parsed_address === m.dl.address;
      out.push({
        id: "address_sticker_match",
        result: match ? "pass" : "fail",
        evidence: match
          ? "front address matches sticker address"
          : `front "${m.dl.address}" vs sticker "${sticker.parsed_address}" mismatch`,
      });
    }
  }

  // --- Capture / portrait / challenge checks (shared) ---
  out.push({
    id: "image_quality",
    result: m.image_quality_inconclusive ? "inconclusive" : "pass",
    evidence: m.image_quality_inconclusive
      ? "telemetry needs re-capture (re-ask); never approves"
      : "focus/glare/occlusion within demo bounds",
  });
  out.push({
    id: "portrait_region_present",
    result: m.portrait_present ? "pass" : "fail",
    evidence: m.portrait_present
      ? "portrait region present"
      : "portrait region missing",
  });
  out.push({
    id: "portrait_splice_artifact",
    result: m.splice_found ? "fail" : "pass",
    evidence: m.splice_found
      ? "portrait splice discontinuity found"
      : "no splice discontinuity found (absence is not authenticity)",
  });
  out.push({
    id: "face_match",
    result: m.face.band === "low" ? "fail" : "pass",
    evidence: `similarity ${m.face.similarity} band ${m.face.band} certified:false`,
    value: m.face.similarity,
    band: m.face.band,
    certified: false,
  });
  out.push({
    id: "challenge_compliance",
    result: m.challenge_completed ? "pass" : "fail",
    evidence: m.challenge_completed
      ? "challenge movement completed"
      : "challenge movement not completed",
  });

  return out;
}

/** Conjunction decision: any fail → rejected; else any inconclusive → not_verified; else verified. */
export function decide(r: CheckResult[]): Decision {
  if (r.some((c) => c.result === "fail")) return "rejected";
  if (r.some((c) => c.result === "inconclusive")) return "not_verified";
  return "verified";
}
