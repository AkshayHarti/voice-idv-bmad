// NSW driver licence parse helpers (AU voice-IDV demo slice).
// 100% synthetic data. Never log full licence/card numbers (see spec §6
// minimisation). DVS is the source of truth for number formats; the table
// below is versioned demo config only.

export interface DLFrontFields {
  licence_number: string;
  full_name: string;
  dob: string;
  address: string;
  expiry_date: string;
}

export interface DLAddressSticker {
  present: boolean;
  parsed_address: string;
}

export interface DLBackFields {
  card_number: string;
  address_sticker: DLAddressSticker;
}

export interface DLFields extends DLFrontFields {
  state: "NSW";
  card_number: string;
  address_sticker: DLAddressSticker;
}

/** Per-state card-number location (config; validated in pilot). */
export const STATE_TABLE: { NSW: { card_location: "back" } } = {
  NSW: { card_location: "back" },
};

/**
 * Licence-number formats, versioned config (not hardcoded claims).
 * DVS is the source of truth; patterns here drive the demo only.
 */
export const LICENCE_FORMATS = {
  version: 1,
  source: "DVS",
  patterns: {
    NSW: /^\d{8}$/,
  } as const,
};

/** Validate a licence number for a state via the versioned format table. */
export function validateLicenceNumber(state: "NSW", licenceNumber: string): boolean {
  return LICENCE_FORMATS.patterns[state].test(licenceNumber);
}

/**
 * Parse NSW DL front/back OCR fields into DLFields (no validation).
 * Back capture is mandatory in NSW (`STATE_TABLE.NSW.card_location` is
 * "back"); a null back yields an empty `card_number` so the check engine
 * (Task 3) fails `card_number_present`.
 */
export function parseNSWDL(
  front: DLFrontFields,
  back: DLBackFields | null,
): DLFields {
  return {
    licence_number: front.licence_number,
    full_name: front.full_name,
    dob: front.dob,
    address: front.address,
    expiry_date: front.expiry_date,
    state: "NSW",
    card_number: back?.card_number ?? "",
    address_sticker: back?.address_sticker ?? {
      present: false,
      parsed_address: "",
    },
  };
}
