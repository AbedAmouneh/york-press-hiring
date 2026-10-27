import { describe, expect, it } from "vitest";
import { totalScore } from "../../server/services/claude.js";
import { DEFAULT_WEIGHTS, type Weights } from "../../shared/types.js";

const full = { ...DEFAULT_WEIGHTS };

describe("totalScore", () => {
  it("gives 100 when every criterion is at its weight", () => {
    expect(totalScore(full, DEFAULT_WEIGHTS, false).score).toBe(100);
  });

  it("clamps each criterion between 0 and its weight", () => {
    const { breakdown, score } = totalScore({ ...full, must: 80, exp: -5 }, DEFAULT_WEIGHTS, false);
    expect(breakdown.must).toBe(35);
    expect(breakdown.exp).toBe(0);
    expect(score).toBe(80);
  });

  it("treats missing criteria as zero and rounds fractions", () => {
    const { breakdown, score } = totalScore({ must: 17.6 }, DEFAULT_WEIGHTS, false);
    expect(breakdown).toMatchObject({ must: 18, exp: 0, signals: 0 });
    expect(score).toBe(18);
  });

  it("caps the score at 40 when a deal-breaker is missing", () => {
    expect(totalScore(full, DEFAULT_WEIGHTS, true).score).toBe(40);
    expect(totalScore({ must: 20, exp: 10 }, DEFAULT_WEIGHTS, true).score).toBe(30);
  });

  it("uses the role's own weights", () => {
    const weights: Weights = { must: 50, exp: 20, industry: 10, seniority: 10, trajectory: 5, remote: 0, signals: 5 };
    const { breakdown, score } = totalScore({ must: 50, remote: 5 }, weights, false);
    expect(breakdown.remote).toBe(0);
    expect(score).toBe(50);
  });
});
