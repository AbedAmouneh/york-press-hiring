// Sample candidates and demo accounts must never be mailed for real, even with a live Resend key, and an outreach
// email only goes out when someone presses Send.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const resend = vi.hoisted(() => ({ send: vi.fn(async () => ({ data: { id: "re_1" }, error: null })) }));
vi.mock("resend", () => ({ Resend: class { emails = { send: resend.send }; } }));

import { getDb, schema } from "../../server/db/client.js";
import { hideAuthLinks, isTestAddress, sendEmail } from "../../server/services/email.js";
import { ContactError, sendContact } from "../../server/services/outreach.js";
import { updateSettings } from "../../server/services/settings.js";

beforeAll(async () => {
  process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "yp-email-"));
  await getDb();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

/** A recruiter, an open role and one person on it, ready to contact. */
async function onePerson(tag: string, person: Partial<typeof schema.candidates.$inferInsert> = {}) {
  const db = await getDb();
  const [user] = await db.insert(schema.users).values({ email: `r-${tag}@york-press.com`, name: "Rima Recruiter", roles: ["recruiter"] }).returning();
  const [request] = await db.insert(schema.roleRequests).values({ title: "Editor", department: "Editorial", seniority: "Senior", requesterId: user.id, status: "open", applyToken: `t-${tag}` }).returning();
  const [c] = await db.insert(schema.candidates).values({ fullName: `Person ${tag}`, email: `p-${tag}@realmail.com`, ...person }).returning();
  const [rc] = await db.insert(schema.roleCandidates).values({ requestId: request.id, candidateId: c.id }).returning();
  return { db, user, row: { rc, c, request } };
}
const email = (body = "Hello, a role at York Press for you.") => ({ channel: "email" as const, kind: "first" as const, subject: "Editor at York Press", body });

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

  it("never emails a sample candidate, even when someone presses Send", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_live");
    const { db, user, row } = await onePerson("sample", { isSample: true, email: "sample.person@realmail.com" });
    const { message } = await sendContact(row, email(), user);
    expect(message.status).toBe("sent");
    expect(resend.send).not.toHaveBeenCalled();
    const [logged] = await db.select().from(schema.emailLog).where(eq(schema.emailLog.toAddress, "sample.person@realmail.com"));
    expect(logged.mock).toBe(true);
  });

  it("refuses to email someone who opted out", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_live");
    const { db, user, row } = await onePerson("optout");
    await db.insert(schema.suppressionList).values({ email: row.c.email, reason: "opted_out" });
    await expect(sendContact(row, email(), user)).rejects.toThrow(ContactError);
    expect(resend.send).not.toHaveBeenCalled();
  });

  it("sends from the sender's name, replies to careers@ and them, copies Abdulrahman, once per message", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_live");
    const { user, row } = await onePerson("headers");
    const { message } = await sendContact(row, email("Hi Person, here is my edited message."), user);
    expect(resend.send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Rima Recruiter at York Press <careers@york-press.com>",
        replyTo: ["careers@york-press.com", "r-headers@york-press.com"],
        cc: ["abdulrahman.mansour@york-press.com"],
        subject: "Editor at York Press",
        text: expect.stringContaining("Hi Person, here is my edited message."),
      }),
      { idempotencyKey: `outreach-${message.id}` },
    );
    expect((resend.send.mock.calls[0] as unknown[])[0]).toMatchObject({ text: expect.stringContaining("/api/public/unsubscribe/") });
  });

  it("records a failed send and says why", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_live");
    resend.send.mockResolvedValueOnce({ data: null, error: { message: "Domain not verified" } } as never);
    const { db, user, row } = await onePerson("fail");
    await expect(sendContact(row, email(), user)).rejects.toThrow(/Domain not verified/);
    const [msg] = await db.select().from(schema.outreachMessages).where(eq(schema.outreachMessages.roleCandidateId, row.rc.id));
    expect(msg.status).toBe("failed");
    const [rc] = await db.select().from(schema.roleCandidates).where(eq(schema.roleCandidates.id, row.rc.id));
    expect(rc.status).toBe("new");
  });
});

describe("pause switch and daily cap", () => {
  it("sends nothing while sending is paused, and sends once it's back on", async () => {
    const { db, user, row } = await onePerson("kill");
    await updateSettings({ autoSendEnabled: false });
    await expect(sendContact(row, email(), user)).rejects.toThrow(/paused/);
    expect(await db.select().from(schema.outreachMessages).where(eq(schema.outreachMessages.roleCandidateId, row.rc.id))).toHaveLength(0);
    await updateSettings({ autoSendEnabled: true });
    expect((await sendContact(row, email(), user)).message.status).toBe("sent");
  });

  it("doesn't hold back an email someone pressed Send on because of the daily cap", async () => {
    await updateSettings({ autoSendEnabled: true, dailySendCap: 0 });
    const { user, row } = await onePerson("cap");
    expect((await sendContact(row, email(), user)).message.status).toBe("sent");
    await updateSettings({ dailySendCap: 30 });
  });

  it("never contacts anyone for a closed role", async () => {
    const { db, user, row } = await onePerson("closed");
    await db.update(schema.roleRequests).set({ status: "closed" }).where(eq(schema.roleRequests.id, row.request.id));
    await expect(sendContact({ ...row, request: { ...row.request, status: "closed" } }, email(), user)).rejects.toThrow(/isn't open/);
  });
});
