import { describe, expect, it } from "vitest";
import { summaryOf, yearsLabel } from "../../src/lib/positions.js";

describe("saved position helpers", () => {
  it("labels the year range", () => {
    expect(yearsLabel({ minYears: 2, idealYears: 5 })).toBe("2–5 yrs");
    expect(yearsLabel({ minYears: 5, idealYears: null })).toBe("5+ yrs");
    expect(yearsLabel({ minYears: 3, idealYears: 3 })).toBe("3+ yrs");
    expect(yearsLabel({ minYears: null, idealYears: 4 })).toBe("0–4 yrs");
    expect(yearsLabel({ minYears: null, idealYears: null })).toBe("");
  });

  it("takes the first sentence of the role paragraph as the summary", () => {
    const jd = "About York Press\nWe publish textbooks.\n\nThe Role\nEdit ELT courses for schools. You work with authors.\n\nResponsibilities\n- Edit";
    expect(summaryOf(jd)).toBe("Edit ELT courses for schools.");
    expect(summaryOf("No role section here.")).toBe("");
    expect(summaryOf("")).toBe("");
  });
});
