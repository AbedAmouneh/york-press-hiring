// Someone already contacted for one role isn't contacted again automatically for another role soon after.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../../server/db/client.js";
import { queueOutreach } from "../../server/services/outreach.js";
import { seedTemplates } from "../../server/services/templates.js";

beforeAll(async () => {
  process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "yp-repeat-"));
  for (const k of ["ANTHROPIC_API_KEY", "OPENCODE_API_KEY", "GEMINI_API_KEY", "RESEND_API_KEY"]) delete process.env[k];
  await getDb();
  await seedTemplates();
});

async function twoRolesOnePerson() {
  const db = await getDb();
  const [u] = await db.insert(schema.users).values({ email: `r-${Math.random()}@york-press.test`, name: "Recruiter", roles: ["recruiter"] }).returning();
  const role = async (title: string) => (await db.insert(schema.roleRequests).values({ title, department: "Editorial", seniority: "Mid", requesterId: u.id, status: "open", applyToken: `t-${Math.random()}` }).returning())[0];
  const [first, second] = [await role("Editor"), await role("Copy Editor")];
  const [person] = await db.insert(schema.candidates).values({ fullName: "Rana Haddad", email: `rana-${Math.random()}@mail.example` }).returning();
  const [rcA] = await db.insert(schema.roleCandidates).values({ requestId: first.id, candidateId: person.id }).returning();
  const [rcB] = await db.insert(schema.roleCandidates).values({ requestId: second.id, candidateId: person.id }).returning();
  return { db, first, second, rcA, rcB };
}

describe("contacting the same person for a second role", () => {
  it("skips someone emailed for another role in the last 30 days", async () => {
    const { db, second, rcA, rcB } = await twoRolesOnePerson();
    await db.insert(schema.outreachMessages).values({ roleCandidateId: rcA.id, channel: "email", toAddress: "x@mail.example", body: "Hi", status: "sent", sentAt: new Date() });
    const q = await queueOutreach(second.id, [rcB.id]);
    expect(q).toMatchObject({ email: 0, recentlyContacted: 1 });
    expect(await db.select().from(schema.outreachMessages).where(eq(schema.outreachMessages.roleCandidateId, rcB.id))).toHaveLength(0);
  });

  it("contacts them again after 30 days, or when the earlier message was cancelled", async () => {
    const { db, second, rcA, rcB } = await twoRolesOnePerson();
    await db.insert(schema.outreachMessages).values({ roleCandidateId: rcA.id, channel: "email", toAddress: "x@mail.example", body: "Hi", status: "sent", queuedAt: new Date(Date.now() - 31 * 864e5) });
    await db.insert(schema.outreachMessages).values({ roleCandidateId: rcA.id, channel: "email", toAddress: "x@mail.example", body: "Hi", status: "cancelled" });
    expect(await queueOutreach(second.id, [rcB.id])).toMatchObject({ email: 1, recentlyContacted: 0 });
  });
});
