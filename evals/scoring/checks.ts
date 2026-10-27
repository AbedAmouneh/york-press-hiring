// Checks for the scoring test set. Pure functions, so they're unit-tested without calling Claude.

export type Scored = { score: number; dealBreakerMissing: boolean; redFlags: string };

export type Check =
  /** The score lands inside a band. */
  | { kind: "band"; key: string; min: number; max: number; why: string }
  /** One candidate clearly outranks another. */
  | { kind: "above"; higher: string; lower: string; margin: number; why: string }
  /** The deal-breaker flag matches, and a missing deal-breaker caps the score at 40. */
  | { kind: "dealBreaker"; key: string; expected: boolean; why: string }
  /** Fairness: two profiles that differ only in things that must not matter score about the same. */
  | { kind: "similar"; a: string; b: string; tolerance: number; why: string }
  /** A red flag is (or isn't) raised. */
  | { kind: "redFlag"; key: string; expected: boolean; why: string };

export type CheckResult = { check: Check; pass: boolean; detail: string };

export function runCheck(check: Check, scores: Map<string, Scored>): CheckResult {
  const get = (key: string) => scores.get(key);
  const missing = (key: string): CheckResult => ({ check, pass: false, detail: `no score for "${key}"` });
  switch (check.kind) {
    case "band": {
      const s = get(check.key);
      if (!s) return missing(check.key);
      return { check, pass: s.score >= check.min && s.score <= check.max, detail: `${check.key} scored ${s.score}, expected ${check.min}-${check.max}` };
    }
    case "above": {
      const hi = get(check.higher), lo = get(check.lower);
      if (!hi) return missing(check.higher);
      if (!lo) return missing(check.lower);
      return { check, pass: hi.score - lo.score >= check.margin, detail: `${check.higher} ${hi.score} vs ${check.lower} ${lo.score}, needs a gap of ${check.margin}` };
    }
    case "dealBreaker": {
      const s = get(check.key);
      if (!s) return missing(check.key);
      const pass = s.dealBreakerMissing === check.expected && (!check.expected || s.score <= 40);
      return { check, pass, detail: `${check.key}: deal-breaker missing = ${s.dealBreakerMissing}, score ${s.score}` };
    }
    case "similar": {
      const a = get(check.a), b = get(check.b);
      if (!a) return missing(check.a);
      if (!b) return missing(check.b);
      return { check, pass: Math.abs(a.score - b.score) <= check.tolerance, detail: `${check.a} ${a.score} vs ${check.b} ${b.score}, tolerance ${check.tolerance}` };
    }
    case "redFlag": {
      const s = get(check.key);
      if (!s) return missing(check.key);
      const raised = s.redFlags.trim().length > 0;
      return { check, pass: raised === check.expected, detail: `${check.key}: red flag ${raised ? `"${s.redFlags}"` : "none"}` };
    }
  }
}

export function summarize(results: CheckResult[]) {
  const passed = results.filter((r) => r.pass).length;
  return { passed, total: results.length, rate: results.length ? passed / results.length : 1 };
}
