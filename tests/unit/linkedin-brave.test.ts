import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Brave has a key; Gemini is switched per test through this object.
const state = vi.hoisted(() => ({ gemini: false }));
vi.mock("../../server/env.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../server/env.js")>();
  return {
    ...real,
    env: { ...real.env, braveKey: "brave-test-key", geminiKey: "gemini-test-key", geminiModel: "gemini-3.8-flash" },
    mock: { ...real.mock, brave: false, get gemini() { return !state.gemini; } },
  };
});
vi.mock("../../server/services/settings.js", () => ({ logUsage: vi.fn() }));

const finder = await import("../../server/services/linkedin-finder.js");
const { braveQuery, braveTiming, findLinkedinUrl, linkedinLookupAvailable, linkedinLookupVia, readBrave, resetBraveQueue, titleNamesPerson } = finder;

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const brave = (...results: { url: string; title?: string }[]) => reply(200, { web: { results } });
const geminiFound = { steps: [{ type: "google_search_call", arguments: { queries: ["q"] } }, { type: "model_output", content: [{ type: "text", text: "https://www.linkedin.com/in/nour-haidar-7b2" }] }] };
const hosts = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls.map((c) => new URL(String(c[0])).host);

beforeEach(() => { braveTiming.gapMs = 0; braveTiming.retryMs = 0; resetBraveQueue(); state.gemini = false; });
afterEach(() => vi.unstubAllGlobals());

describe("Brave search query and results", () => {
  it("searches LinkedIn profiles for the exact name, title and employer", () => {
    expect(braveQuery({ fullName: "Nour Haidar", currentTitle: "Illustrator", currentCompany: "Acme Press" }))
      .toBe('site:linkedin.com/in "Nour Haidar" Illustrator Acme Press');
    expect(braveQuery({ fullName: "Nour Haidar", currentTitle: "Illustrator", currentCompany: "Self-employed" }))
      .toBe('site:linkedin.com/in "Nour Haidar" Illustrator');
  });

  it("keeps the first profile whose address or title carries the name", () => {
    const res = { web: { results: [
      { url: "https://www.linkedin.com/company/acme", title: "Acme Press | LinkedIn" },
      { url: "https://lb.linkedin.com/in/someone-else", title: "Someone Else - Editor | LinkedIn" },
      { url: "https://www.linkedin.com/in/ab12cd", title: "Nour Haidar - Illustrator - Acme Press | LinkedIn" },
    ] } };
    expect(readBrave(res, "Nour Haidar")).toEqual({ url: "https://www.linkedin.com/in/ab12cd" });
    expect(readBrave({ web: { results: [{ url: "https://www.linkedin.com/in/someone-else", title: "Someone Else" }] } }, "Nour Haidar"))
      .toEqual({ url: null, miss: "name_mismatch" });
    expect(readBrave({ web: { results: [] } }, "Nour Haidar")).toEqual({ url: null, miss: "not_found" });
    expect(readBrave({}, "Nour Haidar")).toEqual({ url: null, miss: "not_found" });
  });

  it("needs both first and last name in a title", () => {
    expect(titleNamesPerson("Nour Haidar - Illustrator | LinkedIn", "Nour Haidar")).toBe(true);
    expect(titleNamesPerson("Nour Khoury - Illustrator | LinkedIn", "Nour Haidar")).toBe(false);
    expect(titleNamesPerson("Zoë Müller | LinkedIn", "Zoe Muller")).toBe(true);
  });
});

describe("LinkedIn lookup order", () => {
  it("uses Brave and doesn't ask Gemini when Brave finds the profile", async () => {
    state.gemini = true;
    const fetch = vi.fn().mockResolvedValueOnce(brave({ url: "https://www.linkedin.com/in/nour-haidar-7b2", title: "Nour Haidar | LinkedIn" }));
    vi.stubGlobal("fetch", fetch);
    expect(await findLinkedinUrl({ fullName: "Nour Haidar" })).toBe("https://www.linkedin.com/in/nour-haidar-7b2");
    expect(hosts(fetch)).toEqual(["api.search.brave.com"]);
    expect((fetch.mock.calls[0][1] as RequestInit).headers).toMatchObject({ "X-Subscription-Token": "brave-test-key" });
  });

  it("asks Gemini when Brave finds nothing or fails", async () => {
    state.gemini = true;
    const fetch = vi.fn()
      .mockResolvedValueOnce(brave())
      .mockResolvedValueOnce(reply(200, geminiFound))
      .mockResolvedValueOnce(reply(401, { error: { detail: "Invalid token" } }))
      .mockResolvedValueOnce(reply(200, geminiFound));
    vi.stubGlobal("fetch", fetch);
    expect(await findLinkedinUrl({ fullName: "Nour Haidar" })).toBe("https://www.linkedin.com/in/nour-haidar-7b2");
    expect(await findLinkedinUrl({ fullName: "Nour Haidar" })).toBe("https://www.linkedin.com/in/nour-haidar-7b2");
    expect(hosts(fetch)).toEqual(["api.search.brave.com", "generativelanguage.googleapis.com", "api.search.brave.com", "generativelanguage.googleapis.com"]);
  });

  it("without Gemini, reports Brave's miss or error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(brave({ url: "https://www.linkedin.com/in/someone-else", title: "Someone Else" })));
    const onMiss = vi.fn();
    expect(await findLinkedinUrl({ fullName: "Nour Haidar" }, null, onMiss)).toBeNull();
    expect(onMiss).toHaveBeenCalledWith("name_mismatch");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(401, { error: { detail: "Invalid token" } })));
    await expect(findLinkedinUrl({ fullName: "Nour Haidar" })).rejects.toThrow("Brave search failed (401): Invalid token");
  });

  it("retries once after a rate limit", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(reply(429, {}))
      .mockResolvedValueOnce(brave({ url: "https://www.linkedin.com/in/nour-haidar", title: "Nour Haidar" }));
    vi.stubGlobal("fetch", fetch);
    expect(await findLinkedinUrl({ fullName: "Nour Haidar" })).toBe("https://www.linkedin.com/in/nour-haidar");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("spaces Brave searches out, even when several start together", async () => {
    braveTiming.gapMs = 120;
    const times: number[] = [];
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => { times.push(Date.now()); return brave(); }));
    await Promise.all([1, 2, 3].map(() => findLinkedinUrl({ fullName: "Nour Haidar" })));
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(90);
    expect(times[2] - times[1]).toBeGreaterThanOrEqual(90);
  });

  it("says which searches run", () => {
    expect(linkedinLookupAvailable()).toBe(true);
    expect(linkedinLookupVia()).toBe("Brave");
    state.gemini = true;
    expect(linkedinLookupVia()).toBe("Brave, then Gemini");
  });
});
