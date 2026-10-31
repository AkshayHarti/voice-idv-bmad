// DVS gateway stub (AU voice-IDV demo slice, spec §§3/5/6).
// Same JSON shape as prod: `verify(payload) →
// {match, fields_matched, fields_mismatched}`. The stub resolves
// deterministically from fixture ground truth (expected failures);
// prod swaps the transport only, keeping this shape.
// Minimisation: logs carry match booleans only — never full numbers,
// MRZ lines, or audio refs. This module logs nothing at all.
import { expectedFailures, loadFixture } from "./fixtures.js";

export interface DVSRequest {
  /** Fixture id the stub resolves against (demo only; prod sends fields). */
  fixture: string;
}

export interface DVSResult {
  match: boolean;
  fields_matched: string[];
  fields_mismatched: string[];
}

/** DVS-required field sets per document kind (spec §3). */
const FIELDS_BY_KIND: Record<string, string[]> = {
  au_passport: ["name", "dob", "passport_number", "expiry", "sex"],
  au_dl: ["name", "dob", "licence_number", "card_number", "expiry", "state"],
};

/**
 * Stub verify: clean fixtures match on every DVS field; fixtures with
 * expected failures mismatch (fail closed). Unknown fixture ids mismatch
 * rather than throw, so the fraud tier hard-flags instead of crashing.
 */
export function verifyDVS(p: DVSRequest): DVSResult {
  let kind = "au_passport";
  let failures: string[] = [];
  try {
    const fx = loadFixture(p.fixture);
    kind = fx.kind;
    failures = expectedFailures(p.fixture);
  } catch {
    return { match: false, fields_matched: [], fields_mismatched: ["fixture_unknown"] };
  }
  // Screenshot/screen-replay captures are never DVS-verifiable.
  if (/screenshot|screen|replay|print|photocopy/i.test(p.fixture)) {
    return {
      match: false,
      fields_matched: [],
      fields_mismatched: [...(FIELDS_BY_KIND[kind] ?? ["document"])],
    };
  }
  const fields = FIELDS_BY_KIND[kind] ?? ["document"];
  if (failures.length === 0) {
    return { match: true, fields_matched: [...fields], fields_mismatched: [] };
  }
  return { match: false, fields_matched: [], fields_mismatched: [...failures] };
}
