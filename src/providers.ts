// Provider chains (AU voice-IDV demo slice, spec §4 demo floor).
// Narration: META_API_KEY → OPENROUTER_API_KEY → local templates.
// Segmentation: META → REPLICATE → fixture geometry.
// Template-first: local templates resolve synchronously (demo ≤1.5s floor);
// a late model Turn is discarded, not spliced. Narration never decides —
// Decisions come from the check engine over fixtures, so --no-meta runs
// decide identically (parity). With no keys everything runs offline.
// Avoid: not liveness, not forgery proof, not certified matching —
// narration describes prompts; only checks decide.

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

const META_BASE = "https://api.meta.ai/v1";
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

async function postJson(
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

function responseText(payload: unknown): string | null {
  const data = payload as {
    output_text?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }
  const choice = data.choices?.[0]?.message?.content;
  if (typeof choice === "string" && choice.trim()) return choice.trim();
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
    try {
      const payload = await postJson(
        fetcher,
        `${META_BASE}/responses`,
        { authorization: `Bearer ${env.META_API_KEY}` },
        {
          model: env.META_TEXT_MODEL ?? "muse-spark-1.3",
          input:
            `You are the voice of an identity verification flow. Reply with one ` +
            `spoken sentence, at most 30 words, no markdown. ` +
            `Turn: ${request.turn}. Fact to convey: ${request.text}. ` +
            `Prior turns: ${history.slice(-3).join(" | ") || "none"}`,
        },
      );
      const text = responseText(payload);
      if (!text) throw new Error("meta returned no text");
      return { text, provider: "meta", skipped };
    } catch (error) {
      skipped.push(`meta: ${(error as Error).message}`);
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
          model: env.OPENROUTER_TEXT_MODEL ?? "meta/muse-spark-1.3",
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
  void request;

  if (env.META_API_KEY) {
    skipped.push("meta: no image supplied (fixture geometry used)");
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
