// Run the scoring test set against the real Claude API: `npm run eval:scoring`
// Costs a few cents per run. Fails (exit 1) when fewer than EVAL_MIN_PASS (default 90%) of checks pass.
// EVAL_RUNS=3 repeats each role to expose unstable scores.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Usage is logged to a throwaway local database, never to production.
process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "yp-eval-"));
delete process.env.DATABASE_URL;

const { mock } = await import("../server/env.js");
const { scoreBatch, totalScore } = await import("../server/services/claude.js");
const { DEFAULT_WEIGHTS } = await import("../shared/types.js");
const { ROLES } = await import("../evals/scoring/cases.js");
const { runCheck, summarize } = await import("../evals/scoring/checks.js");
type Scored = import("../evals/scoring/checks.js").Scored;
type CheckResult = import("../evals/scoring/checks.js").CheckResult;

if (mock.claude) {
  console.log("Neither OPENCODE_API_KEY nor ANTHROPIC_API_KEY is set, so there is nothing to evaluate (mock scores are random). Skipping.");
  process.exit(0);
}

const runs = Math.max(1, Number(process.env.EVAL_RUNS ?? 1));
const minPass = Number(process.env.EVAL_MIN_PASS ?? 0.9);
const all: CheckResult[] = [];

for (const role of ROLES) {
  for (let run = 1; run <= runs; run++) {
    const scores = new Map<string, Scored>();
    for (let i = 0; i < role.candidates.length; i += 5) {
      const results = await scoreBatch(role.request, DEFAULT_WEIGHTS, role.candidates.slice(i, i + 5));
      for (const r of results) {
        const { score } = totalScore(r.breakdown, DEFAULT_WEIGHTS, r.dealBreakerMissing);
        scores.set(r.key, { score, dealBreakerMissing: r.dealBreakerMissing, redFlags: r.redFlags ?? "" });
      }
    }
    console.log(`\n${role.id}${runs > 1 ? ` (run ${run}/${runs})` : ""}`);
    for (const [key, s] of scores) console.log(`  ${key.padEnd(20)} ${String(s.score).padStart(3)}${s.dealBreakerMissing ? "  deal-breaker" : ""}${s.redFlags ? `  ⚑ ${s.redFlags}` : ""}`);
    for (const check of role.checks) {
      const result = runCheck(check, scores);
      all.push(result);
      console.log(`  ${result.pass ? "✓" : "✗"} ${check.why}: ${result.detail}`);
    }
  }
}

const { passed, total, rate } = summarize(all);
console.log(`\n${passed}/${total} checks passed (${Math.round(rate * 100)}%). Minimum: ${Math.round(minPass * 100)}%.`);
process.exit(rate >= minPass ? 0 : 1);
