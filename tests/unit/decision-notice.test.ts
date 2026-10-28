import { describe, expect, it } from "vitest";
import { decisionNotice } from "../../server/services/decision-notice.js";
import { COMMENT_MAX, DecisionInput } from "../../shared/schemas.js";

describe("decisionNotice", () => {
  it("reads naturally for each decision", () => {
    expect(decisionNotice("request_changes", "Khalil Sayegh", "ELT Editor", "Add the start date.")).toEqual({
      title: "Changes requested: ELT Editor",
      emailBody: "Khalil Sayegh asked for changes to your request for ELT Editor.\n\nKhalil Sayegh's comment:\nAdd the start date.\n\nOpen the request, make the changes and submit it again.",
    });
    expect(decisionNotice("reject", "Khalil Sayegh", "ELT Editor", "No budget.").title).toBe("Rejected: ELT Editor");
    expect(decisionNotice("approve", "Khalil Sayegh", "ELT Editor").emailBody).toBe(
      "Khalil Sayegh approved your request for ELT Editor.\n\nSourcing has started; you'll be notified when candidates are ready.",
    );
  });

  it("treats a comment of only spaces as no comment", () => {
    expect(DecisionInput.safeParse({ action: "reject", comment: "   \n  " }).success).toBe(false);
    expect(DecisionInput.parse({ action: "request_changes", comment: "  Add the owner.  " }).comment).toBe("Add the owner.");
  });

  it("limits how long a decision comment can be", () => {
    expect(DecisionInput.safeParse({ action: "request_changes", comment: "x".repeat(COMMENT_MAX) }).success).toBe(true);
    expect(DecisionInput.safeParse({ action: "request_changes", comment: "x".repeat(COMMENT_MAX + 1) }).success).toBe(false);
  });

  it("keeps the comment's line breaks and leaves out an empty one", () => {
    expect(decisionNotice("request_changes", "K", "T", "Line one\nLine two").emailBody).toContain("comment:\nLine one\nLine two");
    expect(decisionNotice("approve", "K", "T", "   ").emailBody).not.toContain("comment");
  });
});
