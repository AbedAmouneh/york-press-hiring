import { afterEach, describe, expect, it, vi } from "vitest";
import { aiFeatures, env, mock } from "../../server/env.js";
import { clientOptions } from "../../server/services/claude.js";

afterEach(() => vi.unstubAllEnvs());

const keys = (anthropic: string, opencode: string, gemini = "") => {
  vi.stubEnv("ANTHROPIC_API_KEY", anthropic);
  vi.stubEnv("OPENCODE_API_KEY", opencode);
  vi.stubEnv("GEMINI_API_KEY", gemini);
  vi.stubEnv("AI_PROVIDER", "");
};

describe("which service answers Claude calls", () => {
  it("runs in mock mode with no key", () => {
    keys("", "");
    expect(env.aiProvider).toBeNull();
    expect(mock.claude).toBe(true);
  });

  it("uses Anthropic directly with only an Anthropic key", () => {
    keys("sk-ant-test", "");
    expect(env.aiProvider).toBe("anthropic");
    expect(clientOptions()).toMatchObject({ apiKey: "sk-ant-test", authToken: null });
    expect(aiFeatures).toMatchObject({ batches: true, webSearch: true });
  });

  it("uses OpenCode when it is the only key, with a Bearer token and OpenCode's address", () => {
    keys("", "oc_sk_test");
    expect(env.aiProvider).toBe("opencode");
    expect(mock.claude).toBe(false);
    expect(clientOptions()).toEqual({ apiKey: null, authToken: "oc_sk_test", baseURL: "https://opencode.ai/inference/anthropic" });
  });

  it("skips Message Batches and web search through OpenCode", () => {
    keys("", "oc_sk_test");
    expect(aiFeatures).toMatchObject({ batches: false, webSearch: false });
  });

  it("lets the OpenCode address be changed, e.g. for OpenCode Go", () => {
    keys("", "oc_sk_test");
    vi.stubEnv("OPENCODE_BASE_URL", "https://opencode.ai/inference/go/anthropic/");
    expect(clientOptions()).toMatchObject({ baseURL: "https://opencode.ai/inference/go/anthropic" });
  });

  it("prefers Anthropic when its key is set alongside the others", () => {
    keys("sk-ant-test", "oc_sk_test", "gm-test");
    expect(env.aiProvider).toBe("anthropic");
    expect(env.aiModel).toBe("claude-sonnet-5-5");
    expect(aiFeatures).toMatchObject({ batches: true, webSearch: true });
  });

  it("uses Gemini when there is no Anthropic key, without batches or web search", () => {
    keys("", "oc_sk_test", "gm-test");
    expect(env.aiProvider).toBe("gemini");
    expect(env.aiModel).toBe("gemini-3.8-flash");
    expect(aiFeatures).toMatchObject({ batches: false, webSearch: false });
  });

  it("lets AI_PROVIDER pick a service whose key is set, and ignores it otherwise", () => {
    keys("sk-ant-test", "oc_sk_test", "gm-test");
    vi.stubEnv("AI_PROVIDER", "gemini");
    expect(env.aiProvider).toBe("gemini");
    keys("", "oc_sk_test", "gm-test");
    vi.stubEnv("AI_PROVIDER", "anthropic");
    expect(env.aiProvider).toBe("gemini");
  });

  it("still keeps pull-request previews on sample data", () => {
    keys("", "oc_sk_test");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(mock.claude).toBe(true);
  });

  it("keeps the Gemini LinkedIn lookup when Claude does the scoring", () => {
    keys("sk-ant-test", "", "gm-test");
    expect(env.aiProvider).toBe("anthropic");
    expect(mock.gemini).toBe(false);
    keys("sk-ant-test", "", "");
    expect(mock.gemini).toBe(true);
  });
});
