// PII redaction (AU voice-IDV demo slice, spec §6 minimisation).
// Logs carry redacted refs only — never full numbers, MRZ lines, or audio.

/** Redact a reference to its last two chars, e.g. "12345642" → "••••42". */
export function redactRef(kind: string, value: string): string {
  void kind;
  return `••••${value.slice(-2)}`;
}
