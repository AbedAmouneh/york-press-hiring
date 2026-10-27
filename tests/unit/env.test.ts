import { afterEach, describe, expect, it, vi } from "vitest";
import { env, mock } from "../../server/env.js";

afterEach(() => vi.unstubAllEnvs());

const liveKeys = () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-live");
  vi.stubEnv("PDL_API_KEY", "pdl-live");
  vi.stubEnv("SIGNALHIRE_API_KEY", "sh-live");
  vi.stubEnv("RESEND_API_KEY", "re-live");
};

describe("app URL", () => {
  it("uses APP_URL in production, without a trailing slash", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("APP_URL", "https://hire.york-press.com/");
    expect(env.appUrl).toBe("https://hire.york-press.com");
  });

  it("points a pull-request preview at itself, never at production", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("APP_URL", "https://hire.york-press.com");
    vi.stubEnv("VERCEL_URL", "york-press-hiring-abc123.vercel.app");
    vi.stubEnv("VERCEL_BRANCH_URL", "york-press-hiring-git-feature-york.vercel.app");
    expect(env.appUrl).toBe("https://york-press-hiring-git-feature-york.vercel.app");
  });
});

describe("pull-request previews", () => {
  it("use sample data and the mock outbox even when real keys are present", () => {
    liveKeys();
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(mock).toMatchObject({ claude: true, pdl: true, signalhire: true, email: true });
  });

  it("can opt in to real services explicitly", () => {
    liveKeys();
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("PREVIEW_USE_REAL_SERVICES", "true");
    expect(mock).toMatchObject({ claude: false, pdl: false, signalhire: false, email: false });
  });

  it("don't affect production", () => {
    liveKeys();
    vi.stubEnv("VERCEL_ENV", "production");
    expect(mock).toMatchObject({ claude: false, email: false });
  });
});
