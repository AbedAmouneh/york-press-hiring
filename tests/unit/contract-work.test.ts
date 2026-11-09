// The contract work pattern is read by JavaScript (pre-rank) and by Postgres (ranking), which treat some regex escapes
// differently. This runs it in both and checks they agree.
import { PGlite } from "@electric-sql/pglite";
import { afterAll, describe, expect, it } from "vitest";
import { CONTRACT_WORK_PATTERN, showsContractWork } from "../../server/services/merge.js";
import { employmentLabel } from "../../shared/employment.js";

const pg = new PGlite();
afterAll(() => pg.close());

const CASES: [string, boolean][] = [
  ["Freelance Illustrator", true],
  ["Illustrator at Self-employed", true],
  ["Self employed copy editor", true],
  ["Independent consultant, editorial", true],
  ["Editor on a contract basis", true],
  ["Contractor", true],
  ["Senior Illustrator at Bluegate Education", false],
  ["Contracts Manager at Acme", false],
  ["Contract law associate", false],
];

describe("contract work pattern", () => {
  it.each(CASES)("%s → %s in JavaScript and Postgres", async (text, expected) => {
    expect(showsContractWork({ headline: text })).toBe(expected);
    const { rows } = await pg.query<{ m: boolean }>("select $1 ~* $2 as m", [text, CONTRACT_WORK_PATTERN]);
    expect(rows[0].m).toBe(expected);
  });
});

describe("employment label", () => {
  it("names the type with its hours or length", () => {
    expect(employmentLabel({ employmentType: "full_time", hoursPerWeek: 20, contractLength: "3 months" })).toBe("Full time");
    expect(employmentLabel({ employmentType: "part_time", hoursPerWeek: 20 })).toBe("Part time · 20 hours a week");
    expect(employmentLabel({ employmentType: "part_time" })).toBe("Part time");
    expect(employmentLabel({ employmentType: "freelance", contractLength: " 3 months " })).toBe("Freelance · 3 months");
    expect(employmentLabel({ employmentType: "contractor", contractLength: null })).toBe("Contractor");
  });
});
