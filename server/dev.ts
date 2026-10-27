// Local API server for `npm run dev` (Vite proxies /api to this port).
import fs from "node:fs";
import { serve } from "@hono/node-server";

// Load .env without extra dependencies.
if (fs.existsSync(".env")) {
  for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const { default: app } = await import("./app.js");
const { getDb } = await import("./db/client.js");
await getDb();

const port = Number(process.env.API_PORT ?? 3001);
serve({ fetch: app.fetch, port });
console.log(`API ready on http://localhost:${port} — open http://localhost:5173`);
