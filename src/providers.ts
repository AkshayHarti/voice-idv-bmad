// Provider chains (AU voice-IDV demo slice, spec §4 demo floor).
// Narration: META_API_KEY → OPENROUTER_API_KEY → local templates.
// Segmentation: META → REPLICATE → fixture geometry.
// Template-first: local templates resolve synchronously (demo ≤1.5s floor);
// a late model Turn is discarded, not spliced. Narration never decides —
// Decisions come from the check engine over fixtures, so --no-meta runs
// decide identically (parity). With no keys everything runs offline.
// Model IDs/prices come from ./meta-models.js (pinned, Task 0). Live calls
// run at ≤8000ms (Task 0 binding prescription); inline narration allows
// the full 8s when keyed — measured 2.3–7.7s live (2026-11-03), so the
// old ≤1000ms abort never let Meta serve. The 1.5s floor holds on the
// unkeyed/local path; keyed turns trade latency for live polish.
// Avoid: not liveness, not forgery proof, not certified matching —
// narration describes prompts; only checks decide.
import { META_MODELS, PRICING, logSpend } from "./meta-models.js";

export type ProviderName = "meta" | "openrouter" | "replicate" | "local";

export interface ProviderConfig {
  meta: boolean;
  openrouter: boolean;
  replicate: boolean;
  local: true;
}

export interface NarrateRequest {
  /** Closed Turn kind (consent, instruct, re-ask, replay, progress, warn, result, abort_confirm). */
  turn: string;
  /** Complete sentence from the flow machine; templates repeat it verbatim. */
  text: string;
  history?: string[];
}

export type Fetcher = typeof fetch;

interface ChainDeps {
  fetcher?: Fetcher;
  env?: Record<string, string | undefined>;
}

export const META_BASE = "https://api.meta.ai/v1";
/** Transcribe runs its own ASR endpoints, not /responses. */
export const META_ASR_BASE = "https://api.meta.ai/v1/asr";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const REPLICATE_BASE = "https://api.replicate.com/v1";

/** Spoken text is generated locally; this is the always-available narrator. */
export function templateNarration(turn: string, text: string): string {
  void turn;
  return text;
}

export function configuredProviders(
  env: Record<string, string | undefined> = {},
): ProviderConfig {
  return {
    meta: Boolean(env.META_API_KEY),
    openrouter: Boolean(env.OPENROUTER_API_KEY),
    replicate: Boolean(env.REPLICATE_API_TOKEN),
    local: true,
  };
}

export async function postJson(
  fetcher: Fetcher,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs = 1000,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${url} responded ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Multipart POST twin of postJson (the ASR file endpoint takes
 * multipart, not JSON). Same timeout/abort contract. Never parses
 * failures — throws, and the chain records skipped[].
 */
export async function postForm(
  fetcher: Fetcher,
  url: string,
  headers: Record<string, string>,
  form: FormData,
  timeoutMs = 8000,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      method: "POST",
      headers,
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${url} responded ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export function responseText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as {
    output_text?: string;
    choices?: Array<{ message?: { content?: string } }>;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }
  const choice = data.choices?.[0]?.message?.content;
  if (typeof choice === "string" && choice.trim()) return choice.trim();
  // Live Responses shape: output[].message.content[] text parts (reasoning
  // parts carry no text and are skipped by the type check).
  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item?.type !== "message" || !Array.isArray(item.content)) continue;
      for (const part of item.content) {
        if (part?.type === "output_text" && typeof part.text === "string" && part.text.trim()) {
          return part.text.trim();
        }
      }
    }
  }
  return null;
}

