// Realtime speech-in relay: browser mic PCM ⇄ Meta Transcribe realtime WS.
// Pure mechanics over injected sockets — the Meta handshake, frame
// pumping, and turn→utterance→step fan-out. No direct imports of app
// state or the `ws` package (the default Meta dialer loads it lazily),
// so this module stays unit-testable and out of the Workers graph.
import type { WebSocket as WsSocket } from "ws";

export const META_REALTIME_URL = "wss://api.meta.ai/v1/asr/realtime";
export const ASR_RELAY_RATE = 24000;
/** Binary frames held while Meta connects (~4 s at 80 ms pacing). */
const PENDING_CAP = 50;

export interface RelaySocket {
  send(data: string | Uint8Array): void;
  close(code?: number, reason?: string): void;
  on(event: "open" | "message" | "error" | "close", cb: (...args: never[]) => void): void;
}

export interface RelayContext {
  sessionId: string;
  metaKey: string;
  metaUrl?: string;
  /** Turn text in, served step out (the same shape as POST /say). */
  utterance: (text: string) => Promise<unknown>;
  /**
   * Commands-mode gate: when the browser selects {type:"mode",
   * mode:"commands"}, turns failing this test are swallowed (no step, no
   * transcript line) so background chatter never disturbs capture.
   */
  filter?: (text: string) => boolean;
  /**
   * Override the Meta dialer in tests; default dynamically imports `ws`
   * (kept out of the static graph for the Workers bundle).
   */
  openMeta?: (url: string) => RelaySocket | Promise<RelaySocket>;
  /** Quiet millis before the relay reaps itself (0 disables). */
  idleMs?: number;
  /** Override the clock in tests. */
  now?: () => number;
}

function isOpen(sock: { readyState?: number }): boolean {
  // ws.OPEN === 1 on both `ws` and the platform socket.
  return sock.readyState === undefined || sock.readyState === 1;
}

/**
 * Bridge one browser socket to one Meta realtime session. Frames flow
 * browser→Meta (binary PCM) and turns flow Meta→browser as JSON:
 * {kind:"partial"} captions, {kind:"speechStart"|"speechEnd"} barge-in
 * cues, and {kind:"step", step} served turns. speechComplete is the
 * only turn trigger — final transcripts are display-only, so a turn is
 * never answered twice. Never throws out; failures arrive as
 * {kind:"error"} frames or clean closes.
 */
