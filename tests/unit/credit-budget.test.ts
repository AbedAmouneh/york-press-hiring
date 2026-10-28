// The monthly SignalHire limit, checked against a throwaway embedded Postgres.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, schema } from "../../server/db/client.js";
import { creditsAllowed, monthStart, signalhireBudget } from "../../server/services/credit-budget.js";
import { updateSettings } from "../../server/services/settings.js";

describe("creditsAllowed", () => {
  it("has no limit when none is set", () => {
    expect(creditsAllowed(null, 40, 3)).toBe(Infinity);
  });
  it("subtracts spent and held credits", () => {
    expect(creditsAllowed(10, 4, 2)).toBe(4);
  });
  it("never goes below zero", () => {
    expect(creditsAllowed(5, 6, 1)).toBe(0);
  });
  it("a limit of zero stops every reveal", () => {
    expect(creditsAllowed(0, 0, 0)).toBe(0);
  });
});

describe("monthStart", () => {
  it("is the first of the month in UTC", () => {
    expect(monthStart(new Date("2026-10-28T15:00:00Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});

describe("signalhireBudget", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  const key = process.env.SIGNALHIRE_API_KEY;

  beforeAll(async () => {
    process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "yp-credits-"));
    process.env.SIGNALHIRE_API_KEY = "test-key"; // live, so the limit applies
    const db = await getDb();
    const [u] = await db.insert(schema.users).values({ email: "m@york-press.test", name: "Manager", roles: ["manager"] }).returning();
    const [role] = await db.insert(schema.roleRequests).values({ title: "Editor", department: "Editorial", seniority: "Senior", requesterId: u.id, status: "open", applyToken: "t-credits" }).returning();
    const people = await db.insert(schema.candidates).values(Array.from({ length: 6 }, (_, n) => ({ fullName: `Person ${n}` }))).returning();
    const rcs = await db.insert(schema.roleCandidates).values(people.map((p) => ({ requestId: role.id, candidateId: p.id }))).returning();
    const at = (iso: string) => new Date(iso);
    const reveal = (n: number, v: Partial<typeof schema.contactReveals.$inferInsert>) => ({ roleCandidateId: rcs[n].id, candidateId: people[n].id, item: `i${n}`, ...v });
    await db.insert(schema.contactReveals).values([
      reveal(0, { status: "success", creditsUsed: 1, requestedAt: at("2026-10-05T10:00:00Z"), receivedAt: at("2026-10-05T10:01:00Z") }),
      reveal(1, { status: "success", creditsUsed: 1, requestedAt: at("2026-10-19T10:00:00Z"), receivedAt: at("2026-10-19T10:01:00Z") }),
      reveal(2, { status: "failed", creditsUsed: 0, requestedAt: at("2026-10-19T10:00:00Z"), receivedAt: at("2026-10-19T10:01:00Z") }),
      // Last month: not counted.
      reveal(3, { status: "success", creditsUsed: 1, requestedAt: at("2026-09-30T10:00:00Z"), receivedAt: at("2026-09-30T10:01:00Z") }),
      // Still waiting for SignalHire: holds a credit.
      reveal(4, { status: "pending", requestedAt: at("2026-10-20T11:00:00Z") }),
      // Waiting for over a day: no longer holds a credit.
      reveal(5, { status: "pending", requestedAt: at("2026-10-10T11:00:00Z") }),
    ]);
  });
  afterAll(() => {
    if (key === undefined) delete process.env.SIGNALHIRE_API_KEY; else process.env.SIGNALHIRE_API_KEY = key;
  });

  it("is unlimited by default", async () => {
    const b = await signalhireBudget(now);
    expect(b).toMatchObject({ limit: null, spent: 2, held: 1, allowed: Infinity });
  });

  it("counts this month's spent and held credits against the limit", async () => {
    await updateSettings({ signalhireMonthlyLimit: 5 });
    expect((await signalhireBudget(now)).allowed).toBe(2);
    await updateSettings({ signalhireMonthlyLimit: 3 });
    expect((await signalhireBudget(now)).allowed).toBe(0);
  });

  it("never limits sample data", async () => {
    process.env.SIGNALHIRE_API_KEY = "";
    await updateSettings({ signalhireMonthlyLimit: 0 });
    expect((await signalhireBudget(now)).allowed).toBe(Infinity);
    process.env.SIGNALHIRE_API_KEY = "test-key";
  });
});
