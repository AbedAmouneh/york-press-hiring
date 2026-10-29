import { eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { getDb, schema } from "../db/client.js";
import { env } from "../env.js";
import { hashPassword, randomToken } from "../auth.js";
import { seedTemplates } from "./templates.js";
import { getSettings } from "./settings.js";
import { sendEmail } from "./email.js";
import type { Role } from "../../shared/types.js";

export const DEMO_PASSWORD = "demo-york-2026";

export async function userCount() {
  const db = await getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.users);
  return n;
}

export async function inviteUser(input: { email: string; name: string; roles: Role[]; department?: string | null }, invitedBy?: string) {
  const db = await getDb();
  const email = input.email.trim().toLowerCase();
  const token = randomToken(24);
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  const values = {
    name: input.name.trim(),
    roles: input.roles,
    department: input.department ?? null,
    inviteToken: token,
    inviteExpiresAt: new Date(Date.now() + 14 * 864e5),
  };
  const [user] = existing
    ? await db.update(schema.users).set(values).where(eq(schema.users.id, existing.id)).returning()
    : await db.insert(schema.users).values({ email, ...values }).returning();
  const link = `${env.appUrl}/invite/${token}`;
  await sendEmail({
    kind: "system",
    to: email,
    subject: "You're invited to York Press Hiring",
    text: `Hi ${values.name.split(" ")[0]},\n\n${invitedBy ?? "The York Press talent team"} invited you to York Press Hiring, where we request, approve and review new positions.\n\nSet your password here (link valid for 14 days):\n${link}\n\nYork Press Hiring`,
  });
  return { user, link };
}

/**
 * An admin creates the account directly with a starting password and passes it on themselves. The person
 * must choose their own password at first sign-in. An invited email that never set a password is taken over.
 */
export async function createUserWithPassword(input: { email: string; name: string; roles: Role[]; department?: string | null }, password: string) {
  const db = await getDb();
  const email = input.email.trim().toLowerCase();
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (existing?.passwordHash) throw new HTTPException(409, { message: "Someone with this email already has an account." });
  const values = {
    name: input.name.trim(),
    roles: input.roles,
    department: input.department ?? null,
    passwordHash: await hashPassword(password),
    mustChangePassword: true,
    inviteToken: null,
    inviteExpiresAt: null,
    active: true,
  };
  const [user] = existing
    ? await db.update(schema.users).set(values).where(eq(schema.users.id, existing.id)).returning()
    : await db.insert(schema.users).values({ email, ...values }).returning();
  return user;
}

/** First-run setup: creates Abed as admin + recruiter, invites Khalil and managers, seeds templates and demo users. */
export async function runSetup(input: {
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  ceoName: string;
  ceoEmail: string;
  managers: { name: string; email: string; department?: string }[];
}) {
  const db = await getDb();
  if ((await userCount()) > 0) throw new HTTPException(409, { message: "Setup has already been completed." });
  await getSettings();
  await seedTemplates();
  const [admin] = await db
    .insert(schema.users)
    .values({
      email: input.adminEmail.trim().toLowerCase(),
      name: input.adminName.trim(),
      passwordHash: await hashPassword(input.adminPassword),
      roles: ["admin", "recruiter"],
      department: "HR",
    })
    .returning();
  const invites = [await inviteUser({ email: input.ceoEmail, name: input.ceoName, roles: ["ceo"] }, admin.name)];
  for (const m of input.managers) {
    if (!m.email.trim()) continue;
    invites.push(await inviteUser({ email: m.email, name: m.name || m.email.split("@")[0], roles: ["manager", "hm"], department: m.department ?? null }, admin.name));
  }
  if (env.demoMode) await seedDemoUsers();
  return { admin, invites };
}

export async function seedDemoUsers() {
  const db = await getDb();
  const hash = await hashPassword(DEMO_PASSWORD);
  const demo: { email: string; name: string; roles: Role[]; department: string }[] = [
    { email: "demo.manager@york-press.test", name: "Demo Manager", roles: ["manager", "hm"], department: "Product & Technology" },
    { email: "demo.ceo@york-press.test", name: "Demo CEO", roles: ["ceo"], department: "Leadership" },
    { email: "demo.recruiter@york-press.test", name: "Demo Recruiter", roles: ["recruiter"], department: "HR" },
    { email: "demo.hm@york-press.test", name: "Demo Hiring Manager", roles: ["hm"], department: "Editorial" },
  ];
  for (const d of demo) {
    // DEMO_MODE decides whether demo accounts work, so switching it on brings back any that were switched off
    // (a test copy's database starts from the live one, where they are off).
    await db.insert(schema.users).values({ ...d, passwordHash: hash, isDemo: true })
      .onConflictDoUpdate({ target: schema.users.email, set: { active: true, isDemo: true, passwordHash: hash } });
  }
}

let demoReady: Promise<void> | null = null;

/** With DEMO_MODE on and setup done, make sure the demo accounts exist and work (once per server start). */
export function ensureDemoUsers() {
  if (!env.demoMode) return Promise.resolve();
  demoReady ??= (async () => { if ((await userCount()) > 0) await seedDemoUsers(); })().catch((err) => { demoReady = null; throw err; });
  return demoReady;
}
