// Validation rules shared by the API (request parsing) and the React forms (react-hook-form resolver).
import { z } from "zod";
import { CANDIDATE_STATUSES, CRITERIA, CURRENCIES, HM_DECISIONS, ROLES } from "./types.js";

const email = z.email("Enter a valid email address.");
const password = z.string().min(10, "Use at least 10 characters.");
const list = z.array(z.string().trim().min(1)).default([]);
const optionalInt = (max: number) => z.coerce.number<number | string>().int().min(0).max(max).nullable().optional();

// ---------------------------------------------------------------- auth & setup

export const LoginInput = z.object({
  email: z.string().trim().min(1, "Enter your email."),
  password: z.string().min(1, "Enter your password."),
});

export const InvitePasswordInput = z.object({ password });

/** A 6-digit authenticator code, or a recovery code like "abcd-efgh-ijkl". */
export const TwoFactorCodeInput = z.object({ code: z.string().trim().min(6, "Enter the 6-digit code.").max(20) });

export const ManagerInvite = z.object({ name: z.string().trim(), email: z.string().trim(), department: z.string().trim().optional() });

export const SetupInput = z.object({
  adminName: z.string().trim().min(2, "Enter your name."),
  adminEmail: email,
  adminPassword: password,
  ceoName: z.string().trim().min(2, "Enter the CEO's name."),
  ceoEmail: email,
  managers: z.array(ManagerInvite).default([]),
});

// ---------------------------------------------------------------- role requests

export const RequestFields = z.object({
  title: z.string().trim().min(2, "Add a job title."),
  department: z.string().trim().min(1, "Choose a department."),
  seniority: z.string().trim().min(1, "Choose a seniority."),
  headcount: z.coerce.number<number | string>().int().min(1, "At least 1.").max(50, "At most 50.").default(1),
  startDate: z.string().nullable().optional(),
  kind: z.enum(["new", "backfill"]).default("new"),
  jdText: z.string().default(""),
  mustHaves: list,
  niceToHaves: list,
  dealBreakers: list,
  minYears: optionalInt(40),
  idealYears: optionalInt(40),
  languages: list,
  locationPolicy: z.string().trim().default("Remote, global"),
  searchLocations: list,
  timeZone: z.string().nullable().optional(),
  salaryMin: z.coerce.number<number | string>().int().min(0).nullable().optional(),
  salaryMax: z.coerce.number<number | string>().int().min(0).nullable().optional(),
  currency: z.enum(CURRENCIES, "Choose a currency.").nullable().optional(),
  salaryPeriod: z.enum(["year", "month"]).default("year"),
  justification: z.string().default(""),
  targetCompanies: list,
  avoidCompanies: list,
  hiringManagerId: z.uuid().nullable().optional(),
  locationId: z.uuid().nullable().optional(),
  workingHours: z.string().trim().max(200).nullable().optional(),
});

export const RequestInput = RequestFields.refine((r) => r.salaryMin == null || r.salaryMax == null || r.salaryMax >= r.salaryMin, {
  message: "The top of the band must be at least the bottom.",
  path: ["salaryMax"],
}).refine((r) => r.minYears == null || r.idealYears == null || r.idealYears >= r.minYears, {
  message: "Ideal years must be at least the minimum.",
  path: ["idealYears"],
});
export type RequestInputT = z.infer<typeof RequestInput>;

/**
 * Request fields that can be patched: every field optional and no defaults, so a partial edit
 * never resets fields it did not send.
 */
export const RequestPatch = z
  .object(
    Object.fromEntries(
      Object.entries(RequestFields.shape).map(([k, s]) => [k, s instanceof z.ZodDefault ? (s.unwrap() as z.ZodType) : s]),
    ) as { [K in keyof typeof RequestFields.shape]: z.ZodType<z.output<(typeof RequestFields.shape)[K]>> },
  )
  .partial();

/** Longest comment Khalil can leave on a decision. */
export const COMMENT_MAX = 2000;

export const DecisionInput = z.object({
  action: z.enum(["approve", "reject", "request_changes"]),
  comment: z.string().trim().max(COMMENT_MAX, `Keep the comment under ${COMMENT_MAX} characters.`).optional(),
}).refine((d) => d.action === "approve" || !!d.comment, { message: "Add a comment so the manager knows why.", path: ["comment"] });

export const WeightsInput = z
  .object(Object.fromEntries(CRITERIA.map((k) => [k.key, z.number().int().min(0).max(100)])) as Record<(typeof CRITERIA)[number]["key"], z.ZodNumber>)
  .refine((w) => Object.values(w).reduce((a, b) => a + b, 0) === 100, { message: "Weights must add up to 100." });

// ---------------------------------------------------------------- candidates & outreach

