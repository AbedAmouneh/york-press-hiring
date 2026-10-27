import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  create: vi.fn(),
  batchCreate: vi.fn(async () => ({ id: "batch_1" })),
  retrieve: vi.fn(),
  results: vi.fn(),
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: sdk.create, batches: { create: sdk.batchCreate, retrieve: sdk.retrieve, results: sdk.results } };
  },
}));
const logUsage = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../../server/services/settings.js", () => ({ logUsage }));

import { collectScoreBatch, scoreBatch, scoreParams, submitScoreBatch, usageOf, type CandidateForAI } from "../../server/services/claude.js";
import { DEFAULT_WEIGHTS } from "../../shared/types.js";

const req = {
  title: "Senior Editor", department: "Editorial", seniority: "Senior", jdText: "Edit books.", mustHaves: ["Copy editing"], niceToHaves: [],
  dealBreakers: [], minYears: 5, idealYears: 8, languages: ["English"], locationPolicy: "Remote", searchLocations: [], timeZone: null,
  targetCompanies: [], avoidCompanies: [],
};
const cand = (key: string): CandidateForAI => ({ key, currentTitle: "Editor", experience: [], education: [], skills: ["Copy editing"], certifications: [], languages: [] });
const scoreMessage = (keys: string[]) => ({
  content: [{ type: "tool_use", name: "submit_scores", input: { results: keys.map((key) => ({ key, breakdown: { must: 30 }, dealBreakerMissing: false, why: "w", gaps: "g", redFlags: "", relevantYears: 5 })) } }],
  usage: { input_tokens: 200, output_tokens: 300, cache_read_input_tokens: 1800, cache_creation_input_tokens: 0 },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
});

describe("prompt caching", () => {
  it("puts the shared request, scorecard and rules first, marked for caching", () => {
    const content = scoreParams(req, DEFAULT_WEIGHTS, [cand("a")]).messages[0].content as { type: string; text: string; cache_control?: unknown }[];
    expect(content[0].cache_control).toEqual({ type: "ephemeral" });
    expect(content[0].text).toContain("<job_request>");
    expect(content[0].text).toContain("must (Must-have skills / qualifications): 0-35 points");
    expect(content[0].text).not.toContain("<candidate_data>");
    expect(content[1].text).toContain("<candidate_data>");
  });

  it("keeps the cached part identical across batches, so later calls hit the cache", () => {
    const a = scoreParams(req, DEFAULT_WEIGHTS, [cand("a")]);
    const b = scoreParams(req, DEFAULT_WEIGHTS, [cand("b"), cand("c")]);
    expect(b.system).toEqual(a.system);
    expect(b.tools).toEqual(a.tools);
    expect((b.messages[0].content as unknown[])[0]).toEqual((a.messages[0].content as unknown[])[0]);
  });

  it("logs cache reads and writes with the usage", async () => {
    expect(usageOf({ input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 30, cache_creation_input_tokens: null } as never))
      .toEqual({ inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 0 });
    sdk.create.mockResolvedValueOnce(scoreMessage(["a"]));
    const results = await scoreBatch(req, DEFAULT_WEIGHTS, [cand("a")], "run-1");
    expect(results[0].key).toBe("a");
    expect(logUsage).toHaveBeenCalledWith(expect.objectContaining({ action: "score", cacheReadTokens: 1800, inputTokens: 200 }));
  });
});

describe("batch scoring", () => {
  it("sends one request per chunk, keyed by chunk id", async () => {
    expect(await submitScoreBatch(req, DEFAULT_WEIGHTS, [{ id: "chunk-0", items: [cand("a")] }, { id: "chunk-1", items: [cand("b")] }])).toBe("batch_1");
    const { requests } = (sdk.batchCreate.mock.calls[0] as unknown as [{ requests: { custom_id: string; params: { tool_choice: unknown } }[] }])[0];
    expect(requests.map((r) => r.custom_id)).toEqual(["chunk-0", "chunk-1"]);
    expect(requests[0].params.tool_choice).toEqual({ type: "tool", name: "submit_scores" });
  });

  it("reports a batch that is still running", async () => {
    sdk.retrieve.mockResolvedValueOnce({ processing_status: "in_progress" });
    expect(await collectScoreBatch("batch_1")).toEqual({ status: "processing" });
    expect(sdk.results).not.toHaveBeenCalled();
  });

  it("returns scores per chunk and null for chunks that failed", async () => {
    sdk.retrieve.mockResolvedValueOnce({ processing_status: "ended" });
    sdk.results.mockResolvedValueOnce((async function* () {
      yield { custom_id: "chunk-0", result: { type: "succeeded", message: scoreMessage(["a"]) } };
      yield { custom_id: "chunk-1", result: { type: "errored", error: {} } };
      yield { custom_id: "chunk-2", result: { type: "expired" } };
    })());
    const out = await collectScoreBatch("batch_1", "run-1");
    if (out.status !== "ended") throw new Error("expected ended");
    expect(out.results.get("chunk-0")?.[0].key).toBe("a");
    expect(out.results.get("chunk-1")).toBeNull();
    expect(out.results.get("chunk-2")).toBeNull();
    expect(logUsage).toHaveBeenCalledWith(expect.objectContaining({ action: "score_batch" }));
  });
});
