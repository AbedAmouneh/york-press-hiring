import { describe, expect, it } from "vitest";
import { applyGuardrails, computeSignals, mentions, mustHaveTerms, signalFacts } from "../../server/services/signals.js";
import { DEFAULT_WEIGHTS } from "../../shared/types.js";

const now = new Date("2026-11-01");
const role = {
  title: "Frontend Developer (React)",
  seniority: "Mid",
  mustHaves: ["React", "TypeScript and JavaScript", "REST API integration", "Git"],
  minYears: 2,
  idealYears: 5,
  languages: ["English"],
  locationPolicy: "On-site",
  searchLocations: ["Lebanon"],
};
const person = (over: Record<string, unknown> = {}) => ({
  headline: "Frontend developer",
  currentTitle: "Frontend Developer",
  location: "Beirut, Lebanon",
  experience: [
    { title: "Frontend Developer", company: "Eurisko", start: "2023-01", end: null, summary: "Built React and TypeScript dashboards calling REST APIs." },
    { title: "Junior Web Developer", company: "Koein", start: "2021-06", end: "2022-12", summary: "jQuery pages" },
  ],
  skills: ["React", "Git", "Figma"],
  languages: ["English", "Arabic"],
  email: "a@b.com",
  ...over,
});

describe("mustHaveTerms", () => {
  it("splits combined must-haves and drops filler", () => {
    expect(mustHaveTerms("TypeScript and JavaScript")).toEqual(["typescript", "javascript"]);
    expect(mustHaveTerms("JavaScript (2+ years)")).toEqual(["javascript"]);
    expect(mustHaveTerms("REST API integration")).toEqual(["rest api integration"]);
  });

  it("keeps the skill when a must-have starts with a number of years", () => {
    expect(mustHaveTerms("3+ years of Python")).toEqual(["python"]);
    expect(mustHaveTerms("5 years experience in Django and PostgreSQL")).toEqual(["django", "postgresql"]);
    expect(mustHaveTerms("2+ years of professional experience with React")).toEqual(["react"]);
  });

  it("matches multi-word terms when all their words appear", () => {
    expect(mentions("Integrated REST APIs for the API integration layer", "rest api integration")).toBe(true);
    expect(mentions("Built forms", "rest api integration")).toBe(false);
  });
});

describe("computeSignals", () => {
  it("works out years from dates, merging overlaps, and counts only similar titles as relevant", () => {
    const s = computeSignals(person(), role, now);
    expect(s.datedProfile).toBe(true);
    expect(s.relevantYears).toBe(3.8); // Jan 2023 → Nov 2026
    expect(s.totalYears).toBe(5.4); // Jun 2021 → Dec 2022 plus Jan 2023 → Nov 2026
    expect(s.level).toBe("match");
  });

  it("separates must-haves proven in work, only listed, and missing", () => {
    const s = computeSignals(person(), role, now);
    expect(s.skillsInWork).toEqual(["React", "TypeScript and JavaScript", "REST API integration"]);
    expect(s.skillsListedOnly).toEqual(["Git"]);
    expect(s.skillsMissing).toEqual([]);
  });

  it("flags short finished jobs, the wrong level and location for an on-site role", () => {
    const s = computeSignals(person({
      currentTitle: "Junior Frontend Developer",
      location: "Cairo, Egypt",
      experience: [
        { title: "Junior Frontend Developer", company: "A", start: "2026-02", end: null },
        { title: "Frontend Intern", company: "B", start: "2025-06", end: "2025-11" },
      ],
    }), role, now);
    expect(s.shortStints).toBe(1);
    expect(s.level).toBe("below");
    expect(s.locationFit).toBe("mismatch");
  });

  it("calls a much more senior lead 'above' a mid-level role", () => {
    const s = computeSignals(person({
      currentTitle: "Head of Frontend",
      experience: [{ title: "Head of Frontend", company: "Big", start: "2010-01", end: null }],
    }), role, now);
    expect(s.level).toBe("above");
  });

  it("says years aren't verified when the profile has no dates", () => {
    const s = computeSignals(person({ experience: [{ title: "Frontend Developer", company: "X" }], totalYears: 4 }), role, now);
    expect(s.datedProfile).toBe(false);
    expect(s.relevantYears).toBeNull();
    expect(s.totalYears).toBe(4);
    expect(signalFacts(s)[0]).toMatch(/no dates/);
  });

  it("limits seniority and experience points for someone far above the level, and explains it", () => {
    const head = computeSignals(person({
      currentTitle: "Head of Frontend",
      experience: [{ title: "Head of Frontend", company: "Big", start: "2010-01", end: null }],
    }), role, now);
    const full = { must: 30, exp: 20, industry: 10, seniority: 10, trajectory: 8, remote: 5, signals: 4 };
    const g = applyGuardrails(full, DEFAULT_WEIGHTS, head);
    expect(g.breakdown.seniority).toBe(3);
    expect(g.breakdown.exp).toBe(12);
    expect(g.breakdown.must).toBe(30);
    expect(g.notes).toEqual(["well above the requested level"]);
    expect(applyGuardrails(full, DEFAULT_WEIGHTS, computeSignals(person(), role, now)).notes).toEqual([]);
  });

  it("only checks location for on-site or hybrid roles", () => {
    expect(computeSignals(person({ location: "Paris, France" }), { ...role, locationPolicy: "Remote" }, now).locationFit).toBe("unknown");
  });
});
