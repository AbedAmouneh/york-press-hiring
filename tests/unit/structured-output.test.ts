// Claude answers come back as structured JSON (output_config), because newer models reject a forced tool call.
import { describe, expect, it } from "vitest";
import { readTool, strictSchema } from "../../server/services/claude.js";

const msg = (over: Record<string, unknown>) => ({ content: [], stop_reason: "end_turn", ...over }) as never;

describe("strictSchema", () => {
  it("closes every object and drops constraints the API can't enforce", () => {
    const out = strictSchema({
      type: "object",
      properties: {
        score: { type: "number", minimum: 0, maximum: 100 },
        items: { type: "array", minItems: 3, maxItems: 5, items: { type: "object", properties: { name: { type: "string", maxLength: 9 } } } },
      },
      required: ["score"],
    });
    expect(out).toEqual({
      type: "object",
      additionalProperties: false,
      properties: {
        score: { type: "number" },
        items: { type: "array", items: { type: "object", additionalProperties: false, properties: { name: { type: "string" } } } },
      },
      required: ["score"],
    });
  });

  it("keeps a property that happens to be called like a keyword", () => {
    const out = strictSchema({ type: "object", properties: { maximum: { type: "number" } } }) as { properties: Record<string, unknown> };
    expect(out.properties.maximum).toEqual({ type: "number" });
  });
});

describe("readTool", () => {
  it("parses the JSON text answer", () => {
    expect(readTool(msg({ content: [{ type: "text", text: '{"line":"Hi"}' }] }), "line")).toEqual({ line: "Hi" });
  });

  it("still reads a tool call from an older batch", () => {
    expect(readTool(msg({ content: [{ type: "tool_use", name: "line", input: { line: "Hi" } }] }), "line")).toEqual({ line: "Hi" });
  });

  it("explains a cut-off or declined answer", () => {
    expect(() => readTool(msg({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"li' }] }), "line")).toThrow(/cut off/);
    expect(() => readTool(msg({ stop_reason: "refusal" }), "line")).toThrow(/declined/);
    expect(() => readTool(msg({ content: [{ type: "text", text: "no json" }] }), "line")).toThrow(/no line result/);
  });
});
