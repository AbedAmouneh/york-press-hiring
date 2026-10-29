import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { getDb, schema } from "./db/client.js";
import { env } from "./env.js";
import type { Role } from "../shared/types.js";
import { needsTwoFactorSetup } from "./services/two-factor.js";

export type SessionUser = typeof schema.users.$inferSelect;
export type AppEnv = { Variables: { user: SessionUser } };

const COOKIE = "yp_session";
const SESSION_DAYS = 14;

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
const sha = (s: string) => crypto.createHmac("sha256", env.sessionSecret).update(s).digest("hex");

export async function createSession(c: Context, userId: string) {
  const db = await getDb();
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db.insert(schema.sessions).values({ id: sha(token), userId, expiresAt });
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "Lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(c: Context) {
  const token = getCookie(c, COOKIE);
  if (token) {
    const db = await getDb();
    await db.delete(schema.sessions).where(eq(schema.sessions.id, sha(token)));
  }
  deleteCookie(c, COOKIE, { path: "/" });
}

export async function currentUser(c: Context): Promise<SessionUser | null> {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  const db = await getDb();
  const rows = await db
    .select({ user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, sha(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  const user = rows[0]?.user;
  return user && canSignIn(user) ? user : null;
}

/** Switched-off accounts can't sign in, and demo accounts only work while DEMO_MODE is on. */
export const canSignIn = (u: { active: boolean; isDemo: boolean }) => u.active && (!u.isDemo || env.demoMode);

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await currentUser(c);
  if (!user) throw new HTTPException(401, { message: "Please sign in." });
  // An account created with a starting password can't be used until its owner picks their own.
  if (user.mustChangePassword) throw new HTTPException(403, { message: "Choose a new password to continue." });
  // Admin and CEO accounts can't use the app until two-step login is on (setup routes are public).
  if (needsTwoFactorSetup(user)) throw new HTTPException(403, { message: "Set up two-step login to continue." });
  c.set("user", user);
  await next();
};

// ---------------------------------------------------------------- two-step login challenge cookie
const MFA_COOKIE = "yp_mfa";

export function setMfaChallenge(c: Context, token: string) {
  setCookie(c, MFA_COOKIE, token, { httpOnly: true, secure: env.isProd, sameSite: "Strict", path: "/api/auth", maxAge: 300 });
}
export const getMfaChallenge = (c: Context) => getCookie(c, MFA_COOKIE);
export const clearMfaChallenge = (c: Context) => deleteCookie(c, MFA_COOKIE, { path: "/api/auth" });

export const hasRole = (user: SessionUser, ...roles: Role[]) => roles.some((r) => user.roles.includes(r));

export function requireRole(c: Context<AppEnv>, ...roles: Role[]) {
  const user = c.get("user");
  if (!hasRole(user, ...roles)) throw new HTTPException(403, { message: "You don't have access to this." });
  return user;
}
