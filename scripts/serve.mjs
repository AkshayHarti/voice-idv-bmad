// Zero-dependency local server. Cloudflare Workers is the real target;
// this exists so the demo runs on a laptop with no install beyond the repo.
import { createServer } from "node:http";
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
