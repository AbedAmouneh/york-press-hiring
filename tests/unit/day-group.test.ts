import { describe, expect, it } from "vitest";
import { dayGroup } from "../../src/lib/dates";

describe("dayGroup", () => {
  const now = new Date(2026, 9, 28, 10, 0);
  it("names today and yesterday", () => {
    expect(dayGroup(new Date(2026, 9, 28, 0, 5), now)).toBe("Today");
    expect(dayGroup(new Date(2026, 9, 27, 23, 59), now)).toBe("Yesterday");
  });
  it("shows a short date for older days", () => {
    expect(dayGroup(new Date(2026, 9, 26, 9), now)).toBe("Mon 26 Oct");
  });
});
