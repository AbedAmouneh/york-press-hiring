// The scorecard learns from hiring-manager decisions, within limits, and only when it ranks past decisions better.
import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, type CriterionKey } from "../../shared/types.js";
import { DRIFT_LIMIT, learnWeights, pairwiseAccuracy, STEP_LIMIT, toExample, type Example } from "../../server/services/learning.js";

const keys = Object.keys(DEFAULT_WEIGHTS) as CriterionKey[];
const x = (over: Partial<Record<CriterionKey, number>>) => ({ ...Object.fromEntries(keys.map((k) => [k, 0.6])), ...over }) as Record<CriterionKey, number>;

/** Managers say yes to people strong on industry fit, whatever their must-have score. */
function industryLovers(n: number): Example[] {
  const out: Example[] = [];
  for (let i = 0; i < n; i++) {
    const strongIndustry = i % 2 === 0;
    // With the default weights the "no" people score higher (must-haves weigh 35 vs industry 15).
    out.push({ x: x({ industry: strongIndustry ? 0.9 : 0.2, must: strongIndustry ? 0.5 : 0.9 }), y: strongIndustry ? 1 : 0 });
  }
  return out;
}

describe("learnWeights", () => {
  it("waits for enough decisions on both sides", () => {
    const r = learnWeights(DEFAULT_WEIGHTS, DEFAULT_WEIGHTS, industryLovers(6));
    expect(r.changed).toBe(false);
    expect(r.reason).toMatch(/Needs at least 12 decisions/);
  });

  it("moves weight towards what managers pick, within limits, keeping the total", () => {
    const examples = industryLovers(20);
    const r = learnWeights(DEFAULT_WEIGHTS, DEFAULT_WEIGHTS, examples);
    expect(r.changed).toBe(true);
    expect(r.weights.industry).toBeGreaterThan(DEFAULT_WEIGHTS.industry);
    expect(r.weights.must).toBeLessThan(DEFAULT_WEIGHTS.must);
    expect(r.accuracyAfter).toBeGreaterThan(r.accuracyBefore);
    expect(Object.values(r.weights).reduce((a, b) => a + b, 0)).toBe(100);
    for (const k of keys) {
      expect(Math.abs(r.weights[k] - DEFAULT_WEIGHTS[k])).toBeLessThanOrEqual(Math.min(STEP_LIMIT, DRIFT_LIMIT));
      expect(r.weights[k]).toBeGreaterThanOrEqual(0);
    }
  });

  it("leaves the weights alone when they already rank decisions well", () => {
    const examples: Example[] = Array.from({ length: 16 }, (_, i) => ({ x: x({ must: i % 2 ? 0.9 : 0.2 }), y: i % 2 ? 1 : 0 }));
    expect(pairwiseAccuracy(DEFAULT_WEIGHTS, examples)).toBe(1);
    expect(learnWeights(DEFAULT_WEIGHTS, DEFAULT_WEIGHTS, examples).changed).toBe(false);
  });
});

describe("toExample", () => {
  const breakdown = { must: 28, exp: 10, industry: 15, seniority: 5, trajectory: 5, remote: 5, signals: 0 };
  it("labels yes, interview and hired as positive and a manager's no as negative", () => {
    expect(toExample({ scoreBreakdown: breakdown, hmDecision: "yes", status: "contacted" }, DEFAULT_WEIGHTS)?.y).toBe(1);
    expect(toExample({ scoreBreakdown: breakdown, hmDecision: null, status: "interview" }, DEFAULT_WEIGHTS)?.y).toBe(1);
    expect(toExample({ scoreBreakdown: breakdown, hmDecision: "no", status: "contacted" }, DEFAULT_WEIGHTS)?.y).toBe(0);
    expect(toExample({ scoreBreakdown: breakdown, hmDecision: "no", status: "contacted" }, DEFAULT_WEIGHTS)?.x.must).toBe(0.8);
  });

  it("ignores maybe, undecided and candidate-side rejections", () => {
    expect(toExample({ scoreBreakdown: breakdown, hmDecision: "maybe", status: "contacted" }, DEFAULT_WEIGHTS)).toBeNull();
    expect(toExample({ scoreBreakdown: breakdown, hmDecision: null, status: "rejected" }, DEFAULT_WEIGHTS)).toBeNull();
    expect(toExample({ scoreBreakdown: null, hmDecision: "yes", status: "new" }, DEFAULT_WEIGHTS)).toBeNull();
  });
});
