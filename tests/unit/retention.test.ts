// Runs the real deletion queries against a throwaway embedded Postgres.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../../server/db/client.js";
import { previewRetention, retentionCutoff, runRetention } from "../../server/services/retention.js";

const MONTH = 30 * 864e5;
const ago = (months: number) => new Date(Date.now() - months * MONTH);

let ids: Record<string, string> = {};

beforeAll(async () => {
  process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "yp-retention-"));
  const db = await getDb();
  const [u] = await db.insert(schema.users).values({ email: "m@york-press.test", name: "Manager", roles: ["manager"] }).returning();
  const role = (status: string, title: string) => ({ title, department: "Editorial", seniority: "Senior", requesterId: u.id, status, applyToken: `t-${title}` });
  const [closedRole, openRole] = await db.insert(schema.roleRequests).values([role("closed", "Old editor"), role("open", "Live editor")]).returning();
  const person = (fullName: string, at: Date) => ({ fullName, firstSeenAt: at, lastRefreshedAt: at });
  const [stale, recent, inOpenRole, recentlyApplied] = await db.insert(schema.candidates).values([
    person("Stale Person", ago(30)),
    person("Recent Person", ago(3)),
    person("Open Role Person", ago(30)),
    person("Applied Person", ago(30)),
  ]).returning();
  await db.insert(schema.roleCandidates).values([
    { requestId: closedRole.id, candidateId: stale.id, createdAt: ago(30) },
    { requestId: openRole.id, candidateId: inOpenRole.id, createdAt: ago(30) },
  ]);
  const cv = { cvFileName: "cv.txt", cvMime: "text/plain", cvBase64: "aGk=", name: "x", email: "x@example.test" };
  const [oldCv, liveCv, newCv] = await db.insert(schema.applications).values([
    { ...cv, requestId: closedRole.id, createdAt: ago(30) },
    { ...cv, requestId: openRole.id, createdAt: ago(30) },
    { ...cv, requestId: closedRole.id, candidateId: recentlyApplied.id, createdAt: ago(2) },
  ]).returning();
  await db.insert(schema.suppressionList).values({ candidateId: stale.id, email: "stale@example.test", reason: "opted_out", createdAt: ago(30) });
  await db.insert(schema.emailLog).values([
    { toAddress: "a@x.test", fromAddress: "h@york-press.test", subject: "old", body: "b", kind: "outreach", createdAt: ago(30) },
    { toAddress: "a@x.test", fromAddress: "h@york-press.test", subject: "new", body: "b", kind: "outreach", createdAt: ago(1) },
  ]);
  ids = { stale: stale.id, recent: recent.id, inOpenRole: inOpenRole.id, recentlyApplied: recentlyApplied.id, oldCv: oldCv.id, liveCv: liveCv.id, newCv: newCv.id };
});

describe("retention", () => {
  it("cuts off at 24 months", () => {
    expect(retentionCutoff(new Date("2026-10-27T00:00:00Z")).toISOString()).toBe("2024-10-27T00:00:00.000Z");
  });

  it("previews without deleting", async () => {
    expect(await previewRetention()).toMatchObject({ candidates: 1, applications: 1, emailLog: 1 });
    const db = await getDb();
    expect(await db.select().from(schema.candidates).where(eq(schema.candidates.id, ids.stale))).toHaveLength(1);
  });

  it("deletes only data untouched for 24 months that isn't tied to an open role", async () => {
    expect(await runRetention()).toMatchObject({ candidates: 1, applications: 1, emailLog: 1 });
    const db = await getDb();
    const people = (await db.select({ id: schema.candidates.id }).from(schema.candidates)).map((x) => x.id).sort();
    expect(people).toEqual([ids.recent, ids.inOpenRole, ids.recentlyApplied].sort());
    const cvs = (await db.select({ id: schema.applications.id }).from(schema.applications)).map((x) => x.id).sort();
    expect(cvs).toEqual([ids.liveCv, ids.newCv].sort());
    expect(await db.select().from(schema.roleCandidates).where(eq(schema.roleCandidates.candidateId, ids.stale))).toHaveLength(0);
  });

  it("keeps the do-not-contact list", async () => {
    const db = await getDb();
    expect(await db.select().from(schema.suppressionList)).toHaveLength(1);
  });

  it("has nothing left to delete on the next run", async () => {
    expect(await runRetention()).toEqual({ candidates: 0, applications: 0, emailLog: 0, notifications: 0 });
  });
});