export function attachRelay(browser: RelaySocket, ctx: RelayContext): void {
  const now = ctx.now ?? Date.now;
  const idleMs = ctx.idleMs ?? 90000;
  const metaUrl = `${ctx.metaUrl ?? META_REALTIME_URL}?sessionId=${encodeURIComponent(
    `idv-${ctx.sessionId}-${now()}`,
  )}`;
  let meta: RelaySocket | null = null;
  let metaOpen = false;
  let commandsOnly = false;
  const pending: Uint8Array[] = [];
  let lastBeat = now();
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const sendBrowser = (frame: Record<string, unknown>): void => {
    if (closed || !isOpen(browser as { readyState?: number })) return;
    try {
      browser.send(JSON.stringify(frame));
    } catch {
      /* a dying browser socket ends the relay below */
    }
  };
  const shutdown = (code = 1000, reason = "done"): void => {
    if (closed) return;
    closed = true;
    if (idleTimer) clearTimeout(idleTimer);
    try {
      meta?.close(code, reason);
    } catch {
      /* already gone */
    }
    try {
      (browser as WsSocket).close(code, reason);
    } catch {
      /* already gone */
    }
  };
  const beat = (): void => {
    lastBeat = now();
  };
  const dialFailed = (error: unknown): void => {
    sendBrowser({
      kind: "error",
      message: `realtime unavailable: ${(error as Error)?.message ?? error}`,
    });
    shutdown(1011, "meta dial failed");
  };

  // Browser side registers immediately: early audio buffers instead of
  // dropping while Meta connects (~1 s handshake).
  browser.on("message", (raw: unknown) => {
    beat();
    try {
      if (typeof raw === "string") {
        const msg = JSON.parse(raw) as { type?: unknown; mode?: unknown };
        if (msg.type === "endStream" && meta && metaOpen) {
          meta.send(JSON.stringify({ type: "endStream" }));
        }
        if (msg.type === "mode") {
          commandsOnly = msg.mode === "commands";
        }
        return;
      }
      const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBuffer);
      if (bytes.length === 0) return;
      if (meta && metaOpen && isOpen(meta as { readyState?: number })) {
        meta.send(bytes);
      } else if (pending.length < PENDING_CAP) {
        pending.push(bytes);
      }
    } catch {
      /* malformed client frame: ignored, relay survives */
    }
  });
  const browserGone = (): void => shutdown(1000, "browser closed");
  browser.on("error", browserGone);
  browser.on("close", browserGone);

  if (idleMs > 0) {
    const arm = (): void => {
      // Unref'd: a quiet relay never holds the process open by itself.
      const timer = setTimeout(watch, Math.min(idleMs, 15000)) as unknown as {
        unref?: () => void;
      };
      timer.unref?.();
      idleTimer = timer as unknown as ReturnType<typeof setTimeout>;
    };
    const watch = (): void => {
      if (closed) return;
      if (now() - lastBeat >= idleMs) {
        sendBrowser({ kind: "error", message: "realtime idle timeout" });
        shutdown(1000, "idle");
        return;
      }
      arm();
    };
    arm();
  }

  const openMeta =
    ctx.openMeta ??
    ((url: string): Promise<RelaySocket> =>
      import("ws").then((mod) => new mod.default(url) as unknown as RelaySocket));

  const wireMeta = (sock: RelaySocket): void => {
    if (closed) {
      try {
        sock.close();
      } catch {
        /* already gone */
      }
      return;
    }
    meta = sock;

    sock.on("open", () => {
      beat();
      try {
        sock.send(
          JSON.stringify({
            authorization: { accessToken: `Bearer ${ctx.metaKey}` },
            audioEncoding: "PCM_24KHZ",
            model: "muse-voice-transcribe-1.0",
            mode: "ENDPOINTING",
            partialMode: "CUMULATIVE",
            emitAudioProgress: false,
            languageBias: ["English"],
          }),
        );
      } catch {
        shutdown(1011, "handshake failed");
        return;
      }
      metaOpen = true;
      while (pending.length > 0) {
        const frame = pending.shift();
        if (!frame) break;
        try {
          sock.send(frame);
        } catch {
          break;
        }
      }
    });

    sock.on("message", (raw: unknown) => {
      beat();
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(raw)) as Record<string, unknown>;
      } catch {
        return;
      }
      if (typeof msg.type !== "string") return; // handshake ack carries no type
      switch (msg.type) {
        case "transcript":
          sendBrowser({ kind: "partial", text: msg.transcript ?? "", final: msg.final === true });
          break;
        case "speechStart":
          sendBrowser({ kind: "speechStart" });
          break;
        case "speechEnd":
          sendBrowser({ kind: "speechEnd" });
          break;
        case "speechComplete": {
          const text = typeof msg.transcript === "string" ? msg.transcript.trim() : "";
          if (!text) break;
          if (commandsOnly && ctx.filter && !ctx.filter(text)) break;
          ctx
            .utterance(text)
            .then((step) => sendBrowser({ kind: "step", step }))
            .catch((error: Error) =>
              sendBrowser({ kind: "error", message: error?.message ?? "turn failed" }),
            );
          break;
        }
        case "error":
          sendBrowser({ kind: "error", message: msg.message ?? "realtime error" });
          break;
        default:
          break; // speaker/audioProgress: no IDV consumer
      }
    });

    const metaGone = (): void => shutdown(1000, "meta closed");
    sock.on("error", metaGone);
    sock.on("close", metaGone);
  };

  try {
    const opened = openMeta(metaUrl);
    if (opened instanceof Promise) opened.then(wireMeta, dialFailed);
    else wireMeta(opened);
  } catch (error) {
    dialFailed(error);
  }
}
