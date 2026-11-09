// Contacting someone is always a person's decision; the Contact window warns when they were contacted for another
// role recently, and contacting marks them Contacted with a follow-up reminder.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../../server/db/client.js";
import { draftContact, FOLLOW_UP_DAYS, sendContact, undoWhatsapp, whatsappLink, withArticle } from "../../server/services/outreach.js";
import { seedTemplates } from "../../server/services/templates.js";
import { addBusinessDays, localDate } from "../../server/services/dates.js";

beforeAll(async () => {
  process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "yp-repeat-"));
  for (const k of ["ANTHROPIC_API_KEY", "OPENCODE_API_KEY", "GEMINI_API_KEY", "RESEND_API_KEY"]) delete process.env[k];
  await getDb();
  await seedTemplates();
});

async function twoRolesOnePerson(person: Partial<typeof schema.candidates.$inferInsert> = {}) {
  const db = await getDb();
  const [user] = await db.insert(schema.users).values({ email: `r-${Math.random()}@york-press.test`, name: "Rima Recruiter", roles: ["recruiter"] }).returning();
  const role = async (title: string) => (await db.insert(schema.roleRequests).values({ title, department: "Editorial", seniority: "Mid", requesterId: user.id, status: "open", applyToken: `t-${Math.random()}` }).returning())[0];
  const [first, second] = [await role("Editor"), await role("Copy Editor")];
  const [c] = await db.insert(schema.candidates).values({ fullName: "Rana Haddad", email: `rana-${Math.random()}@mail.example`, ...person }).returning();
  const [rcA] = await db.insert(schema.roleCandidates).values({ requestId: first.id, candidateId: c.id }).returning();
  const [rcB] = await db.insert(schema.roleCandidates).values({ requestId: second.id, candidateId: c.id }).returning();
  return { db, user, c, first, second, rcA, rcB };
}

describe("the Contact window's draft", () => {
  it("starts from the template with the person's first name and the sender's name", async () => {
    const { user, c, second, rcB } = await twoRolesOnePerson();
    const d = await draftContact({ rc: rcB, c, request: second }, "email", "first", user);
    expect(d.to).toBe(c.email);
    expect(d.subject).toBe("Copy Editor at York Press");
    expect(d.body).toMatch(/^Hi Rana,/);
    expect(d.body).toContain("Rima Recruiter");
    expect(d.email?.cc).toEqual(["abdulrahman.mansour@york-press.com"]);
  });

  it("warns when they were contacted for another role in the last 30 days", async () => {
    const { db, user, c, second, rcA, rcB } = await twoRolesOnePerson();
    await db.insert(schema.outreachMessages).values({ roleCandidateId: rcA.id, channel: "email", toAddress: "x@mail.example", body: "Hi", status: "sent", sentAt: new Date() });
    const d = await draftContact({ rc: rcB, c, request: second }, "email", "first", user);
    expect(d.recentContact?.roleTitle).toBe("Editor");
  });

  it("doesn't warn after 30 days, or when the earlier message was cancelled", async () => {
    const { db, user, c, second, rcA, rcB } = await twoRolesOnePerson();
    await db.insert(schema.outreachMessages).values({ roleCandidateId: rcA.id, channel: "email", toAddress: "x@mail.example", body: "Hi", status: "sent", queuedAt: new Date(Date.now() - 31 * 864e5) });
    await db.insert(schema.outreachMessages).values({ roleCandidateId: rcA.id, channel: "email", toAddress: "x@mail.example", body: "Hi", status: "cancelled" });
    expect((await draftContact({ rc: rcB, c, request: second }, "email", "first", user)).recentContact).toBeNull();
  });

  it("keeps a LinkedIn draft within 300 characters and adds the apply link to WhatsApp", async () => {
    const { user, c, second, rcB } = await twoRolesOnePerson({ linkedinUrl: "https://www.linkedin.com/in/rana-haddad", phone: "+961 3 123456" });
    expect((await draftContact({ rc: rcB, c, request: second }, "linkedin", "first", user)).body.length).toBeLessThanOrEqual(300);
    const wa = await draftContact({ rc: rcB, c, request: second }, "whatsapp", "first", user);
    expect(wa.to).toBe("9613123456");
    expect(wa.body).toContain(`/apply/${second.applyToken}`);
  });
});

describe("wording", () => {
  it("says 'an' before a title starting with a vowel sound", () => {
    expect(withArticle("We're hiring a Accountant at York Press", "Accountant")).toBe("We're hiring an Accountant at York Press");
    expect(withArticle("I'm hiring a Illustrator", "Illustrator")).toBe("I'm hiring an Illustrator");
    expect(withArticle("We're hiring a Senior Editor", "Senior Editor")).toBe("We're hiring a Senior Editor");
    expect(withArticle("We're hiring a University Liaison", "University Liaison")).toBe("We're hiring a University Liaison");
  });
});

describe("after sending", () => {
  it("marks the person Contacted today with a follow-up in 5 working days", async () => {
    const { db, user, c, second, rcB } = await twoRolesOnePerson();
    await sendContact({ rc: rcB, c, request: second }, { channel: "email", kind: "first", subject: "Hi", body: "Hello Rana, a role for you." }, user);
    const [rc] = await db.select().from(schema.roleCandidates).where(eq(schema.roleCandidates.id, rcB.id));
    expect(rc).toMatchObject({ status: "contacted", dateContacted: localDate(), followUpDate: addBusinessDays(localDate(), FOLLOW_UP_DAYS) });
  });

  it("records WhatsApp as sent with a link that opens the message, and can undo it", async () => {
    const { db, user, c, second, rcB } = await twoRolesOnePerson({ phone: "+44 7700 900123" });
    const { message, link } = await sendContact({ rc: rcB, c, request: second }, { channel: "whatsapp", kind: "first", body: "Hi Rana & co" }, user);
    expect(link).toBe(whatsappLink("447700900123", "Hi Rana & co"));
    expect(link).toContain("Hi%20Rana%20%26%20co");
    await undoWhatsapp(message.id);
    const [rc] = await db.select().from(schema.roleCandidates).where(eq(schema.roleCandidates.id, rcB.id));
    expect(rc).toMatchObject({ status: "new", dateContacted: null, followUpDate: null });
  });

  it("never moves someone further along back to Contacted", async () => {
    const { db, user, c, second, rcB } = await twoRolesOnePerson();
    await db.update(schema.roleCandidates).set({ status: "interview" }).where(eq(schema.roleCandidates.id, rcB.id));
    await sendContact({ rc: rcB, c, request: second }, { channel: "email", kind: "first", subject: "Hi", body: "Hello again, Rana." }, user);
    const [rc] = await db.select().from(schema.roleCandidates).where(eq(schema.roleCandidates.id, rcB.id));
    expect(rc.status).toBe("interview");
  });
});