/** Walk the narration chain, recording why each link was skipped. Never throws. */
export async function narrate(
  request: NarrateRequest,
  deps: ChainDeps = {},
): Promise<{ text: string; provider: ProviderName; skipped: string[] }> {
  const env = deps.env ?? {};
  const fetcher = deps.fetcher ?? fetch;
  const history = request.history ?? [];
  const skipped: string[] = [];

  if (env.META_API_KEY) {
    const metaStart = Date.now();
    try {
      // Minimal reasoning effort + 8s budget: measured 2.3–7.7s live
      // (high effort is slower and the old 1s abort never let Meta serve).
      const payload = await postJson(
        fetcher,
        `${META_BASE}/responses`,
        { authorization: `Bearer ${env.META_API_KEY}` },
        {
          model: env.META_TEXT_MODEL ?? META_MODELS.spark,
          reasoning: { effort: "minimal" },
          input:
            `You are the voice of an identity verification flow. Reply with one ` +
            `spoken sentence, at most 30 words, no markdown. ` +
            `Turn: ${request.turn}. Fact to convey: ${request.text}. ` +
            `Prior turns: ${history.slice(-3).join(" | ") || "none"}`,
        },
        8000,
      );
      const text = responseText(payload);
      if (!text) throw new Error("meta returned no text");
      logSpend(META_MODELS.spark, 1, PRICING[META_MODELS.spark].perCall);
      return { text, provider: "meta", skipped };
    } catch (error) {
      const ms = Date.now() - metaStart;
      const err = error as Error;
      const cause =
        err?.name === "AbortError" ? `timed out after ${ms}ms` : `${err?.message ?? err} (${ms}ms)`;
      skipped.push(`meta: ${cause}`);
    }
  } else {
    skipped.push("meta: not configured");
  }

  if (env.OPENROUTER_API_KEY) {
    try {
      const payload = await postJson(
        fetcher,
        `${OPENROUTER_BASE}/chat/completions`,
        { authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
        {
          model: env.OPENROUTER_TEXT_MODEL ?? `meta/${META_MODELS.spark}`,
          max_tokens: 80,
          messages: [
            {
              role: "system",
              content: "Reply with one spoken sentence, at most 30 words, no markdown.",
            },
            { role: "user", content: `Turn: ${request.turn}. Fact: ${request.text}.` },
          ],
        },
      );
      const text = responseText(payload);
      if (!text) throw new Error("openrouter returned no text");
      return { text, provider: "openrouter", skipped };
    } catch (error) {
      skipped.push(`openrouter: ${(error as Error).message}`);
    }
  } else {
    skipped.push("openrouter: not configured");
  }

  return {
    text: templateNarration(request.turn, request.text),
    provider: "local",
    skipped,
  };
}

export interface SegmentRequest {
  /** What to find (e.g. "document quad", "card number region"). */
  label: string;
  /** Base64 capture crop; absent in the offline demo (fixture geometry used). */
  imageBase64?: string;
}

export interface Region {
  label: string;
  /** Normalised quad [x1,y1,x2,y2] in 0–1000 space. */
  quad: [number, number, number, number];
}

/**
 * Pull `Region[]` out of a SAM payload. Accepts `{regions:[...]}` and the
 * Replicate-style `{output:{regions:[...]}}`; entries need a 4-number quad
 * (missing labels default to the request label). Shape is provisional —
 * confirm against the live API in Task 4. Never throws.
 */
function samRegions(payload: unknown, label: string): Region[] {
  const data = payload as { regions?: unknown; output?: { regions?: unknown } };
  const raw = Array.isArray(data.regions)
    ? data.regions
    : Array.isArray(data.output?.regions)
      ? data.output.regions
      : [];
  const regions: Region[] = [];
  for (const entry of raw as Array<{ label?: unknown; quad?: unknown }>) {
    const quad = Array.isArray(entry.quad) ? entry.quad.map(Number) : [];
    if (quad.length !== 4 || quad.some((n) => !Number.isFinite(n))) continue;
    regions.push({
      label: typeof entry.label === "string" && entry.label ? entry.label : label,
      quad: quad as [number, number, number, number],
    });
  }
  return regions;
}

/**
 * Segmentation chain. `local` returns known fixture geometry, which is
 * exact for authored fixtures; model segmentation is only needed where
 * the geometry is genuinely unknown.
 */
export async function segment(
  request: SegmentRequest,
  knownRegions: Region[],
  deps: ChainDeps = {},
): Promise<{ provider: ProviderName; regions: Region[]; skipped: string[] }> {
  const env = deps.env ?? {};
  const fetcher = deps.fetcher ?? fetch;
  const skipped: string[] = [];

  if (env.META_API_KEY) {
    if (!request.imageBase64) {
      skipped.push("meta: no image supplied (fixture geometry used)");
    } else {
      try {
        const payload = await postJson(
          fetcher,
          `${META_BASE}/responses`,
          { authorization: `Bearer ${env.META_API_KEY}` },
          {
            model: META_MODELS.sam,
            input:
              `Segment the ${request.label} in this capture. ` +
              `Reply with region quads in 0–1000 space.`,
            image_base64: request.imageBase64,
          },
          8000,
        );
        const regions = samRegions(payload, request.label);
        if (!regions.length) throw new Error("meta returned no regions");
        logSpend(META_MODELS.sam, 1, PRICING[META_MODELS.sam].perCall);
        return { provider: "meta", regions, skipped };
      } catch (error) {
        skipped.push(`meta: ${(error as Error).message}`);
      }
    }
  } else {
    skipped.push("meta: not configured");
  }

  if (env.REPLICATE_API_TOKEN) {
    try {
      const payload = (await postJson(
        fetcher,
        `${REPLICATE_BASE}/predictions`,
        { authorization: `Bearer ${env.REPLICATE_API_TOKEN}`, prefer: "wait" },
        { input: { prompt: request.label } },
        2000,
      )) as { output?: { regions?: Region[] } };
      if (payload.output?.regions?.length) {
        return { provider: "replicate", regions: payload.output.regions, skipped };
      }
      skipped.push("replicate: returned no regions");
    } catch (error) {
      skipped.push(`replicate: ${(error as Error).message}`);
    }
  } else {
    skipped.push("replicate: not configured");
  }

  return { provider: "local", regions: knownRegions, skipped };
}

export interface OcrRequest {
  /** Which side was locked (front carries identity, back the card number). */
  side: "front" | "back";
  /** Base64 locked doc crop; absent on the stand-in path (no OCR attempted). */
  imageBase64?: string;
}

export interface OcrFields {
  side: "front" | "back";
  licence_number?: string;
  full_name?: string;
  dob?: string;
  address?: string;
  expiry_date?: string;
  card_number?: string;
}

const OCR_KEYS = [
  "licence_number",
  "full_name",
  "dob",
  "address",
  "expiry_date",
  "card_number",
] as const;

/**
 * Pull DL fields out of a vision-model reply. Accepts a JSON object with
 * any of the known keys (surrounding prose tolerated); unknown keys are
 * dropped and values are trimmed + capped. Null when no known key reads.
 * Never throws.
 */
function ocrFieldsFromText(text: string, side: "front" | "back"): OcrFields | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const fields: OcrFields = { side };
  let found = 0;
  for (const key of OCR_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      fields[key] = value.trim().slice(0, 200);
      found += 1;
    }
  }
  return found > 0 ? fields : null;
}

