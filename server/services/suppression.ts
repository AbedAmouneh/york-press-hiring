// One place that stops contact with a person: the public unsubscribe link, the do-not-contact list in Settings
// and the outreach queue all go through here, so every path cancels the same messages and deletes the same data.
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { getDb, schema } from "../db/client.js";
import { env } from "../env.js";

const UNSENT = ["queued", "awaiting_approval", "approved"] as const;

export type SuppressInput = { candidateId?: string | null; email?: string | null; linkedinUrl?: string | null; reason: string };

/**
 * Adds the person to the do-not-contact list, cancels every message not yet sent to them (any role, email or
 * LinkedIn) and, when they opted out, deletes their email and phone. People are matched by candidate, email or
 * LinkedIn URL. Running it again for the same person changes nothing. Returns how many messages were cancelled.
 */
export async function suppress(input: SuppressInput) {
  const db = await getDb();
  const c = schema.candidates;
  const email = input.email?.trim().toLowerCase() || null;
  const linkedinUrl = input.linkedinUrl?.trim() || null;
  const match = [
    ...(input.candidateId ? [eq(c.id, input.candidateId)] : []),
    ...(email ? [eq(sql`lower(${c.email})`, email)] : []),
    ...(linkedinUrl ? [eq(c.linkedinUrl, linkedinUrl)] : []),
  ];
  const people = match.length ? await db.select({ id: c.id, email: c.email, linkedinUrl: c.linkedinUrl }).from(c).where(or(...match)) : [];
  const first = people[0];
  const s = schema.suppressionList;
  const entry = {
    candidateId: input.candidateId ?? first?.id ?? null,
    email: email ?? first?.email?.toLowerCase() ?? null,
    linkedinUrl: linkedinUrl ?? first?.linkedinUrl ?? null,
  };
  const already = await db.select({ id: s.id }).from(s).where(and(
    entry.candidateId ? eq(s.candidateId, entry.candidateId) : sql`${s.candidateId} is null`,
    entry.email ? eq(s.email, entry.email) : sql`${s.email} is null`,
    eq(s.reason, input.reason),
  )).limit(1);
  if (!already.length) await db.insert(s).values({ ...entry, reason: input.reason });

  const ids = people.map((p) => p.id);
  if (!ids.length) return { cancelled: 0 };
  const rcIds = db.select({ id: schema.roleCandidates.id }).from(schema.roleCandidates).where(inArray(schema.roleCandidates.candidateId, ids));
  const cancelled = await db
    .update(schema.outreachMessages)
    .set({ status: "cancelled" })
    .where(and(inArray(schema.outreachMessages.roleCandidateId, rcIds), inArray(schema.outreachMessages.status, [...UNSENT])))
    .returning({ id: schema.outreachMessages.id });
  if (input.reason === "opted_out") {
    await db.update(c).set({ email: null, phone: null, contactSource: null, contactRetrievedAt: null }).where(inArray(c.id, ids));
  }
  return { cancelled: cancelled.length };
}

/** True when the person is on the do-not-contact list (by candidate, email or LinkedIn URL). */
export async function isSuppressed(p: { id: string; email: string | null; linkedinUrl: string | null }) {
  const db = await getDb();
  const s = schema.suppressionList;
  const conds = [eq(s.candidateId, p.id)];
  if (p.email) conds.push(eq(s.email, p.email.toLowerCase()));
  if (p.linkedinUrl) conds.push(eq(s.linkedinUrl, p.linkedinUrl));
  const rows = await db.select({ id: s.id }).from(s).where(or(...conds)).limit(1);
  return rows.length > 0;
}

// ---------------------------------------------------------------- unsubscribe links

const sign = (candidateId: string) => createHmac("sha256", env.sessionSecret).update(`unsubscribe:${candidateId}`).digest("base64url").slice(0, 32);

/** A link token that only works for this candidate and can't be guessed from their id. */
export const unsubscribeToken = (candidateId: string) => `${candidateId}.${sign(candidateId)}`;

/** The candidate id inside a valid token, or null. */
export function readUnsubscribeToken(token: string): string | null {
  const [id, mac] = token.split(".");
  if (!id || !mac || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const expected = Buffer.from(sign(id));
  const given = Buffer.from(mac);
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}

export const unsubscribeLink = (candidateId: string) => `${env.appUrl}/api/public/unsubscribe/${unsubscribeToken(candidateId)}`;
