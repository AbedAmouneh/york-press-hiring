// Fixed-window counters stored in Postgres, so the limit holds across every Vercel instance.
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, count, eq, gt, inArray, lt } from "drizzle-orm";
import { getDb, schema } from "../db/client.js";

export type Limit = { key: string; max: number; windowMs: number };

export const LOGIN_LIMITS = (email: string, ip: string): Limit[] => [
  { key: `login:email:${email}`, max: 5, windowMs: 15 * 60_000 },
  { key: `login:ip:${ip}`, max: 20, windowMs: 15 * 60_000 },
];
export const MFA_LIMITS = (userId: string): Limit[] => [{ key: `mfa:user:${userId}`, max: 5, windowMs: 15 * 60_000 }];
export const APPLY_LIMITS = (ip: string): Limit[] => [{ key: `apply:ip:${ip}`, max: 5, windowMs: 60 * 60_000 }];
export const INVITE_LIMITS = (ip: string): Limit[] => [{ key: `invite:ip:${ip}`, max: 10, windowMs: 15 * 60_000 }];
/** Each message emails the people on the request, so a burst of them is capped. */
export const MESSAGE_LIMITS = (userId: string): Limit[] => [{ key: `message:user:${userId}`, max: 20, windowMs: 10 * 60_000 }];

/** The caller's IP. On Vercel the platform sets x-real-ip / x-forwarded-for, so clients can't spoof them. */
export function clientIp(c: Context) {
  return c.req.header("x-real-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0].trim() ?? "local";
}

async function hits(l: Limit) {
  const db = await getDb();
  const t = schema.rateLimitHits;
  const [row] = await db.select({ n: count() }).from(t).where(and(eq(t.key, l.key), gt(t.createdAt, new Date(Date.now() - l.windowMs))));
  return row?.n ?? 0;
}

/** Throw 429 if any of the limits is already used up. Does not count this attempt. */
export async function assertWithinLimits(limits: Limit[], message = "Too many attempts. Please wait a few minutes and try again.") {
  for (const l of limits) {
    if ((await hits(l)) >= l.max) throw new HTTPException(429, { message });
  }
}

/** Count one attempt against each limit. */
export async function recordHit(limits: Limit[]) {
  const db = await getDb();
  await db.insert(schema.rateLimitHits).values(limits.map((l) => ({ key: l.key })));
}

/** Forget attempts for these keys (e.g. a successful sign-in clears the email's failures). */
export async function clearHits(keys: string[]) {
  const db = await getDb();
  await db.delete(schema.rateLimitHits).where(inArray(schema.rateLimitHits.key, keys));
}

/** Daily cleanup: nothing needs counters older than a day. */
export async function pruneRateLimits(now = new Date()) {
  const db = await getDb();
  await db.delete(schema.rateLimitHits).where(lt(schema.rateLimitHits.createdAt, new Date(now.getTime() - 864e5)));
}
