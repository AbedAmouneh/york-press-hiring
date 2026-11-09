// Outreach is manual: a run finds, scores and ranks people (and looks up the Top 10's contact details), but nothing is
// drafted or sent until a recruiter or the role's hiring manager presses Contact, edits the message and presses Send.
import { and, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { getDb, schema } from "../db/client.js";
import { env } from "../env.js";
import { getSettings } from "./settings.js";
import { fromAddress, sendEmail, senderFor } from "./email.js";
import { applyLink, dataSourcePhrase, fillTemplate, templateFor, type FillVars } from "./templates.js";
import { personalLine } from "./claude.js";
import { addBusinessDays, localDate, startOfLocalDay } from "./dates.js";
import { toAI, toReq } from "./mappers.js";
import { midSentence } from "./wording.js";
import { isSuppressed, unsubscribeLink } from "./suppression.js";
import { LINKEDIN_NOTE_MAX, type ContactChannel, type ContactKind } from "../../shared/schemas.js";

export { isSuppressed };

/** Every outreach email ends with a one-click way to stop contact and delete the person's details. */
export const unsubscribeFooter = (candidateId: string) => `\n\nTo stop hearing from us and have your details deleted: ${unsubscribeLink(candidateId)}`;

/** A reminder to follow up appears this many working days after the first message. */
export const FOLLOW_UP_DAYS = 5;

/** The draft warns when the person was contacted for another role this recently. */
export const RECONTACT_DAYS = 30;

const FOLLOW_UP_EMAIL = `Hi {{first_name}},

I wanted to follow up on my message about the {{role_title}} role at York Press. If you're interested, I'd be glad to tell you more: you can reply with your CV or upload it here: {{apply_link}}

If the timing isn't right, no problem at all.

Best regards,
{{recruiter_name}}
Talent team, York Press`;

const FOLLOW_UP_SHORT = "Hi {{first_name}}, just following up on the {{role_title}} role at York Press. If you're interested I'd love to chat, or you can send your CV here: {{apply_link}} Thanks, {{recruiter_name}}";

/** WhatsApp has no saved template of its own: it starts from the LinkedIn note, plus the apply link and where the number came from. */
const WHATSAPP_EXTRA = "\n\nYou can also send your CV here: {{apply_link}}\n\nI found your number through {{data_source}}. If you'd rather not hear from us, just say so and we'll delete it.";

type Row = { rc: typeof schema.roleCandidates.$inferSelect; c: typeof schema.candidates.$inferSelect; request: typeof schema.roleRequests.$inferSelect };
type Sender = { id: string; name: string; email: string };

/** Where a message to this person goes on each channel, or null when we don't have the address. */
export function contactAddress(c: Row["c"], channel: ContactChannel) {
  if (channel === "email") return c.email ?? null;
  if (channel === "linkedin") return c.linkedinUrl ?? null;
  const digits = (c.phone ?? "").replace(/[^\d]/g, "");
  return digits.length >= 8 ? digits : null;
}

/** "hiring a Accountant" → "hiring an Accountant": templates say "a {{role_title}}". Exported for tests. */
export function withArticle(text: string, title: string) {
  if (!/^[aeiou]/i.test(title.trim()) || /^(uni|use|eu|one)/i.test(title.trim())) return text;
  return text.split(` a ${title}`).join(` an ${title}`);
}

/** wa.me link that opens WhatsApp with the message filled in. */
export const whatsappLink = (phoneDigits: string, text: string) => `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`;

async function cachedPersonalLine({ rc, c, request }: Row) {
  if (rc.personalLine) return rc.personalLine;
  const line = await personalLine(toReq(request), toAI(c, rc)).catch(() => `Your experience as ${c.currentTitle ?? "a professional in your field"} stood out to me.`);
  const db = await getDb();
  await db.update(schema.roleCandidates).set({ personalLine: line }).where(eq(schema.roleCandidates.id, rc.id));
  return line;
}

/** The person's most recent message for another role in the last RECONTACT_DAYS days, if any. */
async function recentContactElsewhere(candidateId: string, roleCandidateId: string) {
  const db = await getDb();
  const m = schema.outreachMessages;
  const [row] = await db
    .select({ roleTitle: schema.roleRequests.title, at: sql<Date>`coalesce(${m.sentAt}, ${m.queuedAt})` })
    .from(m)
    .innerJoin(schema.roleCandidates, eq(schema.roleCandidates.id, m.roleCandidateId))
    .innerJoin(schema.roleRequests, eq(schema.roleRequests.id, schema.roleCandidates.requestId))
    .where(and(
      eq(schema.roleCandidates.candidateId, candidateId),
      ne(m.roleCandidateId, roleCandidateId),
      inArray(m.status, ["approved", "sending", "sent"]),
      gte(m.queuedAt, new Date(Date.now() - RECONTACT_DAYS * 864e5)),
    ))
    .orderBy(desc(m.queuedAt))
    .limit(1);
  return row ? { roleTitle: row.roleTitle, at: new Date(row.at).toISOString() } : null;
}

/** The message the Contact window starts with: the saved template plus Claude's one personal line. */
export async function draftContact(row: Row, channel: ContactChannel, kind: ContactKind, sender: Sender) {
  const { c, rc, request } = row;
  const to = contactAddress(c, channel);
  const vars: FillVars = {
    first_name: c.fullName.split(" ")[0],
    role_title: request.title,
    location_policy: midSentence(request.locationPolicy),
    apply_link: applyLink(request.applyToken),
    data_source: dataSourcePhrase(c.contactSource),
    recruiter_name: sender.name,
    company: c.currentCompany ?? "your company",
  };
  let subject: string | null = null;
  let body: string;
  if (kind === "follow_up") {
    subject = channel === "email" ? `Re: ${request.title} at York Press` : null;
    body = fillTemplate(channel === "email" ? FOLLOW_UP_EMAIL : FOLLOW_UP_SHORT, vars);
  } else {
    vars.personal_line = await cachedPersonalLine(row);
    const template = await templateFor(channel === "email" ? "email" : "linkedin", request.department);
    const text = template?.body ?? "Hi {{first_name}}, I'm hiring a {{role_title}} at York Press and your background stood out. Open to a quick chat? Thanks, {{recruiter_name}}";
    subject = channel === "email" ? fillTemplate(template?.subject ?? "{{role_title}} at York Press", vars) : null;
    body = fillTemplate(channel === "whatsapp" ? text + WHATSAPP_EXTRA : text, vars);
  }
  body = withArticle(body, request.title);
  if (channel === "linkedin") body = body.slice(0, LINKEDIN_NOTE_MAX);
  return {
    channel, kind, to, subject, body,
    recentContact: await recentContactElsewhere(c.id, rc.id),
    // Shown in the window so the sender knows exactly who gets the email and its replies.
    email: channel === "email" ? { from: senderFor(sender), replyTo: [fromAddress(), sender.email], cc: env.outreachCc } : null,
  };
}

/** After a message goes out: Contacted with today's date, and a follow-up reminder (none after the follow-up itself). */
export async function markContacted(roleCandidateId: string, kind: ContactKind = "first") {
  const db = await getDb();
  const today = localDate();
  const rc = schema.roleCandidates;
  if (kind === "follow_up") {
    await db.update(rc).set({ followUpDate: null }).where(eq(rc.id, roleCandidateId));
    return;
  }
  // A later status (replied, interview, hired, rejected) is never pulled back to "contacted".
  await db.update(rc).set({ status: "contacted" }).where(and(eq(rc.id, roleCandidateId), eq(rc.status, "new")));
  await db.update(rc).set({ dateContacted: today, followUpDate: addBusinessDays(today, FOLLOW_UP_DAYS) }).where(eq(rc.id, roleCandidateId));
}

export class ContactError extends Error {}

/**
 * Send (email), queue for Cowork (LinkedIn) or record (WhatsApp, which the person sends from their own phone) one
 * message a person wrote or approved. The pause switch in Settings stops email; there is no daily cap on these.
 */
export async function sendContact(row: Row, input: { channel: ContactChannel; kind: ContactKind; subject?: string | null; body: string }, sender: Sender) {
  const { c, rc, request } = row;
  const db = await getDb();
  if (!["sourcing", "open"].includes(request.status)) throw new ContactError("This role isn't open, so nobody can be contacted for it.");
  if (await isSuppressed(c)) throw new ContactError("This person asked not to be contacted.");
  const to = contactAddress(c, input.channel);
  if (!to) throw new ContactError(input.channel === "email" ? "No email address for this person." : input.channel === "linkedin" ? "No LinkedIn profile for this person." : "No phone number for this person.");
  const body = input.body.trim();
  if (!body) throw new ContactError("The message is empty.");
  if (input.channel === "linkedin" && body.length > LINKEDIN_NOTE_MAX) throw new ContactError(`LinkedIn notes are limited to ${LINKEDIN_NOTE_MAX} characters.`);
  if (input.kind === "follow_up" && !(await db.select({ id: schema.outreachMessages.id }).from(schema.outreachMessages).where(and(eq(schema.outreachMessages.roleCandidateId, rc.id), eq(schema.outreachMessages.status, "sent"))).limit(1)).length) {
    throw new ContactError("Send a first message before a follow-up.");
  }
  const base = { roleCandidateId: rc.id, channel: input.channel, kind: input.kind, senderId: sender.id, toAddress: to, body };

  if (input.channel === "linkedin") {
    // Pressing Send is the approval: it goes straight to "Approved — ready to send" for Cowork.
    const [msg] = await db.insert(schema.outreachMessages).values({ ...base, status: "approved", approvedById: sender.id }).returning();
    return { message: msg, link: null };
  }

  if (input.channel === "whatsapp") {
    const [msg] = await db.insert(schema.outreachMessages).values({ ...base, status: "sent", sentAt: new Date() }).returning();
    await markContacted(rc.id, input.kind);
    return { message: msg, link: whatsappLink(to, body) };
  }

  const settings = await getSettings();
  if (!settings.autoSendEnabled) throw new ContactError("Sending is paused in Settings. Turn it back on to send emails.");
  const subject = input.subject?.trim() || `${request.title} at York Press`;
  const [msg] = await db.insert(schema.outreachMessages).values({ ...base, subject, body: body + unsubscribeFooter(c.id), status: "sending", claimedAt: new Date() }).returning();
  const res = await sendEmail({
    idempotencyKey: `outreach-${msg.id}`,
    listUnsubscribe: unsubscribeLink(c.id),
    kind: "outreach",
    outboxOnly: c.isSample,
    to,
    subject,
    text: msg.body,
    from: senderFor(sender),
    replyTo: [fromAddress(), sender.email],
    cc: env.outreachCc,
  });
  if (!res.ok) {
    await db.update(schema.outreachMessages).set({ status: "failed", error: res.error }).where(eq(schema.outreachMessages.id, msg.id));
    throw new ContactError(`The email couldn't be sent: ${res.error ?? "unknown error"}`);
  }
  const [sent] = await db.update(schema.outreachMessages).set({ status: "sent", sentAt: new Date(), providerMessageId: res.id }).where(eq(schema.outreachMessages.id, msg.id)).returning();
  await markContacted(rc.id, input.kind);
  return { message: sent, link: null };
}

/**
 * Undo a WhatsApp "sent" record when it wasn't actually sent: the message is cancelled and, if it was the only
 * message that made the person Contacted, they go back to New with no contact date or follow-up.
 */
export async function undoWhatsapp(messageId: string) {
  const db = await getDb();
  const m = schema.outreachMessages;
  const [msg] = await db.update(m).set({ status: "cancelled", error: "Undone: not sent." }).where(and(eq(m.id, messageId), eq(m.channel, "whatsapp"), eq(m.status, "sent"))).returning();
  if (!msg) throw new ContactError("Only a WhatsApp message marked as sent can be undone.");
  const [other] = await db.select({ id: m.id }).from(m).where(and(eq(m.roleCandidateId, msg.roleCandidateId), eq(m.status, "sent"))).limit(1);
  if (!other) {
    const rc = schema.roleCandidates;
    await db.update(rc).set({ status: "new", dateContacted: null, followUpDate: null }).where(and(eq(rc.id, msg.roleCandidateId), eq(rc.status, "contacted")));
  }
  return msg;
}

export async function sentTodayCount() {
  const db = await getDb();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.outreachMessages)
    .where(and(eq(schema.outreachMessages.channel, "email"), eq(schema.outreachMessages.status, "sent"), gte(schema.outreachMessages.sentAt, startOfLocalDay())));
  return n;
}
