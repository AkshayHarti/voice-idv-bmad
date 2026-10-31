// Zero-dependency local server. Cloudflare Workers is the real target;
// this exists so the demo runs on a laptop with no install beyond the repo.
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
import app from "../dist/index.js";

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

server.listen(port, () => {
  console.log(`voice-idv-bmad listening on http://localhost:${port}`);
});
