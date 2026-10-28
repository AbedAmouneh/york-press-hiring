import { afterEach, describe, expect, it, vi } from "vitest";
import { liveSearch, revealAvailable, searchProviders, skippedProviders } from "../../server/services/providers/select.js";

const names = () => searchProviders().map((p) => p.name);

afterEach(() => vi.unstubAllEnvs());

describe("candidate sources", () => {
  it("uses both sources in sample mode when neither has a key (demo and local)", () => {
    expect(liveSearch()).toBe(false);
    expect(names()).toEqual(["PDL", "SignalHire"]);
    expect(skippedProviders()).toEqual([]);
    expect(revealAvailable()).toBe(true);
  });

  it("skips People Data Labs instead of adding made-up people when only SignalHire is live", () => {
    vi.stubEnv("SIGNALHIRE_API_KEY", "sh-live");
    expect(names()).toEqual(["SignalHire"]);
    expect(skippedProviders().map((p) => p.name)).toEqual(["PDL"]);
    expect(revealAvailable()).toBe(true);
  });

  it("never invents contact details for real people when only People Data Labs is live", () => {
    vi.stubEnv("PDL_API_KEY", "pdl-live");
    expect(names()).toEqual(["PDL"]);
    expect(revealAvailable()).toBe(false);
  });

  it("uses both when both are live", () => {
    vi.stubEnv("PDL_API_KEY", "pdl-live");
    vi.stubEnv("SIGNALHIRE_API_KEY", "sh-live");
    expect(names()).toEqual(["PDL", "SignalHire"]);
    expect(revealAvailable()).toBe(true);
  });
});
