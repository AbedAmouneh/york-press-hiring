import { describe, expect, it } from "vitest";
import { scoreFractions, scoreWithWeights, totalScore } from "../../server/services/claude.js";
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

describe("re-weighting", () => {
  it("gives back the same scores after changing the weights and changing them back", () => {
    const original = { must: 23.4, exp: 11.2, industry: 4.6, seniority: 7, trajectory: 6.3, remote: 5, signals: 1.7 };
    const { score } = totalScore(original, DEFAULT_WEIGHTS, false);
    const fractions = scoreFractions(original, DEFAULT_WEIGHTS);
    const other: Weights = { must: 60, exp: 10, industry: 10, seniority: 5, trajectory: 5, remote: 5, signals: 5 };
    expect(scoreWithWeights(fractions, other, false).score).not.toBe(score);
    expect(scoreWithWeights(fractions, DEFAULT_WEIGHTS, false).score).toBe(score);
  });

  it("keeps a criterion at zero when it had no weight, and keeps the deal-breaker cap", () => {
    const zeroed: Weights = { ...DEFAULT_WEIGHTS, signals: 0, must: 40 };
    const fractions = scoreFractions({ must: 40, signals: 3 }, zeroed);
    expect(fractions.signals).toBe(0);
    expect(scoreWithWeights(fractions, DEFAULT_WEIGHTS, true).score).toBeLessThanOrEqual(40);
  });
});
