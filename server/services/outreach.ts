import { and, arrayOverlaps, asc, eq, gte, inArray, lt, ne, or, sql } from "drizzle-orm";
import { getDb, schema } from "../db/client.js";
import { getSettings } from "./settings.js";
import { sendEmail, senderFor } from "./email.js";
import { applyLink, dataSourcePhrase, fillTemplate, templateFor } from "./templates.js";
import { personalLine } from "./claude.js";
import { addBusinessDays, localDate, startOfLocalDay } from "./dates.js";
import { toAI, toReq } from "./mappers.js";
import { midSentence } from "./wording.js";
import { isSuppressed, unsubscribeLink } from "./suppression.js";

export { isSuppressed };

/** Every outreach email ends with a one-click way to stop contact and delete the person's details. */
export const unsubscribeFooter = (candidateId: string) => `\n\nTo stop hearing from us and have your details deleted: ${unsubscribeLink(candidateId)}`;

async function senderForRequest(request: typeof schema.roleRequests.$inferSelect) {
  const db = await getDb();
  if (request.recruiterId) {
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, request.recruiterId));
    if (u?.active) return u;
  }
  const [u] = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.active, true), eq(schema.users.isDemo, false), arrayOverlaps(schema.users.roles, ["recruiter"])))
    .orderBy(asc(schema.users.createdAt))
    .limit(1);
  return u ?? null;
}

/** How long after one role's message the same person isn't contacted automatically for another role. */
export const RECONTACT_DAYS = 30;

/** True when the person has a message (queued, waiting or sent) for another role in the last RECONTACT_DAYS days. */
async function contactedRecently(candidateId: string, roleCandidateId: string) {
  const db = await getDb();
  const m = schema.outreachMessages;
  const rows = await db
    .select({ id: m.id })
    .from(m)
    .innerJoin(schema.roleCandidates, eq(schema.roleCandidates.id, m.roleCandidateId))
    .where(and(
      eq(schema.roleCandidates.candidateId, candidateId),
      ne(m.roleCandidateId, roleCandidateId),
      inArray(m.status, ["queued", "awaiting_approval", "approved", "sent"]),
      gte(m.queuedAt, new Date(Date.now() - RECONTACT_DAYS * 864e5)),
    ))
    .limit(1);
  return rows.length > 0;
}

/** Create outreach messages (email if we have an address, otherwise LinkedIn) for the given role candidates. */
export async function queueOutreach(requestId: string, roleCandidateIds: string[], runId?: string | null) {
  if (!roleCandidateIds.length) return { email: 0, linkedin: 0, skipped: 0, recentlyContacted: 0 };
  const db = await getDb();
  const [request] = await db.select().from(schema.roleRequests).where(eq(schema.roleRequests.id, requestId));
  // A closed role never contacts anyone, even if a run that started earlier gets here.
  if (!request || !["sourcing", "open"].includes(request.status)) return { email: 0, linkedin: 0, skipped: roleCandidateIds.length, recentlyContacted: 0 };
  const sender = await senderForRequest(request);
  const rows = await db
    .select({ rc: schema.roleCandidates, c: schema.candidates })
    .from(schema.roleCandidates)
    .innerJoin(schema.candidates, eq(schema.candidates.id, schema.roleCandidates.candidateId))
    .where(inArray(schema.roleCandidates.id, roleCandidateIds));
  const existing = await db
    .select({ rcId: schema.outreachMessages.roleCandidateId })
    .from(schema.outreachMessages)
    .where(and(inArray(schema.outreachMessages.roleCandidateId, roleCandidateIds), ne(schema.outreachMessages.status, "cancelled")));
  const already = new Set(existing.map((e) => e.rcId));
  const emailT = await templateFor("email", request.department);
  const liT = await templateFor("linkedin", request.department);
  let email = 0, linkedin = 0, skipped = 0, recentlyContacted = 0;
  for (const { rc, c } of rows) {
    if (already.has(rc.id) || (await isSuppressed(c))) { skipped++; continue; }
    // Someone we contacted for another role recently isn't contacted again automatically; a recruiter can still do it.
    if (await contactedRecently(c.id, rc.id)) { skipped++; recentlyContacted++; continue; }
    const channel = c.email ? "email" : c.linkedinUrl ? "linkedin" : null;
    const template = channel === "email" ? emailT : liT;
    if (!channel || !template) { skipped++; continue; }
    let line = rc.personalLine;
    if (!line) {
      line = await personalLine(toReq(request), toAI(c, rc), runId).catch(() => `Your experience as ${c.currentTitle ?? "a professional in your field"} stood out to me.`);
      await db.update(schema.roleCandidates).set({ personalLine: line }).where(eq(schema.roleCandidates.id, rc.id));
    }
    const vars = {
      first_name: c.fullName.split(" ")[0],
      role_title: request.title,
      personal_line: line,
      location_policy: midSentence(request.locationPolicy),
      apply_link: applyLink(request.applyToken),
      data_source: dataSourcePhrase(c.contactSource),
      recruiter_name: sender?.name ?? "The York Press talent team",
      company: c.currentCompany ?? "your company",
    };
    await db.insert(schema.outreachMessages).values({
      roleCandidateId: rc.id,
      templateId: template.id,
      channel,
      senderId: sender?.id ?? null,
      toAddress: channel === "email" ? c.email! : c.linkedinUrl!,
      subject: template.subject ? fillTemplate(template.subject, vars) : null,
      body: channel === "linkedin" ? fillTemplate(template.body, vars).slice(0, 300) : fillTemplate(template.body, vars).slice(0, 4800) + unsubscribeFooter(c.id),
      status: channel === "email" ? "queued" : "awaiting_approval",
    });
    if (channel === "email") email++;
    else linkedin++;
  }
  return { email, linkedin, skipped, recentlyContacted };
}

