import { describe, expect, it } from "vitest";
import { atExcludedCompany, mergeProfiles, nameKey, prescore } from "../../server/services/merge.js";
import type { NormalizedProfile } from "../../server/services/providers/types.js";

const profile = (over: Partial<NormalizedProfile>): NormalizedProfile => ({
  source: "PDL",
  sourceId: "id",
  fullName: "Rana Haddad",
  currentTitle: "Senior Editor",
  currentCompany: "Acme Press",
  experience: [],
  education: [],
  skills: [],
  ...over,
});

describe("nameKey", () => {
  it("ignores case and extra spaces", () => {
    expect(nameKey({ fullName: "  Rana   HADDAD ", currentCompany: "Acme Press " })).toBe("rana haddad|acme press");
  });
});

describe("mergeProfiles", () => {
  it("merges the same LinkedIn profile from both sources", () => {
    const merged = mergeProfiles([
      profile({ source: "PDL", sourceId: "pdl-1", linkedinUrl: "https://linkedin.com/in/rana", email: "rana@acme.test", skills: ["InDesign"] }),
      profile({ source: "SignalHire", sourceId: "sh-1", linkedinUrl: "https://www.linkedin.com/in/Rana/", skills: ["InDesign", "Copy editing"] }),
    ], []);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      sources: ["PDL", "SignalHire"],
      pdlId: "pdl-1",
      signalhireUid: "sh-1",
      email: "rana@acme.test",
      skills: ["InDesign", "Copy editing"],
      linkedinUrl: "https://www.linkedin.com/in/rana",
    });
  });

  it("falls back to name and current company when a source has no LinkedIn URL", () => {
    const merged = mergeProfiles([
      profile({ source: "PDL", sourceId: "pdl-1", linkedinUrl: "https://linkedin.com/in/rana" }),
      profile({ source: "SignalHire", sourceId: "sh-1", fullName: "rana haddad" }),
    ], []);
    expect(merged).toHaveLength(1);
    expect(merged[0].sources).toEqual(["PDL", "SignalHire"]);
  });

  it("keeps people with the same name at different companies apart", () => {
    const merged = mergeProfiles([profile({ sourceId: "a" }), profile({ sourceId: "b", currentCompany: "Beta Books" })], []);
    expect(merged).toHaveLength(2);
  });

  it("prefers dated experience over undated experience", () => {
    const dated = [{ title: "Editor", company: "Acme Press", start: "2020-01" }];
    const merged = mergeProfiles([
      profile({ source: "SignalHire", sourceId: "sh-1", experience: [{ title: "Editor", company: "Acme Press" }] }),
      profile({ source: "PDL", sourceId: "pdl-1", experience: dated }),
    ], []);
    expect(merged[0].experience).toEqual(dated);
  });

  it("drops people currently at an excluded company", () => {
    const merged = mergeProfiles([profile({ currentCompany: "York Press Ltd" }), profile({ sourceId: "b", fullName: "Sami Khoury" })], ["York Press", ""]);
    expect(merged.map((p) => p.fullName)).toEqual(["Sami Khoury"]);
  });

  it("drops people who may still be at York Press: an undated role there, even if not listed first", () => {
    const freelancerAtYorkPress = profile({ currentCompany: "Freelance", experience: [{ title: "Designer", company: "Freelance" }, { title: "Senior Illustrator", company: "York Press Limited" }] });
    expect(atExcludedCompany(freelancerAtYorkPress, ["York Press"])).toBe(true);
  });

  it("keeps former York Press staff whose role there has an end date", () => {
    const former = profile({ experience: [{ title: "Illustrator", company: "York Press", start: "2018-01", end: "2021-06" }] });
    expect(atExcludedCompany(former, ["York Press"])).toBe(false);
  });

  it("only removes people currently at the request's other companies to avoid", () => {
    const pastRival = profile({ currentCompany: "Acme Press", experience: [{ title: "Editor", company: "Rival Books" }] });
    expect(atExcludedCompany(pastRival, ["York Press", "Rival Books"])).toBe(false);
    expect(atExcludedCompany(profile({ currentCompany: "Rival Books" }), ["Rival Books"])).toBe(true);
  });
});

describe("prescore", () => {
  it("gives full marks for a title match, every skill and enough years", () => {
    const p = profile({ skills: ["InDesign", "Copy Editing"], totalYears: 8 });
    expect(prescore(p, ["Senior Editor"], ["indesign", "copy editing"], 5)).toBe(100);
  });

  it("gives half the title points for a partial title match", () => {
    const p = profile({ currentTitle: "Editor in Chief", skills: [], totalYears: 0 });
    expect(prescore(p, ["Managing Editor"], ["indesign"], 5)).toBe(25);
  });

  it("uses neutral defaults when the brief has no skills or minimum years", () => {
    const p = profile({ currentTitle: "Accountant" });
    expect(prescore(p, ["Senior Editor"], [], null)).toBe(29);
  });
});
