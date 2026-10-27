import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "../db/client.js";
import { env } from "../env.js";

/** Placeholders available in every template. */
export const PLACEHOLDERS = [
  "first_name",
  "role_title",
  "personal_line",
  "location_policy",
  "apply_link",
  "data_source",
  "recruiter_name",
  "company",
] as const;

const DEPT_PITCH: Record<string, string> = {
  Editorial: "Our editorial teams publish print and digital learning materials used by more than 50,000 schools.",
  "Product & Technology": "We're building the digital side of York Press, including our York-E learning platform.",
  Finance: "Our finance team supports a publisher that has been educating generations since 1944.",
  Sales: "Our sales team works with schools and ministries of education across the Middle East and beyond.",
  Marketing: "Our marketing team tells the story of products used by teachers and students in more than 50,000 schools.",
  Operations: "Our operations team gets 70 million books a year to the schools that use them.",
  Assessment: "Our assessment team runs programmes such as the Electronic Scholastic Test (EST) and the Academic Baccalaureate.",
  HR: "Our people team supports colleagues across our London and regional offices.",
};

function emailBody(dept: string | null) {
  const pitch = dept ? DEPT_PITCH[dept] ?? "" : "York Press has been educating generations since 1944.";
  return `Hi {{first_name}},

{{personal_line}}

We're hiring a {{role_title}} at York Press ({{location_policy}}). ${pitch} Based on your background, I think you could be a strong fit and I'd love to tell you more.

If you're interested, could you reply with your CV, or upload it here: {{apply_link}}

Best regards,
{{recruiter_name}}
Talent team, York Press

I found your contact details through {{data_source}}. If you'd rather not hear from us, just reply and we'll delete them.`;
}

const LINKEDIN_BODY =
  "Hi {{first_name}}, I'm hiring a {{role_title}} at York Press ({{location_policy}}) and your work at {{company}} stood out. Open to a quick chat? If so, feel free to send me your CV. Thanks, {{recruiter_name}}";

export async function seedTemplates() {
  const db = await getDb();
  const existing = await db.select({ id: schema.outreachTemplates.id }).from(schema.outreachTemplates).limit(1);
  if (existing.length) return;
  const rows: (typeof schema.outreachTemplates.$inferInsert)[] = [
    { name: "Default email", department: null, channel: "email", subject: "{{role_title}} at York Press", body: emailBody(null) },
    { name: "Default LinkedIn note", department: null, channel: "linkedin", body: LINKEDIN_BODY },
  ];
  for (const dept of Object.keys(DEPT_PITCH)) {
    rows.push({ name: `${dept} email`, department: dept, channel: "email", subject: "{{role_title}} at York Press", body: emailBody(dept) });
  }
  await db.insert(schema.outreachTemplates).values(rows);
}

export async function templateFor(channel: "email" | "linkedin", department: string) {
  const db = await getDb();
  const t = schema.outreachTemplates;
  const [specific] = await db.select().from(t).where(and(eq(t.channel, channel), eq(t.department, department), eq(t.active, true))).limit(1);
  if (specific) return specific;
  const [fallback] = await db.select().from(t).where(and(eq(t.channel, channel), isNull(t.department), eq(t.active, true))).limit(1);
  return fallback ?? null;
}

export type FillVars = Partial<Record<(typeof PLACEHOLDERS)[number], string>>;

export function fillTemplate(text: string, vars: FillVars) {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k: string) => (vars as Record<string, string | undefined>)[k] ?? "");
}

export const applyLink = (applyToken: string) => `${env.appUrl}/apply/${applyToken}`;

export function dataSourcePhrase(contactSource: string | null | undefined) {
  if (contactSource === "SignalHire") return "SignalHire, a professional contact database";
  if (contactSource === "PDL") return "People Data Labs, a professional data provider";
  return "your public professional profile";
}