/**
 * Server OCR on a locked doc crop (display-only — never fed to checks).
 * Meta-first via Wonder (the only text-from-image candidate, provisional);
 * the segment pattern: image_base64 + 8s budget, spend logged after
 * success only, skipped[] on failure, never throws. No offshore fallback.
 */
export async function ocrCrop(
  request: OcrRequest,
  deps: ChainDeps = {},
): Promise<{ provider: ProviderName; fields: OcrFields | null; skipped: string[] }> {
  const env = deps.env ?? {};
  const fetcher = deps.fetcher ?? fetch;
  const skipped: string[] = [];

  if (!env.META_API_KEY) {
    skipped.push("meta: not configured");
    return { provider: "local", fields: null, skipped };
  }
  if (!request.imageBase64) {
    skipped.push("meta: no image supplied (no OCR attempted)");
    return { provider: "local", fields: null, skipped };
  }

  try {
    const payload = await postJson(
      fetcher,
      `${META_BASE}/responses`,
      { authorization: `Bearer ${env.META_API_KEY}` },
      {
        model: META_MODELS.wonder,
        input:
          `Read this Australian driver licence ${request.side}. ` +
          `Reply with JSON only, keys licence_number, full_name, dob, ` +
          `address, expiry_date (front) and card_number (back).`,
        image_base64: request.imageBase64,
      },
      8000,
    );
    const text = responseText(payload);
    const fields = text ? ocrFieldsFromText(text, request.side) : null;
    if (!fields) throw new Error("meta returned no fields");
    logSpend(META_MODELS.wonder, 1, PRICING[META_MODELS.wonder].perCall);
    return { provider: "meta", fields, skipped };
  } catch (error) {
    skipped.push(`meta: ${(error as Error).message}`);
    return { provider: "local", fields: null, skipped };
  }
}

