import { afterEach, describe, expect, it, vi } from "vitest";
import { applyLink, dataSourcePhrase, fillTemplate } from "../../server/services/templates.js";

describe("fillTemplate", () => {
  it("replaces placeholders, with or without spaces inside the braces", () => {
    expect(fillTemplate("Hi {{first_name}}, the {{ role_title }} role.", { first_name: "Rana", role_title: "Editor" })).toBe("Hi Rana, the Editor role.");
  });

  it("leaves nothing behind for unknown or missing placeholders", () => {
    expect(fillTemplate("{{nope}}A{{company}}B", {})).toBe("AB");
  });

  it("does not touch text that only looks similar", () => {
    expect(fillTemplate("{first_name} {{First_Name}}", { first_name: "Rana" })).toBe("{first_name} {{First_Name}}");
  });
});

describe("dataSourcePhrase", () => {
  it("names the provider the contact details came from", () => {
    expect(dataSourcePhrase("SignalHire")).toMatch(/^SignalHire/);
    expect(dataSourcePhrase("PDL")).toMatch(/^People Data Labs/);
    expect(dataSourcePhrase(null)).toBe("your public professional profile");
  });
});

describe("applyLink", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("builds the link from APP_URL without a double slash", () => {
    vi.stubEnv("APP_URL", "https://hire.example.com/");
    expect(applyLink("abc")).toBe("https://hire.example.com/apply/abc");
  });

  it("falls back to the local dev server", () => {
    expect(applyLink("abc")).toBe("http://localhost:5173/apply/abc");
  });
});
