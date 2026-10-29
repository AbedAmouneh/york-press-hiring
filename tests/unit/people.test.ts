import { describe, expect, it } from "vitest";
import { colorIndex, dateRange, initials, linkedinSearchUrl } from "../../src/lib/people";

describe("linkedinSearchUrl", () => {
  it("searches LinkedIn people for the name and employer", () => {
    expect(linkedinSearchUrl("Nour Haidar", "Lebanese Alternative Learning")).toBe("https://www.linkedin.com/search/results/people/?keywords=Nour%20Haidar%20Lebanese%20Alternative%20Learning");
  });
  it("leaves out employers that don't narrow the search", () => {
    expect(linkedinSearchUrl("Rayan Itani", "Freelance")).toBe("https://www.linkedin.com/search/results/people/?keywords=Rayan%20Itani");
    expect(linkedinSearchUrl("Rayan Itani", null)).toBe("https://www.linkedin.com/search/results/people/?keywords=Rayan%20Itani");
  });
});

describe("dateRange", () => {
  it("shows nothing when there are no dates, and Present for a current role", () => {
    expect(dateRange(null, null)).toBe("");
    expect(dateRange("2021-03", null)).toBe("2021-03 – Present");
    expect(dateRange("2017-01", "2021-02")).toBe("2017-01 – 2021-02");
  });
});

describe("initials", () => {
  it("takes the first and last name", () => {
    expect(initials("Abed El-Fattah Amouneh")).toBe("AA");
    expect(initials("Khalil Sayegh")).toBe("KS");
  });
  it("handles one word, extra spaces and empty names", () => {
    expect(initials("  maya  ")).toBe("M");
    expect(initials("")).toBe("?");
  });
});

describe("colorIndex", () => {
  it("is stable and inside the palette", () => {
    expect(colorIndex("Demo Recruiter", 6)).toBe(colorIndex("Demo Recruiter", 6));
    for (const n of ["A", "Bob", "Zeina Ghanem", "عبد"]) {
      const i = colorIndex(n, 6);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(6);
    }
  });
});
