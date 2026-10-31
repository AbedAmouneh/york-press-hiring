import { describe, expect, it } from "vitest";
import { lookupBody, readLookup, slugMatchesName } from "../../server/services/linkedin-finder.js";

describe("slugMatchesName", () => {
  it("accepts a profile address carrying the first or last name", () => {
    expect(slugMatchesName("https://www.linkedin.com/in/alaa-bachacha-12a3b", "Alaa Bachacha")).toBe(true);
    expect(slugMatchesName("https://www.linkedin.com/in/bachacha-design", "Alaa Bachacha")).toBe(true);
    expect(slugMatchesName("https://www.linkedin.com/in/rayan-itani-graphic-designer", "Rayan Itani Graphic Designer")).toBe(true);
  });
  it("ignores accents and rejects someone else's profile", () => {
    expect(slugMatchesName("https://www.linkedin.com/in/rene-aoun", "René Aoun")).toBe(true);
    expect(slugMatchesName("https://www.linkedin.com/in/john-smith-99", "Alaa Bachacha")).toBe(false);
  });
});

describe("LinkedIn lookup", () => {
  it("asks Google search for the person's name, title and employer, leaving out 'Freelance'", () => {
    const body = lookupBody({ fullName: "Nour Haidar", currentTitle: "Illustrator", currentCompany: "Freelance", location: "Beirut, Lebanon" });
    expect(body.tools).toEqual([{ googleSearch: {} }]);
    expect(body.contents[0].parts[0].text).toBe('<person>Nour Haidar, Illustrator, Beirut, Lebanon</person>\nGoogle search to run: "Nour Haidar" Illustrator LinkedIn');
  });

  it("keeps a searched link whose address matches the name", () => {
    const out = readLookup({
      candidates: [{ content: { parts: [{ text: "https://lb.linkedin.com/in/Nour-Haidar-7b2/" }] }, groundingMetadata: { webSearchQueries: ["Nour Haidar illustrator linkedin"] } }],
    }, "Nour Haidar");
    expect(out).toEqual({ url: "https://www.linkedin.com/in/nour-haidar-7b2", searches: 1 });
  });

  it("drops a link that wasn't searched for, belongs to someone else, or is missing", () => {
    const fromMemory = { candidates: [{ content: { parts: [{ text: "https://www.linkedin.com/in/nour-haidar" }] } }] };
    expect(readLookup(fromMemory, "Nour Haidar").url).toBeNull();
    const wrongPerson = { candidates: [{ content: { parts: [{ text: "https://www.linkedin.com/in/sami-khoury" }] }, groundingMetadata: { webSearchQueries: ["q"] } }] };
    expect(readLookup(wrongPerson, "Nour Haidar").url).toBeNull();
    const none = { candidates: [{ content: { parts: [{ text: "NONE" }] }, groundingMetadata: { webSearchQueries: ["q"] } }] };
    expect(readLookup(none, "Nour Haidar")).toEqual({ url: null, searches: 1 });
  });
});
