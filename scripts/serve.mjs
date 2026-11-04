// Local demo server: plain node:http plus the `ws` package for the
// realtime voice relay upgrade below. Cloudflare Workers is the real
// target; this exists so the demo runs on a laptop with `npm install`.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Minimal .env loader (KEY=VALUE, # comments, optional quotes). Keeps the
// zero-dependency rule: real env always wins, .env never overrides it.
try {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
} catch {
  // No .env — plain environment only.
}
import app, { attachAsrLive } from "../dist/index.js";

const port = Number(process.env.PORT ?? 8787);

const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const url = `http://${req.headers.host ?? `localhost:${port}`}${req.url}`;
  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
    body: chunks.length ? Buffer.concat(chunks) : undefined,
  });

  const response = await app.fetch(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
});

// Realtime speech-in: ws(s)://host/api/session/:id/asr-live upgrades here
// (Hono never sees upgrades) and bridges to Meta via attachAsrLive. The
// `ws` import is lazy so plain HTTP still boots without it installed.
let relayWss = null;
server.on("upgrade", async (req, socket, head) => {
  const m = (req.url || "").match(/^\/api\/session\/([^/]+)\/asr-live$/);
  if (!m) {
    socket.destroy();
    return;
  }
  try {
    if (!relayWss) {
      const { WebSocketServer } = await import("ws");
      relayWss = new WebSocketServer({ noServer: true });
    }
    relayWss.handleUpgrade(req, socket, head, (browser) => {
      attachAsrLive(browser, decodeURIComponent(m[1]));
    });
  } catch {
    socket.destroy(); // relay unavailable: HTTP paths unaffected
  }
});

server.listen(port, () => {
  console.log(`voice-idv-bmad listening on http://localhost:${port}`);
});
