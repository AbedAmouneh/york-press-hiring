import { afterEach, describe, expect, it, vi } from "vitest";
import { aiFeatures, env, mock } from "../../server/env.js";
import { clientOptions } from "../../server/services/claude.js";

afterEach(() => vi.unstubAllEnvs());

const keys = (anthropic: string, opencode: string) => {
  vi.stubEnv("ANTHROPIC_API_KEY", anthropic);
  vi.stubEnv("OPENCODE_API_KEY", opencode);
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

  it("prefers OpenCode when its key is set, with a Bearer token and OpenCode's address", () => {
    keys("sk-ant-test", "oc_sk_test");
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

  it("still keeps pull-request previews on sample data", () => {
    keys("", "oc_sk_test");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(mock.claude).toBe(true);
  });
});
