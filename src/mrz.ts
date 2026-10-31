// TD3 MRZ author/parse helpers (ICAO 9303, AU passport demo slice).
// 100% synthetic data. Never log full MRZ lines (see spec §6 minimisation).

export interface TD3Fields {
  surname: string;
  givenNames: string;
  /** Document number as printed, `<`-padded to 9 chars. */
  passportNumber: string;
  /** Issuing state / nationality, 3 chars (default "AUS"). */
  nationality: string;
  /** Date of birth as YYMMDD. */
  dob: string;
  /** Sex: "M" | "F" | "<". */
  sex: string;
  /** Expiry date as YYMMDD. */
  expiry: string;
  /** Optional data field, `<`-padded to 14 chars (default all fillers). */
  personalNumber: string;
}

const WEIGHTS = [7, 3, 1];

function charValue(ch: string): number {
  if (ch === "<") return 0;
  const code = ch.charCodeAt(0);
  if (code >= 48 && code <= 57) return code - 48; // 0-9
  if (code >= 65 && code <= 90) return code - 55; // A-Z -> 10-35
  throw new Error(`mrz: invalid character ${JSON.stringify(ch)}`);
}

/** ICAO 9303 check digit: weights 7-3-1, 0-9=0-9, A-Z=10-35, `<`=0. */
export function checkDigit(s: string): string {
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    sum += charValue(s[i]) * WEIGHTS[i % 3];
  }
  return String(sum % 10);
}

function padRight(s: string, len: number): string {
  return (s + "<".repeat(len)).slice(0, len);
}

/** Author TD3 line pair (each 44 chars) from fields. Check digits computed. */
export function authorTD3(f: TD3Fields): { line1: string; line2: string } {
  const nationality = (f.nationality || "AUS").slice(0, 3);
  const name = padRight(
    `${f.surname}<<${f.givenNames.replace(/ /g, "<")}`,
    39,
  );
  const line1 = `P<${nationality}${name}`;

  const doc = padRight(f.passportNumber, 9);
  const cdDoc = checkDigit(doc);
  const dobCd = checkDigit(f.dob);
  const expCd = checkDigit(f.expiry);
  const personal = padRight(f.personalNumber || "", 14);
  const cdPersonal = checkDigit(personal);
  const composite = checkDigit(
    doc + cdDoc + f.dob + dobCd + f.expiry + expCd + personal + cdPersonal,
  );
  const line2 =
    `${doc}${cdDoc}${nationality}${f.dob}${dobCd}` +
    `${f.sex}${f.expiry}${expCd}${personal}${cdPersonal}${composite}`;

  return { line1, line2 };
}

/** Parse a TD3 line pair back into fields (no validation). */
export function parseTD3(l1: string, l2: string): TD3Fields {
  const nameField = l1.slice(5, 44).replace(/<+$/, "");
  const [surname = "", ...givenParts] = nameField.split("<<");
  return {
    surname,
    givenNames: givenParts.join(" ").replace(/</g, " "),
    passportNumber: l2.slice(0, 9),
    nationality: l2.slice(10, 13),
    dob: l2.slice(13, 19),
    sex: l2.slice(20, 21),
    expiry: l2.slice(21, 27),
    personalNumber: l2.slice(28, 42),
  };
}

/**
 * Verify printed vs computed check digits.
 * Returns failing check ids (empty = all pass).
 */
export function verifyCheckDigits(l1: string, l2: string): string[] {
  void l1;
  const failures: string[] = [];
  const doc = l2.slice(0, 9);
  const dob = l2.slice(13, 19);
  const expiry = l2.slice(21, 27);
  const personal = l2.slice(28, 42);
  if (checkDigit(doc) !== l2.slice(9, 10)) failures.push("check_digit_docnum");
  if (checkDigit(dob) !== l2.slice(19, 20)) failures.push("check_digit_dob");
  if (checkDigit(expiry) !== l2.slice(27, 28))
    failures.push("check_digit_expiry");
  if (
    checkDigit(
      doc +
        l2.slice(9, 10) +
        dob +
        l2.slice(19, 20) +
        expiry +
        l2.slice(27, 28) +
        personal +
        l2.slice(42, 43),
    ) !== l2.slice(43, 44)
  ) {
    failures.push("check_digit_composite");
  }
  return failures;
}
