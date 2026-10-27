import { describe, expect, it } from "vitest";
import { runCheck, summarize, type Scored } from "../../evals/scoring/checks.js";
import { ROLES } from "../../evals/scoring/cases.js";

const scores = new Map<string, Scored>([
  ["a", { score: 82, dealBreakerMissing: false, redFlags: "" }],
  ["b", { score: 55, dealBreakerMissing: false, redFlags: "Four roles under 6 months." }],
  ["c", { score: 38, dealBreakerMissing: true, redFlags: "" }],
  ["d", { score: 80, dealBreakerMissing: false, redFlags: "" }],
]);

describe("scoring checks", () => {
  it("checks score bands", () => {
    expect(runCheck({ kind: "band", key: "a", min: 75, max: 100, why: "" }, scores).pass).toBe(true);
    expect(runCheck({ kind: "band", key: "b", min: 75, max: 100, why: "" }, scores).pass).toBe(false);
  });

  it("checks one candidate outranks another by a margin", () => {
    expect(runCheck({ kind: "above", higher: "a", lower: "b", margin: 20, why: "" }, scores).pass).toBe(true);
    expect(runCheck({ kind: "above", higher: "a", lower: "d", margin: 5, why: "" }, scores).pass).toBe(false);
  });

  it("checks the deal-breaker flag and the cap at 40", () => {
    expect(runCheck({ kind: "dealBreaker", key: "c", expected: true, why: "" }, scores).pass).toBe(true);
    expect(runCheck({ kind: "dealBreaker", key: "a", expected: true, why: "" }, scores).pass).toBe(false);
    const uncapped = new Map([["x", { score: 60, dealBreakerMissing: true, redFlags: "" }]]);
    expect(runCheck({ kind: "dealBreaker", key: "x", expected: true, why: "" }, uncapped).pass).toBe(false);
  });

  it("checks fairness pairs score alike", () => {
    expect(runCheck({ kind: "similar", a: "a", b: "d", tolerance: 5, why: "" }, scores).pass).toBe(true);
    expect(runCheck({ kind: "similar", a: "a", b: "b", tolerance: 5, why: "" }, scores).pass).toBe(false);
  });

  it("checks red flags", () => {
    expect(runCheck({ kind: "redFlag", key: "b", expected: true, why: "" }, scores).pass).toBe(true);
    expect(runCheck({ kind: "redFlag", key: "a", expected: true, why: "" }, scores).pass).toBe(false);
  });

  it("fails a check when a score is missing", () => {
    expect(runCheck({ kind: "band", key: "nobody", min: 0, max: 100, why: "" }, scores)).toMatchObject({ pass: false, detail: 'no score for "nobody"' });
  });

  it("summarizes the pass rate", () => {
    const r = [runCheck({ kind: "band", key: "a", min: 0, max: 100, why: "" }, scores), runCheck({ kind: "band", key: "a", min: 90, max: 100, why: "" }, scores)];
    expect(summarize(r)).toEqual({ passed: 1, total: 2, rate: 0.5 });
  });
});

describe("the test set itself", () => {
  it("only refers to candidates that exist in its role", () => {
    for (const role of ROLES) {
      const keys = new Set(role.candidates.map((c) => c.key));
      for (const check of role.checks) {
        const refs = "key" in check ? [check.key] : "higher" in check ? [check.higher, check.lower] : [check.a, check.b];
        for (const ref of refs) expect(keys, `${role.id}: ${ref}`).toContain(ref);
      }
    }
  });

  it("never gives Claude a name", () => {
    for (const role of ROLES) for (const c of role.candidates) expect(c).not.toHaveProperty("fullName");
  });
});
