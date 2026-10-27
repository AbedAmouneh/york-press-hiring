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
};

let client: Resend | null = null;

/** Sends through Resend, or records the email in the mock outbox when no key is set. */
export async function sendEmail(input: EmailInput): Promise<{ ok: boolean; id?: string; mock: boolean; error?: string }> {
  const db = await getDb();
  const from = input.from ?? env.emailFrom;
  if (mock.email) {
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
