import { describe, expect, it } from "vitest";
import { greeting, stageOf, tasksFor, type HomeRequest } from "../../src/lib/home";

const stats = { screened: 0, contacted: 0, hmYes: 0, hmPending: 0 };
const req = (over: Partial<HomeRequest>): HomeRequest => ({
  id: "r1", code: "R-101", title: "Editor", status: "open", requesterId: "u-manager", hiringManagerId: null, stats, ...over,
});

describe("stageOf", () => {
  it("follows the role from sourcing to outreach", () => {
    expect(stageOf(req({ status: "draft" }))).toBe(0);
    expect(stageOf(req({ status: "sourcing" }))).toBe(2);
    expect(stageOf(req({ status: "open" }))).toBe(3);
    expect(stageOf(req({ status: "open", stats: { ...stats, contacted: 2 } }))).toBe(4);
  });
});

describe("tasksFor", () => {
  it("gives the CEO each submitted request to review", () => {
    const tasks = tasksFor({ id: "ceo", roles: ["ceo"] }, [req({ status: "submitted" }), req({ id: "r2", status: "open" })]);
    expect(tasks.map((t) => t.text)).toEqual(["Review R-101 Editor"]);
  });

  it("asks managers to fix sent-back requests and finish drafts, only their own", () => {
    const tasks = tasksFor({ id: "u-manager", roles: ["manager"] }, [
      req({ status: "changes_requested" }),
      req({ id: "r2", code: "R-102", status: "draft" }),
      req({ id: "r3", code: "R-103", status: "draft", requesterId: "someone-else" }),
    ]);
    expect(tasks.map((t) => t.to)).toEqual(["/requests/r1", "/requests/r2/edit"]);
  });

  it("asks a hiring manager to decide on Top 10 candidates", () => {
    const tasks = tasksFor({ id: "hm", roles: ["hm"] }, [req({ hiringManagerId: "hm", stats: { ...stats, hmPending: 1 } })]);
    expect(tasks[0].text).toBe("Decide on 1 candidate for R-101");
  });

  it("gives recruiters LinkedIn and email work, and nobody else", () => {
    const msgs = [
      { channel: "linkedin", status: "awaiting_approval" },
      { channel: "linkedin", status: "awaiting_approval" },
      { channel: "email", status: "failed" },
    ];
    expect(tasksFor({ id: "rec", roles: ["recruiter"] }, [], msgs).map((t) => t.text)).toEqual(["Approve 2 LinkedIn notes", "Check 1 failed email"]);
    expect(tasksFor({ id: "m", roles: ["manager"] }, [], msgs)).toEqual([]);
  });
});

describe("greeting", () => {
  it("matches the time of day", () => {
    expect(greeting(new Date(2026, 9, 28, 9))).toBe("Good morning");
    expect(greeting(new Date(2026, 9, 28, 14))).toBe("Good afternoon");
    expect(greeting(new Date(2026, 9, 28, 20))).toBe("Good evening");
  });
});
