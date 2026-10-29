import { describe, expect, it } from "vitest";
import { geminiBody, readGemini } from "../../server/services/gemini.js";
import { geminiParts } from "../../server/services/claude.js";

describe("Gemini requests", () => {
  it("sends the system prompt, the parts and the JSON schema", () => {
    const body = geminiBody({ system: "Rules", parts: [{ text: "Hi" }], schema: { type: "object" }, maxTokens: 300 });
    expect(body.systemInstruction).toEqual({ parts: [{ text: "Rules" }] });
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: "Hi" }] }]);
    expect(body.generationConfig).toMatchObject({ responseMimeType: "application/json", responseSchema: { type: "object" } });
    expect(body.generationConfig.maxOutputTokens).toBeGreaterThanOrEqual(8192);
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
