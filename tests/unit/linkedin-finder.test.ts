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
  const answer = (text: string, queries: string[] = []) => ({
    steps: [
      ...(queries.length ? [{ type: "google_search_call", arguments: { queries } }] : []),
      { type: "model_output", content: [{ type: "text", text }] },
    ],
  });

  it("asks the Interactions API to run the Google search, leaving out 'Freelance' and storing nothing", () => {
    const body = lookupBody({ fullName: "Nour Haidar", currentTitle: "Illustrator", currentCompany: "Freelance", location: "Beirut, Lebanon" }, "gemini-3.5-flash-lite");
    expect(body).toMatchObject({ model: "gemini-3.5-flash-lite", tools: [{ type: "google_search" }], store: false });
    expect(body.input).toContain("<person>Nour Haidar, Illustrator, Beirut, Lebanon</person>");
    expect(body.input).toContain('Google search to run: "Nour Haidar" Illustrator LinkedIn');
  });

  it("keeps a searched link whose address matches the name", () => {
    expect(readLookup(answer("https://lb.linkedin.com/in/Nour-Haidar-7b2/", ["Nour Haidar illustrator linkedin"]), "Nour Haidar"))
      .toEqual({ url: "https://www.linkedin.com/in/nour-haidar-7b2", searches: 1 });
  });

  it("drops a link that wasn't searched for, belongs to someone else, or is missing", () => {
    expect(readLookup(answer("https://www.linkedin.com/in/nour-haidar"), "Nour Haidar").url).toBeNull();
    expect(readLookup(answer("https://www.linkedin.com/in/sami-khoury", ["q"]), "Nour Haidar").url).toBeNull();
    expect(readLookup(answer("NONE", ["q"]), "Nour Haidar")).toEqual({ url: null, searches: 1 });
  });
});
