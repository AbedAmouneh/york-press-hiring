// Errors are saved, shown on role pages and sent to Sentry, so they must never carry an API key.
import { afterEach, describe, expect, it, vi } from "vitest";
import { redactSecrets } from "../../server/env.js";

afterEach(() => vi.unstubAllEnvs());

describe("redactSecrets", () => {
  it("hides a configured key, even one pasted with a space in it", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "abcdEFGH1234_key-part one-more-part-5678");
    const msg = 'Headers.append: "abcdEFGH1234_key-part one-more-part-5678" is an invalid header value.';
    expect(redactSecrets(msg)).toBe('Headers.append: "[hidden]" is an invalid header value.');
  });

  it("hides common key shapes that aren't configured here", () => {
    const text = "keys sk-ant-api03-AbCdEf123456 and AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2 and re_12345678abcdEF and oc_sk_abcdef123 and Bearer abc.def.ghi123";
    const out = redactSecrets(text);
    expect(out).not.toMatch(/sk-ant|AIza|re_1234|oc_sk_|abc\.def/);
    expect(out.match(/\[hidden\]/g)).toHaveLength(5);
  });

  it("keeps the rest of a message readable", () => {
    expect(redactSecrets('"sk-ant-usr-1hDwiXcbc7gY_3Kewi yRirOtr7Lis94sAbRpVE" is an invalid header value.'))
      .toBe('"[hidden]" is an invalid header value.');
    expect(redactSecrets("SignalHire error 402: not enough credits")).toBe("SignalHire error 402: not enough credits");
  });
});
