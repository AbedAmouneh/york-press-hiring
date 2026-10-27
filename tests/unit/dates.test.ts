import { describe, expect, it } from "vitest";
import { addBusinessDays, localDate, localWeekday, startOfLocalDay } from "../../server/services/dates.js";

describe("Beirut dates", () => {
  it("rolls over to the next day at Beirut midnight, not UTC midnight", () => {
    expect(localDate(new Date("2026-07-01T21:30:00Z"))).toBe("2026-07-02"); // summer, UTC+3
    expect(localDate(new Date("2026-01-15T21:30:00Z"))).toBe("2026-01-15"); // winter, UTC+2
    expect(localDate(new Date("2026-01-15T22:30:00Z"))).toBe("2026-01-16");
  });

  it("reports the weekday in Beirut", () => {
    expect(localWeekday(new Date("2026-10-27T10:00:00Z"))).toBe(2); // Tuesday
    expect(localWeekday(new Date("2026-11-01T22:30:00Z"))).toBe(1); // already Monday in Beirut
  });

  it("finds the UTC instant when the Beirut day starts", () => {
    expect(startOfLocalDay(new Date("2026-07-02T10:00:00Z")).toISOString()).toBe("2026-07-01T21:00:00.000Z");
    expect(startOfLocalDay(new Date("2026-01-15T10:00:00Z")).toISOString()).toBe("2026-01-14T22:00:00.000Z");
  });
});

describe("addBusinessDays", () => {
  it("skips weekends", () => {
    expect(addBusinessDays("2026-10-30", 1)).toBe("2026-11-02"); // Friday → Monday
    expect(addBusinessDays("2026-10-27", 5)).toBe("2026-11-03"); // Tuesday → next Tuesday
  });

  it("returns the same day for zero", () => {
    expect(addBusinessDays("2026-10-27", 0)).toBe("2026-10-27");
  });
});