export interface TranscribeRequest {
  /** WAV bytes (16 kHz mono 16-bit PCM) as base64; absent → local null. */
  audioBase64?: string;
  /** Optional correlation id (the run id); the server mints when absent. */
  sessionId?: string;
}

/**
 * Pull the transcript out of an ASR reply (`{transcript}`). Empty or
 * missing transcripts read as null (silence / no speech) — the caller
 * falls back to on-device recognition. Never throws.
 */
function transcriptText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const text = (payload as { transcript?: unknown }).transcript;
  return typeof text === "string" && text.trim() ? text.trim() : null;
}

/**
 * Speech-to-text via Muse Voice Transcribe (primary ASR, spec §5).
 * Multipart file upload (PUSH_TO_TALK — the client delimits the turn),
 * 8s budget, spend logged after success only, skipped[] on failure,
 * never throws. Audio bytes are transcribed in-memory and dropped —
 * nothing is stored or logged. Shape verified live 2026-11-04.
 */
export async function transcribeAudio(
  request: TranscribeRequest,
  deps: ChainDeps = {},
): Promise<{ provider: ProviderName; text: string | null; skipped: string[] }> {
  const env = deps.env ?? {};
  const fetcher = deps.fetcher ?? fetch;
  const skipped: string[] = [];

  if (!env.META_API_KEY) {
    skipped.push("meta: not configured");
    return { provider: "local", text: null, skipped };
  }
  if (!request.audioBase64) {
    skipped.push("meta: no audio supplied (no transcription attempted)");
    return { provider: "local", text: null, skipped };
  }

  try {
    const form = new FormData();
    form.append(
      "request",
      new Blob(
        [
          JSON.stringify({
            mode: "PUSH_TO_TALK",
            model: META_MODELS.transcribe,
            audioEncoding: "WAV",
          }),
        ],
        { type: "application/json" },
      ),
    );
    // atob, not Buffer: this module stays @types/node-free (Workers-safe).
    const bin = atob(request.audioBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    form.append("audio", new Blob([bytes], { type: "audio/wav" }), "utterance.wav");
    const query = request.sessionId ? `?sessionId=${encodeURIComponent(request.sessionId)}` : "";
    const payload = await postForm(
      fetcher,
      `${META_ASR_BASE}/transcribe${query}`,
      { authorization: `Bearer ${env.META_API_KEY}` },
      form,
      8000,
    );
    const text = transcriptText(payload);
    if (!text) throw new Error("meta returned no transcript");
    logSpend(META_MODELS.transcribe, 1, PRICING[META_MODELS.transcribe].perCall);
    return { provider: "meta", text, skipped };
  } catch (error) {
    skipped.push(`meta: ${(error as Error).message}`);
    return { provider: "local", text: null, skipped };
  }
}
