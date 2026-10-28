import { describe, expect, it } from "vitest";
import { colorIndex, initials } from "../../src/lib/people";

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
