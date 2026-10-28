import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkCode, createChallenge, currentCode, decryptSecret, encryptSecret, needsTwoFactorSetup, newRecoveryCodes, newSetup,
  readChallenge, redeemRecoveryCode, twoFactorRequired,
} from "../../server/services/two-factor.js";

const NOW = Date.parse("2026-10-27T12:00:10Z");

describe("who needs two-step login", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is not required unless REQUIRE_TWO_FACTOR is on", () => {
    expect(twoFactorRequired({ roles: ["admin"], isDemo: false, totpEnabledAt: null })).toBe(false);
    expect(needsTwoFactorSetup({ roles: ["ceo"], isDemo: false, totpEnabledAt: null })).toBe(false);
  });

  it("when switched on, is required for admin and CEO, not for other roles or demo accounts", () => {
    vi.stubEnv("REQUIRE_TWO_FACTOR", "true");
    expect(twoFactorRequired({ roles: ["admin", "recruiter"], isDemo: false, totpEnabledAt: null })).toBe(true);
    expect(twoFactorRequired({ roles: ["ceo"], isDemo: false, totpEnabledAt: null })).toBe(true);
    expect(twoFactorRequired({ roles: ["manager"], isDemo: false, totpEnabledAt: null })).toBe(false);
    expect(twoFactorRequired({ roles: ["ceo"], isDemo: true, totpEnabledAt: null })).toBe(false);
  });

  it("asks for setup only until it is on", () => {
    vi.stubEnv("REQUIRE_TWO_FACTOR", "true");
    expect(needsTwoFactorSetup({ roles: ["admin"], isDemo: false, totpEnabledAt: null })).toBe(true);
    expect(needsTwoFactorSetup({ roles: ["admin"], isDemo: false, totpEnabledAt: new Date() })).toBe(false);
  });
});

describe("authenticator codes", () => {
  it("builds an otpauth link and QR code for the app", async () => {
    const s = await newSetup("abed@york-press.com");
    expect(s.uri).toMatch(/^otpauth:\/\/totp\/York%20Press%20Hiring:abed%40york-press.com\?/);
    expect(s.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(s.secret).toMatch(/^[A-Z2-7]{32}$/);
  });

  it("accepts the current code and one step of clock drift", async () => {
    const { secret } = await newSetup("a@b.test");
    expect(checkCode(secret, currentCode(secret, NOW), null, NOW)).not.toBeNull();
    expect(checkCode(secret, currentCode(secret, NOW - 30_000), null, NOW)).not.toBeNull();
    expect(checkCode(secret, currentCode(secret, NOW - 120_000), null, NOW)).toBeNull();
  });

  it("refuses a code that was already used", async () => {
    const { secret } = await newSetup("a@b.test");
    const step = checkCode(secret, currentCode(secret, NOW), null, NOW)!;
    expect(checkCode(secret, currentCode(secret, NOW), step, NOW)).toBeNull();
  });

  it("ignores spaces and refuses anything that isn't 6 digits", async () => {
    const { secret } = await newSetup("a@b.test");
    const code = currentCode(secret, NOW);
    expect(checkCode(secret, `${code.slice(0, 3)} ${code.slice(3)}`, null, NOW)).not.toBeNull();
    expect(checkCode(secret, "12345", null, NOW)).toBeNull();
    expect(checkCode(secret, "abcdef", null, NOW)).toBeNull();
  });

  it("encrypts secrets at rest", () => {
    const stored = encryptSecret("JBSWY3DPEHPK3PXP");
    expect(stored).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptSecret(stored)).toBe("JBSWY3DPEHPK3PXP");
    const [iv, tag, data] = stored.split(".");
    expect(() => decryptSecret([iv, tag, data.slice(0, -2) + "AA"].join("."))).toThrow();
  });
});

describe("recovery codes", () => {
  it("makes 8 single-use codes and stores only hashes", () => {
    const { codes, hashes } = newRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const c of codes) expect(c).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/);
    expect(hashes.some((h) => codes.includes(h))).toBe(false);
    const left = redeemRecoveryCode(hashes, codes[3].toUpperCase().replace(/-/g, " "))!;
    expect(left).toHaveLength(7);
    expect(redeemRecoveryCode(left, codes[3])).toBeNull();
  });
});

describe("sign-in challenge", () => {
  it("proves the password step for 5 minutes", () => {
    const token = createChallenge("user-1", NOW);
    expect(readChallenge(token, NOW + 60_000)).toBe("user-1");
    expect(readChallenge(token, NOW + 6 * 60_000)).toBeNull();
  });

  it("can't be forged or moved to another user", () => {
    const [, expires, sig] = createChallenge("user-1", NOW).split(".");
    expect(readChallenge(`user-2.${expires}.${sig}`, NOW)).toBeNull();
    expect(readChallenge(`user-1.${Number(expires) + 600_000}.${sig}`, NOW)).toBeNull();
    expect(readChallenge(undefined, NOW)).toBeNull();
  });
});
