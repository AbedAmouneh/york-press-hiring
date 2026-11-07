import { and, arrayOverlaps, asc, eq, gte, inArray, ne, sql } from "drizzle-orm";
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

/** Create outreach messages (email if we have an address, otherwise LinkedIn) for the given role candidates. */
export async function queueOutreach(requestId: string, roleCandidateIds: string[], runId?: string | null) {
  if (!roleCandidateIds.length) return { email: 0, linkedin: 0, skipped: 0 };
  const db = await getDb();
  const [request] = await db.select().from(schema.roleRequests).where(eq(schema.roleRequests.id, requestId));
  // A closed role never contacts anyone, even if a run that started earlier gets here.
  if (!request || !["sourcing", "open"].includes(request.status)) return { email: 0, linkedin: 0, skipped: roleCandidateIds.length };
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
  let email = 0, linkedin = 0, skipped = 0;
  for (const { rc, c } of rows) {
    if (already.has(rc.id) || (await isSuppressed(c))) { skipped++; continue; }
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
  return { email, linkedin, skipped };
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

/** Send queued emails, respecting the kill switch and the daily cap. */
export async function drainEmailQueue() {
  const settings = await getSettings();
  if (!settings.autoSendEnabled) return { sent: 0, failed: 0, remaining: -1, paused: true };
  const db = await getDb();
  const room = settings.dailySendCap - (await sentTodayCount());
  const queued = await db
    .select()
    .from(schema.outreachMessages)
    .where(and(eq(schema.outreachMessages.channel, "email"), eq(schema.outreachMessages.status, "queued")))
    .orderBy(asc(schema.outreachMessages.queuedAt));
  let sent = 0, failed = 0;
  for (const m of queued.slice(0, Math.max(0, room))) {
    const [sender] = m.senderId ? await db.select().from(schema.users).where(eq(schema.users.id, m.senderId)) : [];
    const [person] = await db
      .select({ id: schema.candidates.id, isSample: schema.candidates.isSample, email: schema.candidates.email, linkedinUrl: schema.candidates.linkedinUrl })
      .from(schema.roleCandidates)
      .innerJoin(schema.candidates, eq(schema.candidates.id, schema.roleCandidates.candidateId))
      .where(eq(schema.roleCandidates.id, m.roleCandidateId));
    // Someone may have opted out after the email was queued: check again right before sending.
    if (!person || (await isSuppressed({ ...person, email: person.email ?? m.toAddress }))) {
      await db.update(schema.outreachMessages).set({ status: "cancelled" }).where(eq(schema.outreachMessages.id, m.id));
      continue;
    }
    const res = await sendEmail({
      listUnsubscribe: unsubscribeLink(person.id),
      kind: "outreach",
      outboxOnly: person?.isSample ?? false,
      to: m.toAddress,
      subject: m.subject ?? "York Press",
      text: m.body,
      from: sender ? senderFor(sender) : undefined,
      replyTo: sender?.email,
    });
    if (res.ok) {
      await db.update(schema.outreachMessages).set({ status: "sent", sentAt: new Date(), providerMessageId: res.id }).where(eq(schema.outreachMessages.id, m.id));
      await markContacted(m.roleCandidateId);
      sent++;
    } else {
      await db.update(schema.outreachMessages).set({ status: "failed", error: res.error }).where(eq(schema.outreachMessages.id, m.id));
      failed++;
    }
  }
  return { sent, failed, remaining: Math.max(0, queued.length - sent - failed), paused: false };
}
