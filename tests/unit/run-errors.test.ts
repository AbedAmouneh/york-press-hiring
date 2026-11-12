// Errors a sourcing run stops on are shown on the role page and emailed to recruiters, so they read as plain English.
import { describe, expect, it } from "vitest";
import { runErrorMessage } from "../../server/services/pipeline.js";

describe("runErrorMessage", () => {
  it("says Claude credits ran out and how to carry on", () => {
    const raw = '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}';
    expect(runErrorMessage(raw)).toBe("Claude credits ran out. Add credits at platform.claude.com/settings/billing, then press Continue on the role page.");
  });

  it("explains a rejected key and keeps the original", () => {
    expect(runErrorMessage("401 authentication_error: invalid x-api-key")).toMatch(/^Anthropic rejected the Claude API key.*\(401 authentication_error: invalid x-api-key\)$/);
  });

  it("leaves other errors as they are", () => {
    expect(runErrorMessage("SignalHire timed out")).toBe("SignalHire timed out");
  });
});
