// Outreach goes out from the shared careers address with the recruiter's name; replies reach the recruiter.
import { afterEach, describe, expect, it, vi } from "vitest";
import { fromAddress, senderFor } from "../../server/services/email.js";

afterEach(() => vi.unstubAllEnvs());

describe("outreach sender", () => {
  it("uses the careers address by default", () => {
    vi.stubEnv("EMAIL_FROM", "");
    expect(fromAddress()).toBe("careers@york-press.com");
    expect(senderFor({ name: "Abed Amouneh" })).toBe("Abed Amouneh at York Press <careers@york-press.com>");
  });

  it("takes the address from EMAIL_FROM, with or without a display name", () => {
    vi.stubEnv("EMAIL_FROM", "York Press Careers <jobs@york-press.com>");
    expect(fromAddress()).toBe("jobs@york-press.com");
    vi.stubEnv("EMAIL_FROM", "jobs@york-press.com");
    expect(fromAddress()).toBe("jobs@york-press.com");
  });

  it("drops characters that would break the From header", () => {
    vi.stubEnv("EMAIL_FROM", "");
    expect(senderFor({ name: 'Rana "R" <Haddad>, Jr.' })).toBe("Rana R Haddad Jr. at York Press <careers@york-press.com>");
  });
});
