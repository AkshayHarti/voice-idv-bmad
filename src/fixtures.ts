// Passport fixtures (100% synthetic). Append-only: Task 2+ extend this
// file — keep the passport fixtures below intact.
import { authorTD3, checkDigit, verifyCheckDigits } from "./mrz.js";
import type { DLBackFields, DLFrontFields } from "./au_dl.js";

export interface PassportFixture {
  id: string;
  kind: "au_passport";
  mrz_lines: [string, string];
  /** Check ids this fixture is expected to fail (named for the demo). */
  expected_failures: string[];
}

export interface DLFixture {
  id: string;
  kind: "au_dl";
  state: "NSW";
  front: DLFrontFields;
  /** Null when the back was never captured (NSW requires back). */
  back: DLBackFields | null;
  /** Check ids this fixture is expected to fail (named for the demo). */
  expected_failures: string[];
}

export type Fixture = PassportFixture | DLFixture;

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

// --- NSW DL fixtures (100% synthetic, appended Task 2; passport above intact) ---

const NSW_CLEAN_ADDRESS = "7 QUAY ST SYDNEY NSW 2000";

const NSW_CLEAN_FRONT: DLFrontFields = {
  licence_number: "12345678",
  full_name: "ALEX JORDAN CITIZEN",
  dob: "1990-01-01",
  address: NSW_CLEAN_ADDRESS,
  expiry_date: "2030-01-01",
};

const NSW_CLEAN_BACK: DLBackFields = {
  card_number: "654321",
  address_sticker: { present: true, parsed_address: NSW_CLEAN_ADDRESS },
};

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
  "nsw-dl-clean": {
    id: "nsw-dl-clean",
    kind: "au_dl",
    state: "NSW",
    front: NSW_CLEAN_FRONT,
    back: NSW_CLEAN_BACK,
    expected_failures: [],
  },
  "nsw-dl-missing-back": {
    id: "nsw-dl-missing-back",
    kind: "au_dl",
    state: "NSW",
    front: NSW_CLEAN_FRONT,
    back: null,
    expected_failures: ["card_number_present"],
  },
};

export function loadFixture(id: string): Fixture {
  const fx = FIXTURES[id];
  if (!fx) throw new Error(`fixture not found: ${id}`);
  return fx;
}

/**
 * Failing check ids for a fixture id (empty = all pass). Passport
 * fixtures compute check digits vs printed; DL fixtures return the
 * fixture.json ground truth (Task 3 owns the DL check engine).
 */
export function expectedFailures(id: string): string[] {
  const fx = loadFixture(id);
  if (fx.kind === "au_dl") return [...fx.expected_failures];
  return verifyCheckDigits(fx.mrz_lines[0], fx.mrz_lines[1]);
}
