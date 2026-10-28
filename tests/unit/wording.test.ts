import { describe, expect, it } from "vitest";
import { midSentence } from "../../server/services/wording.js";

describe("midSentence", () => {
  it("lowers only the first letter so place names keep their capitals", () => {
    expect(midSentence("On-site, Zouk Mosbeh, Lebanon")).toBe("on-site, Zouk Mosbeh, Lebanon");
    expect(midSentence("Remote, global")).toBe("remote, global");
  });
  it("leaves acronyms and empty text alone", () => {
    expect(midSentence("UK office, London")).toBe("UK office, London");
    expect(midSentence("  ")).toBe("");
  });
});
