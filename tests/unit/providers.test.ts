import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeLinkedin, titleCase, totalYearsFromExperience, yearsBetween } from "../../server/services/providers/types.js";
import { buildPdlQuery, countriesFrom, mapPdl } from "../../server/services/providers/pdl.js";
import { parseCandidate, titleBoolean } from "../../server/services/providers/signalhire.js";
import type { SearchBrief } from "../../server/db/schema.js";

describe("profile helpers", () => {
  it("normalizes LinkedIn profile URLs so duplicates match", () => {
    expect(normalizeLinkedin("HTTPS://LinkedIn.com/in/Jane-Doe/?trk=abc")).toBe("https://www.linkedin.com/in/jane-doe");
    expect(normalizeLinkedin("linkedin.com/in/jane-doe")).toBe("https://www.linkedin.com/in/jane-doe");
    expect(normalizeLinkedin("https://www.linkedin.com/company/york-press")).toBeNull();
    expect(normalizeLinkedin(null)).toBeNull();
  });

  it("measures years between dates", () => {
    expect(yearsBetween("2020-01", "2022-01")).toBeCloseTo(2, 1);
    expect(yearsBetween("2020", "2020")).toBeCloseTo(1, 1);
    expect(yearsBetween(null, "2022-01")).toBe(0);
    expect(yearsBetween("2022-01", "2020-01")).toBe(0);
  });

  describe("totalYearsFromExperience", () => {
    afterEach(() => vi.useRealTimers());

    it("counts from the earliest start date to today", () => {
      vi.useFakeTimers({ now: new Date("2026-01-01T00:00:00Z") });
      expect(totalYearsFromExperience([
        { title: "Editor", company: "A", start: "2019-06", end: null },
        { title: "Writer", company: "B", start: "2016-01", end: "2019-05" },
      ])).toBe(10);
    });

    it("returns null when no role has a start date", () => {
      expect(totalYearsFromExperience([{ title: "Editor", company: "A" }])).toBeNull();
    });
  });

  it("title-cases names", () => {
    expect(titleCase("jane o'neil")).toBe("Jane O'neil");
    expect(titleCase(null)).toBeNull();
  });
});

const brief: SearchBrief = {
  titles: ["Senior Editor", "Managing Editor"],
  skills: ["Copy editing", "InDesign"],
  locations: ["Beirut, Lebanon", "Remote", "Jordan", "MENA"],
  excludeCompanies: ["Rival Books"],
} as SearchBrief;

describe("People Data Labs", () => {
  it("keeps only real countries from the location list", () => {
    expect(countriesFrom(["Beirut, Lebanon", "Remote", "Jordan", "MENA", "lebanon"])).toEqual(["lebanon", "jordan"]);
  });

  it("builds a query that always excludes York Press", () => {
    const q = buildPdlQuery(brief);
    expect(q.bool.filter).toEqual([{ terms: { location_country: ["lebanon", "jordan"] } }]);
    expect(q.bool.must_not).toEqual([
      { match_phrase: { job_company_name: "york press" } },
      { match_phrase: { job_company_name: "rival books" } },
    ]);
    expect(q.bool.must[0].bool.should).toHaveLength(2);
  });

  it("maps a PDL record to our profile shape", () => {
    const p = mapPdl({
      id: "pdl-1",
      full_name: "rana haddad",
      job_title: "senior editor",
      job_company_name: "acme press",
      location_name: "beirut, lebanon",
      linkedin_url: "linkedin.com/in/rana-haddad",
      work_email: "rana@acme.test",
      experience: [
        { title: { name: "senior editor" }, company: { name: "acme press" }, start_date: "2021-03-01", is_primary: true },
        { title: { name: "editor" }, company: { name: "beta books" }, start_date: "2017-01-01", end_date: "2021-02-01" },
        { title: {}, company: {} },
      ],
      skills: ["copy editing"],
      inferred_years_experience: 9,
    });
    expect(p).toMatchObject({
      source: "PDL",
      sourceId: "pdl-1",
      fullName: "Rana Haddad",
      currentTitle: "Senior Editor",
      currentCompany: "Acme Press",
      linkedinUrl: "https://www.linkedin.com/in/rana-haddad",
      email: "rana@acme.test",
      skills: ["Copy Editing"],
      totalYears: 9,
    });
    expect(p.experience).toEqual([
      { title: "Senior Editor", company: "Acme Press", start: "2021-03", end: null, summary: null },
      { title: "Editor", company: "Beta Books", start: "2017-01", end: "2021-02", summary: null },
    ]);
  });
});

describe("SignalHire", () => {
  it("turns titles into a Boolean search", () => {
    expect(titleBoolean(["Senior Editor", "Copywriter", "Head of (Content)"])).toBe("(Senior AND Editor) OR Copywriter OR (Head AND Content)");
  });

  it("picks the best-rated contact details from a reveal", () => {
    const r = parseCandidate("item-1", "success", {
      contacts: [
        { type: "email", value: "old@mail.test", rating: 50 },
        { type: "email", value: "best@mail.test", rating: 90 },
        { type: "phone", value: "+961 1 000 000", rating: 70 },
      ],
      social: [{ type: "li", link: "https://lb.linkedin.com/in/Rana-Haddad" }],
    });
    expect(r).toEqual({ item: "item-1", status: "success", email: "best@mail.test", phone: "+961 1 000 000", linkedinUrl: "https://www.linkedin.com/in/rana-haddad" });
  });

  it("returns empty contacts when the reveal failed", () => {
    expect(parseCandidate("item-2", "failed", null)).toEqual({ item: "item-2", status: "failed", email: null, phone: null, linkedinUrl: null });
  });
});
