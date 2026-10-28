import { Resend } from "resend";
import { getDb, schema } from "../db/client.js";
import { env, mock } from "../env.js";

export type EmailInput = {
  to: string;
  subject: string;
  text: string;
  from?: string; // defaults to EMAIL_FROM
  replyTo?: string;
  kind: "system" | "outreach";
  /** Keep it in the outbox even when Resend is live (sample candidates, test accounts). */
  outboxOnly?: boolean;
};

/** Reserved test domains (RFC 2606/6761) used by sample data and demo accounts: never really mailed. */
const TEST_DOMAIN = /@(?:[^@\s]+\.)?(?:example\.(?:com|net|org)|test|example|invalid|localhost)$/i;
export const isTestAddress = (address: string) => TEST_DOMAIN.test(address.trim());

let client: Resend | null = null;

/** Sends through Resend, or records the email in the outbox when no key is set or it is test data. */
export async function sendEmail(input: EmailInput): Promise<{ ok: boolean; id?: string; mock: boolean; error?: string }> {
  const db = await getDb();
  const from = input.from ?? env.emailFrom;
  // Sample people and demo accounts only ever reach the outbox, so a live Resend key can't bounce
  // mail off made-up addresses and hurt the domain's sender reputation.
  if (mock.email || input.outboxOnly || isTestAddress(input.to)) {
    const [row] = await db
      .insert(schema.emailLog)
      .values({ toAddress: input.to, fromAddress: from, replyTo: input.replyTo, subject: input.subject, body: input.text, kind: input.kind, mock: true })
      .returning({ id: schema.emailLog.id });
    return { ok: true, id: `mock_${row.id}`, mock: true };
  }
  client ??= new Resend(env.resendKey);
  try {
    const res = await client.emails.send({ from, to: input.to, subject: input.subject, text: input.text, replyTo: input.replyTo });
    if (res.error) throw new Error(res.error.message);
    await db.insert(schema.emailLog).values({
      toAddress: input.to, fromAddress: from, replyTo: input.replyTo, subject: input.subject, body: input.text,
      kind: input.kind, mock: false, providerMessageId: res.data?.id,
    });
    await db.insert(schema.usageLog).values({ provider: "resend", action: input.kind, units: 1 });
    return { ok: true, id: res.data?.id, mock: false };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.insert(schema.emailLog).values({
      toAddress: input.to, fromAddress: from, replyTo: input.replyTo, subject: input.subject, body: input.text,
      kind: input.kind, mock: false, status: "failed", error,
    });
    return { ok: false, mock: false, error };
  }
}

/** "Name <address>" for a recruiter, used as the From of outreach emails. */
export const senderFor = (u: { name: string; email: string }) => `${u.name.replace(/[<>"]/g, "")} <${u.email}>`;