export async function sentTodayCount() {
  const db = await getDb();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.outreachMessages)
    .where(and(eq(schema.outreachMessages.channel, "email"), eq(schema.outreachMessages.status, "sent"), gte(schema.outreachMessages.sentAt, startOfLocalDay())));
  return n;
}

export async function markContacted(roleCandidateId: string) {
  const db = await getDb();
  const today = localDate();
  await db
    .update(schema.roleCandidates)
    .set({ status: "contacted", dateContacted: today, followUpDate: addBusinessDays(today, 5) })
    .where(and(eq(schema.roleCandidates.id, roleCandidateId), eq(schema.roleCandidates.status, "new")));
}

/** A worker that crashed after claiming leaves a message "sending"; after this long it goes back to the queue. */
const STUCK_SENDING_MS = 10 * 60_000;

/**
 * Takes the next queued email for this worker, or null when the queue is empty or today's cap is reached.
 * Claims are made one at a time under a lock on the settings row, so two workers (cron, a run, "Send queued
 * now") can never take the same message or both take the last slot under the cap. Messages being sent count
 * against the cap.
 */
async function claimNext(cap: number) {
  const db = await getDb();
  const m = schema.outreachMessages;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from settings where id = 1 for update`);
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(m)
      .where(and(eq(m.channel, "email"), or(and(eq(m.status, "sent"), gte(m.sentAt, startOfLocalDay())), eq(m.status, "sending"))));
    if (n >= cap) return null;
    const [next] = await tx.select({ id: m.id }).from(m).where(and(eq(m.channel, "email"), eq(m.status, "queued"))).orderBy(asc(m.queuedAt)).limit(1);
    if (!next) return null;
    const [claimed] = await tx.update(m).set({ status: "sending", claimedAt: new Date() }).where(and(eq(m.id, next.id), eq(m.status, "queued"))).returning();
    return claimed ?? null;
  });
}

/** Send queued emails, respecting the kill switch and the daily cap. Safe to run from several places at once. */
export async function drainEmailQueue() {
  const settings = await getSettings();
  if (!settings.autoSendEnabled) return { sent: 0, failed: 0, remaining: -1, paused: true };
  const db = await getDb();
  const om = schema.outreachMessages;
  // Messages a crashed worker left behind are retried with the same idempotency key, so the provider sends once.
  await db.update(om).set({ status: "queued", claimedAt: null }).where(and(eq(om.status, "sending"), lt(om.claimedAt, new Date(Date.now() - STUCK_SENDING_MS))));
  let sent = 0, failed = 0;
  for (let m = await claimNext(settings.dailySendCap); m; m = await claimNext(settings.dailySendCap)) {
    const [sender] = m.senderId ? await db.select().from(schema.users).where(eq(schema.users.id, m.senderId)) : [];
    const [person] = await db
      .select({ id: schema.candidates.id, isSample: schema.candidates.isSample, email: schema.candidates.email, linkedinUrl: schema.candidates.linkedinUrl })
      .from(schema.roleCandidates)
      .innerJoin(schema.candidates, eq(schema.candidates.id, schema.roleCandidates.candidateId))
      .where(eq(schema.roleCandidates.id, m.roleCandidateId));
    // Someone may have opted out after the email was queued: check again right before sending.
    if (!person || (await isSuppressed({ ...person, email: person.email ?? m.toAddress }))) {
      await db.update(om).set({ status: "cancelled", claimedAt: null }).where(eq(om.id, m.id));
      continue;
    }
    const res = await sendEmail({
      idempotencyKey: `outreach-${m.id}`,
      listUnsubscribe: unsubscribeLink(person.id),
      kind: "outreach",
      outboxOnly: person.isSample,
      to: m.toAddress,
      subject: m.subject ?? "York Press",
      text: m.body,
      from: sender ? senderFor(sender) : undefined,
      replyTo: sender?.email,
    });
    if (res.ok) {
      await db.update(om).set({ status: "sent", sentAt: new Date(), providerMessageId: res.id }).where(eq(om.id, m.id));
      await markContacted(m.roleCandidateId);
      sent++;
    } else {
      await db.update(om).set({ status: "failed", error: res.error }).where(eq(om.id, m.id));
      failed++;
    }
  }
  const [{ remaining }] = await db.select({ remaining: sql<number>`count(*)::int` }).from(om).where(and(eq(om.channel, "email"), eq(om.status, "queued")));
  return { sent, failed, remaining, paused: false };
}