export const RoleCandidatePatch = z.object({
  status: z.enum(CANDIDATE_STATUSES).optional(),
  hmDecision: z.enum(HM_DECISIONS).nullable().optional(),
  hmComment: z.string().max(2000, "Keep comments under 2,000 characters.").nullable().optional(),
  followUpDate: z.string().nullable().optional(),
  dateContacted: z.string().nullable().optional(),
});

export const OutreachEdit = z.object({ subject: z.string().optional(), body: z.string().min(5, "The message is too short.") });

export const CV_MAX_BYTES = 4 * 1024 * 1024;
export const CV_TYPES = [
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
] as const;

/** Rules for an uploaded CV, shared by the apply page and the API. */
export function cvProblem(file: { size: number; type: string } | null | undefined): string | null {
  if (!file) return "Please attach your CV.";
  if (file.size > CV_MAX_BYTES) return "The CV must be smaller than 4 MB.";
  if (!(CV_TYPES as readonly string[]).includes(file.type)) return "Please upload a PDF, Word or text file.";
  return null;
}

export const ApplyFields = z.object({
  name: z.string().trim().min(2, "Enter your full name."),
  email,
  linkedin: z.string().trim().optional(),
  note: z.string().max(2000).optional(),
  consent: z.literal(true, "Please agree to the privacy notice so we can process your CV."),
});

// ---------------------------------------------------------------- admin

export const UserInviteInput = z.object({
  name: z.string().trim().min(2, "Enter a name."),
  email,
  roles: z.array(z.enum(ROLES)).min(1, "Pick at least one role."),
  department: z.string().nullable().optional(),
});

export const UserPatch = z.object({
  name: z.string().min(2).optional(),
  email: email.optional(),
  roles: z.array(z.enum(ROLES)).optional(),
  department: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

export const TemplateFields = z.object({
  name: z.string().trim().min(2, "Give the template a name."),
  department: z.string().nullable().optional(),
  channel: z.enum(["email", "linkedin"]),
  subject: z.string().nullable().optional(),
  body: z.string().min(10, "The template body is too short."),
  active: z.boolean().optional(),
});
export const LINKEDIN_NOTE_MAX = 300;
export const TemplateInput = TemplateFields.refine((t) => t.channel !== "linkedin" || t.body.length <= LINKEDIN_NOTE_MAX, {
  message: `LinkedIn notes are limited to ${LINKEDIN_NOTE_MAX} characters (placeholders included).`,
  path: ["body"],
});
export const TemplatePatch = TemplateFields.partial();

export const SettingsPatch = z.object({
  autoSendEnabled: z.boolean().optional(),
  dailySendCap: z.number().int().min(0).max(500).optional(),
  signalhireRevealEnabled: z.boolean().optional(),
  webSearchEnabled: z.boolean().optional(),
  weeklySummaryEnabled: z.boolean().optional(),
  defaultWeights: WeightsInput.optional(),
});

// ---------------------------------------------------------------- saved positions

const items = z.array(z.string().trim().min(1));
const yearsRule = (p: { minYears?: number | null; idealYears?: number | null }) => p.minYears == null || p.idealYears == null || p.idealYears >= p.minYears;
const yearsMessage = { message: "Ideal years should be at least the minimum.", path: ["idealYears"] };

const PositionFields = z.object({
  title: z.string().trim().min(2, "Add a job title.").max(120, "Keep the title under 120 characters."),
  department: z.string().trim().min(1, "Choose a department."),
  seniority: z.string().trim().min(1, "Choose a seniority."),
  mustHaves: items,
  niceToHaves: items,
  languages: items,
  minYears: optionalInt(40),
  idealYears: optionalInt(40),
  jdText: z.string().max(20000, "Keep the job description under 20,000 characters."),
  active: z.boolean(),
});
export const PositionInput = PositionFields.extend({
  mustHaves: items.default([]),
  niceToHaves: items.default([]),
  languages: items.default([]),
  jdText: PositionFields.shape.jdText.default(""),
  active: z.boolean().default(true),
}).refine(yearsRule, yearsMessage);
/** Only the fields sent are changed (no defaults, so a rename doesn't clear the lists). */
export const PositionPatch = PositionFields.partial();
export type PositionInputT = z.output<typeof PositionInput>;

// ---------------------------------------------------------------- hiring locations

const LocationFields = z.object({
  name: z.string().trim().min(2, "Add a name, e.g. Zouk Mosbeh, Lebanon.").max(80),
  country: z.string().trim().min(2, "Add the country."),
  city: z.string().trim().nullable(),
  workArrangement: z.string().trim().min(1, "Choose on-site, hybrid or remote."),
  workingHours: z.string().trim().max(200),
  active: z.boolean(),
});
export const LocationInput = LocationFields.extend({
  city: LocationFields.shape.city.optional().default(null),
  workArrangement: LocationFields.shape.workArrangement.default("On-site"),
  workingHours: LocationFields.shape.workingHours.default(""),
  active: z.boolean().default(true),
});
export const LocationPatch = LocationFields.partial();
