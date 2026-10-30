import { describe, expect, it } from "vitest";
import { addValue, joinList, removeValue, splitList, toggleValue } from "../../src/lib/multi.js";
import { COUNTRIES } from "../../shared/countries.js";

describe("multi-select values", () => {
  it("reads and writes the comma-separated text the form stores", () => {
    expect(splitList(" Lebanon, Jordan ,, ")).toEqual(["Lebanon", "Jordan"]);
    expect(splitList("")).toEqual([]);
    expect(joinList(["Lebanon", "Jordan"])).toBe("Lebanon, Jordan");
  });

  it("uses the list's spelling, keeps other text as typed and never adds twice", () => {
    expect(addValue(["Lebanon"], "jordan", COUNTRIES)).toEqual(["Lebanon", "Jordan"]);
    expect(addValue(["Lebanon"], "  LEBANON ", COUNTRIES)).toEqual(["Lebanon"]);
    expect(addValue([], "Kurdistan Region", COUNTRIES)).toEqual(["Kurdistan Region"]);
    expect(addValue(["Lebanon"], "   ", COUNTRIES)).toEqual(["Lebanon"]);
  });

  it("never stores a comma inside one value", () => {
    expect(addValue([], "Beirut, Lebanon")).toEqual(["Beirut Lebanon"]);
    expect(COUNTRIES.some((c) => c.includes(","))).toBe(false);
  });

  it("removes and toggles regardless of case", () => {
    expect(removeValue(["Lebanon", "Jordan"], "lebanon")).toEqual(["Jordan"]);
    expect(toggleValue(["Lebanon"], "Jordan")).toEqual(["Lebanon", "Jordan"]);
    expect(toggleValue(["Lebanon", "Jordan"], "Jordan")).toEqual(["Lebanon"]);
  });
});
