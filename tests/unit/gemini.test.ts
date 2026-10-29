import { afterEach, describe, expect, it, vi } from "vitest";
import { geminiBody, geminiModels, geminiStructured, readGemini } from "../../server/services/gemini.js";
import { geminiParts } from "../../server/services/claude.js";

describe("Gemini requests", () => {
  it("sends the system prompt, the parts and the JSON schema", () => {
    const body = geminiBody({ system: "Rules", parts: [{ text: "Hi" }], schema: { type: "object" }, maxTokens: 300 });
    expect(body.systemInstruction).toEqual({ parts: [{ text: "Rules" }] });
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: "Hi" }] }]);
    expect(body.generationConfig).toMatchObject({ responseMimeType: "application/json", responseSchema: { type: "object" } });
    expect(body.generationConfig.maxOutputTokens).toBeGreaterThanOrEqual(8192);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: "low" });
  });

  it("turns Claude content into Gemini parts, shared prefix first, PDFs inline", () => {
    const parts = geminiParts({
      cachedPrefix: "Job request",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: "JVBERi0=" } },
        { type: "text", text: "Score it" },
      ],
    });
    expect(parts).toEqual([
      { text: "Job request" },
      { inlineData: { mimeType: "application/pdf", data: "JVBERi0=" } },
      { text: "Score it" },
    ]);
    expect(geminiParts({ content: "Plain" })).toEqual([{ text: "Plain" }]);
  });
});

describe("when Gemini is busy", () => {
  afterEach(() => vi.unstubAllGlobals());
  const ok = { candidates: [{ content: { parts: [{ text: '{"line":"Hi"}' }] } }] };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
  const call = { system: "s", parts: [{ text: "p" }], schema: { type: "object" } };

  it("tries the chosen model first, then lighter ones, without repeats", () => {
    expect(geminiModels("gemini-3.8-flash")).toEqual(["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"]);
    expect(geminiModels("gemini-3.6-flash")).toEqual(["gemini-3.6-flash", "gemini-3.5-flash-lite"]);
  });

  it("moves to the next model on 'high demand' and returns its answer", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(reply(503, { error: { message: "This model is currently experiencing high demand." } }))
      .mockResolvedValueOnce(reply(200, ok));
    vi.stubGlobal("fetch", fetch);
    const out = await geminiStructured<{ line: string }>(call);
    expect(out.data).toEqual({ line: "Hi" });
    expect(fetch.mock.calls.map((c) => String(c[0]).match(/models\/([^:]+)/)![1])).toEqual(["gemini-3.8-flash", "gemini-3.6-flash"]);
  });

  it("fails straight away on errors a retry can't fix", async () => {
    const fetch = vi.fn().mockResolvedValue(reply(400, { error: { message: "API key not valid" } }));
    vi.stubGlobal("fetch", fetch);
    await expect(geminiStructured(call)).rejects.toThrow("Gemini 400 (gemini-3.8-flash): API key not valid");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("Gemini responses", () => {
  it("reads the JSON answer, skipping thoughts, and the token counts", () => {
    const out = readGemini<{ line: string }>({
      candidates: [{ content: { parts: [{ text: "thinking…", thought: true }, { text: '{"line":"Hello"}' }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 10, thoughtsTokenCount: 5, cachedContentTokenCount: 100 },
    });
    expect(out.data).toEqual({ line: "Hello" });
    expect(out.usage).toEqual({ inputTokens: 120, outputTokens: 15, cacheReadTokens: 100, cacheWriteTokens: 0 });
  });

  it("explains a blocked or empty answer", () => {
    expect(() => readGemini({ promptFeedback: { blockReason: "SAFETY" } })).toThrow("Gemini returned no result (SAFETY)");
    expect(() => readGemini({ candidates: [{ content: { parts: [{ text: '{"cut' }] }, finishReason: "MAX_TOKENS" }] })).toThrow("invalid JSON (MAX_TOKENS)");
  });
});
