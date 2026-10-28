// Automatic deletion of personal data nobody has touched for 24 months (GDPR-style storage limitation).
// Runs from the daily cron. People in a role that is still sourcing or open are always kept.
import { and, eq, exists, gte, inArray, lt, not, or, sql } from "drizzle-orm";
import { getDb, schema } from "../db/client.js";
import { deleteCv } from "./cv-store.js";
import type { RequestStatus } from "../../shared/types.js";

export const RETENTION_MONTHS = 24;
/** Bound each daily run so it fits comfortably in one function call; the rest goes next day. */
const BATCH = 500;
const ACTIVE_ROLE: RequestStatus[] = ["sourcing", "open"];
const FINISHED: RequestStatus[] = ["closed", "rejected"];

export function retentionCutoff(now = new Date()) {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - RETENTION_MONTHS);
  return d;
}

type DB = Awaited<ReturnType<typeof getDb>>;

/** Candidates with no activity since the cutoff and no link to an active role. */
function staleCandidates(db: DB, cutoff: Date) {
  const c = schema.candidates;
  const rc = schema.roleCandidates;
  const r = schema.roleRequests;
  const a = schema.applications;
  const recentOrActiveRole = db
    .select({ x: sql`1` })
    .from(rc)
    .innerJoin(r, eq(r.id, rc.requestId))
    .where(and(eq(rc.candidateId, c.id), or(gte(rc.createdAt, cutoff), inArray(r.status, ACTIVE_ROLE))));
  const recentApplication = db.select({ x: sql`1` }).from(a).where(and(eq(a.candidateId, c.id), gte(a.createdAt, cutoff)));
  return db
    .select({ id: c.id })
    .from(c)
    .where(and(lt(c.lastRefreshedAt, cutoff), lt(c.firstSeenAt, cutoff), not(exists(recentOrActiveRole)), not(exists(recentApplication))))
    .limit(BATCH);
}

/** Applications (CVs) older than the cutoff for roles that are no longer active. */
function staleApplications(db: DB, cutoff: Date) {
  const a = schema.applications;
  const r = schema.roleRequests;
  return db
    .select({ id: a.id, cvBlobPath: a.cvBlobPath, cvBase64: sql<null>`null` })
    .from(a)
    .innerJoin(r, eq(r.id, a.requestId))
    .where(and(lt(a.createdAt, cutoff), not(inArray(r.status, ACTIVE_ROLE))))
    .limit(BATCH);
}

/** Discussion messages older than the cutoff on requests that are finished (closed or rejected). */
function staleMessages(db: DB, cutoff: Date) {
  const m = schema.requestMessages;
  const r = schema.roleRequests;
  return db
    .select({ id: m.id })
    .from(m)
    .innerJoin(r, eq(r.id, m.requestId))
    .where(and(lt(m.createdAt, cutoff), inArray(r.status, FINISHED)))
    .limit(BATCH);
}

export type RetentionCounts = { candidates: number; applications: number; emailLog: number; notifications: number; messages: number };

/** What the next run would delete, without deleting anything (shown in Settings). */
export async function previewRetention(now = new Date()): Promise<RetentionCounts & { cutoff: string }> {
  const db = await getDb();
  const cutoff = retentionCutoff(now);
  const [candidates, applications, messages, [emails], [notes]] = await Promise.all([
    staleCandidates(db, cutoff),
    staleApplications(db, cutoff),
    staleMessages(db, cutoff),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.emailLog).where(lt(schema.emailLog.createdAt, cutoff)),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.notifications).where(lt(schema.notifications.createdAt, cutoff)),
  ]);
  return { cutoff: cutoff.toISOString(), candidates: candidates.length, applications: applications.length, emailLog: emails.n, notifications: notes.n, messages: messages.length };
}

export async function runRetention(now = new Date()): Promise<RetentionCounts> {
  const db = await getDb();
  const cutoff = retentionCutoff(now);

  // CVs first, so their files are removed from Blob before the rows go.
  const apps = await staleApplications(db, cutoff);
  for (const app of apps) await deleteCv(app);
  if (apps.length) await db.delete(schema.applications).where(inArray(schema.applications.id, apps.map((x) => x.id)));

  // Role links, contact reveals and outreach messages cascade with the candidate.
  // The do-not-contact list is kept on purpose, so people who opted out are never contacted again.
  const people = await staleCandidates(db, cutoff);
  if (people.length) await db.delete(schema.candidates).where(inArray(schema.candidates.id, people.map((x) => x.id)));

  // Copies of sent emails and old notifications can name candidates too.
  const emails = await db.delete(schema.emailLog).where(lt(schema.emailLog.createdAt, cutoff)).returning({ id: schema.emailLog.id });
  const notes = await db.delete(schema.notifications).where(lt(schema.notifications.createdAt, cutoff)).returning({ id: schema.notifications.id });

  // Discussions on finished requests name the people who took part.
  const oldMessages = await staleMessages(db, cutoff);
  if (oldMessages.length) await db.delete(schema.requestMessages).where(inArray(schema.requestMessages.id, oldMessages.map((x) => x.id)));

  return { candidates: people.length, applications: apps.length, emailLog: emails.length, notifications: notes.length, messages: oldMessages.length };
}
