// "Forgot password?": an emailed link, valid for an hour and usable once, to choose a new password.
// Only a SHA-256 of the token is stored, and the outbox hides the link, so neither the database nor an admin
// reading sent emails can use it. Demo and switched-off accounts get nothing; someone who never accepted their
// invite gets a fresh invite instead. The caller always answers the same way, so it can't reveal who has an account.
import crypto from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { getDb, schema } from "../db/client.js";
import { canSignIn, hashPassword, randomToken } from "../auth.js";
import { env } from "../env.js";
import { sendEmail } from "./email.js";
import { inviteUser } from "./setup.js";

export const RESET_TTL_MS = 60 * 60_000;

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

/** Sends the reset email (or a fresh invite). Returns what was sent, for tests; callers never show it. */
export async function requestPasswordReset(rawEmail: string): Promise<{ sent: "reset" | "invite" | null; link?: string }> {
  const email = rawEmail.trim().toLowerCase();
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (!u || !u.active || u.isDemo) return { sent: null };
  if (!u.passwordHash) {
    const { link } = await inviteUser({ email: u.email, name: u.name, roles: u.roles, department: u.department });
    return { sent: "invite", link };
  }
  const token = randomToken(24);
  await db.update(schema.users)
    .set({ resetTokenHash: hashToken(token), resetExpiresAt: new Date(Date.now() + RESET_TTL_MS) })
    .where(eq(schema.users.id, u.id));
  const link = `${env.appUrl}/reset/${token}`;
  await sendEmail({
    kind: "system",
    to: u.email,
    subject: "Reset your York Press Hiring password",
    text: `Hi ${u.name.split(" ")[0]},\n\nSomeone asked to reset the password for ${u.email} on York Press Hiring.\n\nChoose a new password here (the link works once, for 1 hour):\n${link}\n\nIf it wasn't you, ignore this email: your password stays the same.\n\nYork Press Hiring`,
  });
  return { sent: "reset", link };
}

/** The account a reset link belongs to, while it is still valid. */
export async function findReset(token: string) {
  const db = await getDb();
  const t = schema.users;
  const [u] = await db.select().from(t).where(and(eq(t.resetTokenHash, hashToken(token)), gt(t.resetExpiresAt, new Date()), eq(t.active, true)));
  return u && canSignIn(u) ? u : null;
}

/**
 * Sets the new password and uses the link up in one statement, so the same link can't work twice. Every session
 * is signed out and the owner is told by email. Two-step login is left as it is. Returns null for a bad link.
 */
export async function completeReset(token: string, password: string) {
  const db = await getDb();
  const t = schema.users;
  const hash = await hashPassword(password);
  const [u] = await db.update(t)
    .set({ passwordHash: hash, mustChangePassword: false, resetTokenHash: null, resetExpiresAt: null })
    .where(and(eq(t.resetTokenHash, hashToken(token)), gt(t.resetExpiresAt, new Date()), eq(t.active, true)))
    .returning();
  if (!u || !canSignIn(u)) return null;
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, u.id));
  await sendEmail({
    kind: "system",
    to: u.email,
    subject: "Your York Press Hiring password was changed",
    text: `Hi ${u.name.split(" ")[0]},\n\nThe password for ${u.email} on York Press Hiring was just changed, and every other device was signed out.\n\nIf this wasn't you, tell your admin straight away.\n\nYork Press Hiring`,
  });
  return u;
}
