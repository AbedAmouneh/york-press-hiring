// "Forgot password?": a one-hour, single-use emailed link. The stored value and the outbox never hold the link.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "../../server/db/client.js";
import { hashPassword, verifyPassword } from "../../server/auth.js";
import { completeReset, findReset, requestPasswordReset, RESET_TTL_MS } from "../../server/services/password-reset.js";

beforeAll(async () => {
  process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "yp-reset-"));
  await getDb();
});

async function user(tag: string, extra: Partial<typeof schema.users.$inferInsert> = {}) {
  const db = await getDb();
  const [u] = await db.insert(schema.users).values({
    email: `${tag}@york-press.com`, name: "Rana Haddad", roles: ["recruiter"], passwordHash: await hashPassword("old-password-1"), ...extra,
  }).returning();
  return u;
}
const tokenOf = (link?: string) => link!.split("/reset/")[1];
async function lastEmailTo(to: string) {
  const db = await getDb();
  const [row] = await db.select().from(schema.emailLog).where(eq(schema.emailLog.toAddress, to)).orderBy(desc(schema.emailLog.createdAt));
  return row;
}

describe("asking for a reset link", () => {
  it("emails a link, stores only its hash and hides it in the outbox", async () => {
    const u = await user("ask");
    const res = await requestPasswordReset("  ASK@york-press.com ");
    expect(res.sent).toBe("reset");
    const token = tokenOf(res.link);
    const db = await getDb();
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, u.id));
    expect(row.resetTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.resetTokenHash).not.toContain(token);
    expect(row.resetExpiresAt!.getTime() - Date.now()).toBeGreaterThan(RESET_TTL_MS - 60_000);
    const mail = await lastEmailTo(u.email);
    expect(mail.subject).toBe("Reset your York Press Hiring password");
    expect(mail.body).toContain("/reset/[hidden]");
    expect(mail.body).not.toContain(token);
    expect(mail.body).toContain("1 hour");
  });

  it("sends nothing for unknown, demo or switched-off accounts", async () => {
    await user("demo-r", { isDemo: true });
    await user("off-r", { active: false });
    for (const e of ["nobody@york-press.com", "demo-r@york-press.com", "off-r@york-press.com"]) {
      expect((await requestPasswordReset(e)).sent).toBeNull();
      expect(await lastEmailTo(e)).toBeUndefined();
    }
  });

  it("sends a fresh invite to someone who never set a password", async () => {
    const u = await user("invited", { passwordHash: null, roles: ["manager", "hm"], department: "Editorial" });
    const res = await requestPasswordReset(u.email);
    expect(res.sent).toBe("invite");
    expect(res.link).toContain("/invite/");
    const db = await getDb();
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, u.id));
    expect(row.roles).toEqual(["manager", "hm"]);
    expect(row.department).toBe("Editorial");
    expect(row.resetTokenHash).toBeNull();
    expect((await lastEmailTo(u.email)).subject).toBe("You're invited to York Press Hiring");
  });
});

describe("using the link", () => {
  it("sets the password, works once, signs out every session and confirms by email", async () => {
    const u = await user("use");
    const db = await getDb();
    await db.insert(schema.sessions).values({ id: "sess-use-1", userId: u.id, expiresAt: new Date(Date.now() + 864e5) });
    const token = tokenOf((await requestPasswordReset(u.email)).link);
    expect((await findReset(token))?.id).toBe(u.id);

    const done = await completeReset(token, "brand-new-password");
    expect(done?.id).toBe(u.id);
    expect(await verifyPassword("brand-new-password", done!.passwordHash!)).toBe(true);
    expect(await db.select().from(schema.sessions).where(eq(schema.sessions.userId, u.id))).toHaveLength(0);
    expect((await lastEmailTo(u.email)).subject).toBe("Your York Press Hiring password was changed");

    expect(await findReset(token)).toBeNull();
    expect(await completeReset(token, "another-password-1")).toBeNull();
  });

  it("only the newest link works", async () => {
    const u = await user("newest");
    const first = tokenOf((await requestPasswordReset(u.email)).link);
    const second = tokenOf((await requestPasswordReset(u.email)).link);
    expect(await completeReset(first, "brand-new-password")).toBeNull();
    expect((await completeReset(second, "brand-new-password"))?.id).toBe(u.id);
  });

  it("rejects an expired link, a switched-off account and a made-up token", async () => {
    const u = await user("expired");
    const token = tokenOf((await requestPasswordReset(u.email)).link);
    const db = await getDb();
    await db.update(schema.users).set({ resetExpiresAt: new Date(Date.now() - 1000) }).where(eq(schema.users.id, u.id));
    expect(await findReset(token)).toBeNull();
    expect(await completeReset(token, "brand-new-password")).toBeNull();

    const off = await user("switched-off");
    const t2 = tokenOf((await requestPasswordReset(off.email)).link);
    await db.update(schema.users).set({ active: false }).where(eq(schema.users.id, off.id));
    expect(await completeReset(t2, "brand-new-password")).toBeNull();

    expect(await findReset("not-a-real-token")).toBeNull();
  });

  it("leaves two-step login on", async () => {
    const u = await user("mfa", { totpEnabledAt: new Date(), totpSecret: "enc" });
    const token = tokenOf((await requestPasswordReset(u.email)).link);
    const done = await completeReset(token, "brand-new-password");
    expect(done?.totpEnabledAt).toBeTruthy();
    expect(done?.totpSecret).toBe("enc");
  });
});
