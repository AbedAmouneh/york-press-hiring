// Sample candidates and demo accounts must never be mailed for real, even with a live Resend key.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const resend = vi.hoisted(() => ({ send: vi.fn(async () => ({ data: { id: "re_1" }, error: null })) }));
vi.mock("resend", () => ({ Resend: class { emails = { send: resend.send }; } }));

import { getDb, schema } from "../../server/db/client.js";
import { hideAuthLinks, isTestAddress, sendEmail } from "../../server/services/email.js";
import { drainEmailQueue } from "../../server/services/outreach.js";

beforeAll(async () => {
  process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "yp-email-"));
  await getDb();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("test addresses", () => {
  it("recognises reserved test domains", () => {
    for (const a of ["rana.haddad@example.com", "x@mail.example.org", "demo.ceo@york-press.test", "a@b.invalid", "dev@localhost"]) {
      expect(isTestAddress(a), a).toBe(true);
    }
  });

  it("leaves real addresses alone", () => {
    for (const a of ["khalil.sayegh@york-press.com", "rana@myexample.com", "someone@testing.io", "x@gmail.com"]) {
      expect(isTestAddress(a), a).toBe(false);
    }
  });
});

describe("invitation links", () => {
  it("sends the real link but logs it hidden", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_live");
    const text = "Set your password here:\nhttps://hiring.test/invite/Abc_123-xyz\n";
    await sendEmail({ kind: "system", to: "new.person@york-press.com", subject: "Invite check", text });
    expect(resend.send).toHaveBeenCalledWith(expect.objectContaining({ text }));
    const db = await getDb();
    const [row] = await db.select().from(schema.emailLog).where(eq(schema.emailLog.subject, "Invite check"));
    expect(row.body).toBe("Set your password here:\nhttps://hiring.test/invite/[hidden]\n");
  });

  it("hides every invitation link in a text", () => {
    expect(hideAuthLinks("a /invite/AAA b /invite/b-c_d")).toBe("a /invite/[hidden] b /invite/[hidden]");
    expect(hideAuthLinks("no links here")).toBe("no links here");
  });
});

describe("with a live Resend key", () => {
  it("really sends to a real address", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_live");
    const res = await sendEmail({ kind: "system", to: "khalil.sayegh@york-press.com", subject: "Hi", text: "Body" });
    expect(res).toMatchObject({ ok: true, mock: false });
    expect(resend.send).toHaveBeenCalledOnce();
  });

  it("keeps demo accounts and sample candidates in the outbox", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_live");
    expect(await sendEmail({ kind: "system", to: "demo.ceo@york-press.test", subject: "Hi", text: "Body" })).toMatchObject({ ok: true, mock: true });
    expect(await sendEmail({ kind: "outreach", to: "someone@realmail.com", subject: "Hi", text: "Body", outboxOnly: true })).toMatchObject({ ok: true, mock: true });
    expect(resend.send).not.toHaveBeenCalled();
  });

  it("never emails a sample candidate from the outreach queue", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_live");
    const db = await getDb();
    const [u] = await db.insert(schema.users).values({ email: "r@york-press.test", name: "Recruiter", roles: ["recruiter"] }).returning();
    const [role] = await db.insert(schema.roleRequests).values({ title: "Editor", department: "Editorial", seniority: "Senior", requesterId: u.id, status: "open", applyToken: "t-email" }).returning();
    const [person] = await db.insert(schema.candidates).values({ fullName: "Sample Person", isSample: true, email: "sample.person@realmail.com" }).returning();
    const [rc] = await db.insert(schema.roleCandidates).values({ requestId: role.id, candidateId: person.id }).returning();
    const [msg] = await db.insert(schema.outreachMessages).values({ roleCandidateId: rc.id, channel: "email", toAddress: "sample.person@realmail.com", subject: "Role", body: "Hello", status: "queued" }).returning();
    const out = await drainEmailQueue();
    expect(out.sent).toBe(1);
    expect(resend.send).not.toHaveBeenCalled();
    const [logged] = await db.select().from(schema.emailLog).where(eq(schema.emailLog.toAddress, "sample.person@realmail.com"));
    expect(logged.mock).toBe(true);
    const [after] = await db.select().from(schema.outreachMessages).where(eq(schema.outreachMessages.id, msg.id));
    expect(after.status).toBe("sent");
  });

  it("cancels a queued email to someone who opted out after it was queued", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_live");
    const db = await getDb();
    const [u] = await db.insert(schema.users).values({ email: "r2@york-press.test", name: "Recruiter Two", roles: ["recruiter"] }).returning();
    const [role] = await db.insert(schema.roleRequests).values({ title: "Editor", department: "Editorial", seniority: "Senior", requesterId: u.id, status: "open", applyToken: "t-optout" }).returning();
    const [person] = await db.insert(schema.candidates).values({ fullName: "Real Person", email: "real.person@realmail.com" }).returning();
    const [rc] = await db.insert(schema.roleCandidates).values({ requestId: role.id, candidateId: person.id }).returning();
    const [msg] = await db.insert(schema.outreachMessages).values({ roleCandidateId: rc.id, channel: "email", toAddress: "real.person@realmail.com", subject: "Role", body: "Hello", status: "queued" }).returning();
    await db.insert(schema.suppressionList).values({ email: "real.person@realmail.com", reason: "opted_out" });
    await drainEmailQueue();
    expect(resend.send).not.toHaveBeenCalled();
    const [after] = await db.select().from(schema.outreachMessages).where(eq(schema.outreachMessages.id, msg.id));
    expect(after.status).toBe("cancelled");
  });
});
