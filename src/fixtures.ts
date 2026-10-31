// Passport fixtures (100% synthetic). Append-only: Task 2+ extend this
// file — keep the passport fixtures below intact.
import { authorTD3, checkDigit, verifyCheckDigits } from "./mrz.js";

export interface Fixture {
  id: string;
  kind: "au_passport";
  mrz_lines: [string, string];
  /** Check ids this fixture is expected to fail (named for the demo). */
  expected_failures: string[];
}

const CLEAN_BASE = {
  surname: "CITIZEN",
  givenNames: "ALEX JORDAN",
  passportNumber: "N1234567",
  nationality: "AUS",
  dob: "900101",
  sex: "M",
  expiry: "300101",
  personalNumber: "",
};

function buildClean(): [string, string] {
  const { line1, line2 } = authorTD3({ ...CLEAN_BASE });
  return [line1, line2];
}

function buildTamperedDigit(cleanLine2: string): string {
  // Flip one document-number digit; keep the printed doc check digit so
  // computed-vs-printed mismatches exactly on check_digit_docnum.
  // The composite digit is recomputed over the flipped content so the
  // fixture isolates the single named failure for the demo.
  const doc = cleanLine2.slice(0, 9);
  const idx = [...doc].findIndex((c) => c >= "0" && c <= "9");
  const flipped =
    doc.slice(0, idx) +
    String((Number(doc[idx]) + 1) % 10) +
    doc.slice(idx + 1);
  const rest = cleanLine2.slice(9);
  const dob = cleanLine2.slice(13, 19);
  const expiry = cleanLine2.slice(21, 27);
  const personal = cleanLine2.slice(28, 42);
  const composite = checkDigit(
    flipped +
      rest.slice(0, 1) +
      dob +
      rest.slice(10, 11) +
      expiry +
      rest.slice(18, 19) +
      personal +
      rest.slice(33, 34),
  );
  return flipped + rest.slice(0, 34) + composite;
}

const [cleanL1, cleanL2] = buildClean();

const FIXTURES: Record<string, Fixture> = {
  "aus-passport-clean": {
    id: "aus-passport-clean",
    kind: "au_passport",
    mrz_lines: [cleanL1, cleanL2],
    expected_failures: [],
  },
  "aus-passport-tampered-digit": {
    id: "aus-passport-tampered-digit",
    kind: "au_passport",
    mrz_lines: [cleanL1, buildTamperedDigit(cleanL2)],
    expected_failures: ["check_digit_docnum"],
  },
};

export function loadFixture(id: string): Fixture {
  const fx = FIXTURES[id];
  if (!fx) throw new Error(`fixture not found: ${id}`);
  return fx;
}

/** Computed-vs-printed check-digit failures for a fixture id. */
export function expectedFailures(id: string): string[] {
  const fx = loadFixture(id);
  return verifyCheckDigits(fx.mrz_lines[0], fx.mrz_lines[1]);
}
