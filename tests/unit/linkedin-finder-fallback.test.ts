import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../server/env.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../server/env.js")>();
  return {
    ...real,
    env: { ...real.env, aiProvider: "gemini", geminiKey: "test-key", geminiModel: "gemini-3.8-flash", geminiThinking: "low" },
    mock: { ...real.mock, claude: false, gemini: false },
  };
});
vi.mock("../../server/services/settings.js", () => ({ logUsage: vi.fn() }));

const { findLinkedinUrl, probeLookup } = await import("../../server/services/linkedin-finder.js");

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const found = { steps: [{ type: "google_search_call", arguments: { queries: ["q"] } }, { type: "model_output", content: [{ type: "text", text: "https://www.linkedin.com/in/nour-haidar-7b2" }] }] };
const modelsCalled = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)).model as string);

describe("LinkedIn lookup when a model has no quota", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("tries the next model on 429 and keeps using the one that answered", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(reply(429, { error: { message: "You exceeded your current quota" } }))
      .mockResolvedValueOnce(reply(200, found))
      .mockResolvedValueOnce(reply(200, found));
    vi.stubGlobal("fetch", fetch);
    expect(await findLinkedinUrl({ fullName: "Nour Haidar" })).toBe("https://www.linkedin.com/in/nour-haidar-7b2");
    expect(await findLinkedinUrl({ fullName: "Nour Haidar" })).toBe("https://www.linkedin.com/in/nour-haidar-7b2");
    expect(modelsCalled(fetch)).toEqual(["gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-3.6-flash"]);
  });

  it("asks the next model when one answers without searching, and finds nothing if none searches", async () => {
    const fromMemory = { steps: [{ type: "model_output", content: [{ type: "text", text: "https://www.linkedin.com/in/nour-haidar" }] }] };
    const fetch = vi.fn().mockResolvedValueOnce(reply(200, fromMemory)).mockResolvedValueOnce(reply(200, found));
    vi.stubGlobal("fetch", fetch);
    expect(await findLinkedinUrl({ fullName: "Nour Haidar" })).toBe("https://www.linkedin.com/in/nour-haidar-7b2");
    expect(fetch).toHaveBeenCalledTimes(2);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => reply(200, fromMemory)));
    expect(await findLinkedinUrl({ fullName: "Nour Haidar" })).toBeNull();
  });

  it("moves on to the next model when one doesn't answer in time", async () => {
    const timeout = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    const fetch = vi.fn().mockRejectedValueOnce(timeout).mockResolvedValueOnce(reply(200, found));
    vi.stubGlobal("fetch", fetch);
    expect(await findLinkedinUrl({ fullName: "Nour Haidar" })).toBe("https://www.linkedin.com/in/nour-haidar-7b2");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("names the model and reason when every model fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => reply(429, { error: { message: "You exceeded your current quota" } })));
    await expect(findLinkedinUrl({ fullName: "Nour Haidar" })).rejects.toThrow(/failed on gemini-3\.8-flash \(429\): You exceeded your current quota/);
  });

  it("reports what every model answered for the diagnostics button", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(reply(200, { steps: [{ type: "model_output", content: [{ type: "text", text: "NONE" }] }] }))
      .mockResolvedValueOnce(reply(200, found))
      .mockRejectedValueOnce(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" })));
    const out = await probeLookup({ fullName: "Nour Haidar" });
    expect(out.map((r) => [r.model, r.searches, r.answer.slice(0, 4), r.error ?? null])).toEqual([
      ["gemini-3.5-flash-lite", 0, "NONE", null],
      ["gemini-3.6-flash", 1, "http", null],
      ["gemini-3.8-flash", 0, "", "The operation was aborted due to timeout"],
    ]);
  });
});
