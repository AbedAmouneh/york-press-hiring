// Checks the size of the first script every visitor downloads (after `npm run build`).
// Pages are loaded on demand (src/App.tsx); if someone imports a page eagerly again, this fails.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const LIMIT_KB = 800;
const dir = "dist/assets";
const main = readdirSync(dir).filter((f) => /^index-.*\.js$/.test(f));
if (!main.length) {
  console.error("No dist/assets/index-*.js found: run `npm run build` first.");
  process.exit(1);
}
let failed = false;
for (const file of main) {
  const kb = Math.round(statSync(join(dir, file)).size / 1024);
  const ok = kb <= LIMIT_KB;
  console.log(`${ok ? "✓" : "✗"} ${file}: ${kb} kB (limit ${LIMIT_KB} kB)`);
  if (!ok) failed = true;
}
if (failed) {
  console.error("The main script grew past the limit. Load new pages with lazy() in src/App.tsx.");
  process.exit(1);
}
