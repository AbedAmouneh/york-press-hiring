// Form schemas for react-hook-form. Each one keeps the browser's field shape (text inputs, one item
// per line) and pipes into the shared API schema, so the browser enforces the same rules as the server.
import { z } from "zod";
import { ApplyFields, cvProblem, InvitePasswordInput, ManagerInvite, RequestInput, SetupInput } from "../../shared/schemas";

/** "a\nb\n\nc" → ["a", "b", "c"] */
export const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
/** "a, b ,c" → ["a", "b", "c"] */
export const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(/[^\d]/g, "")));

/** Validate a mapped value with an API schema, reporting its issues on the matching form fields. */
function validateWith<S extends z.ZodType>(schema: S, value: unknown, ctx: z.RefinementCtx): z.output<S> {
  const r = schema.safeParse(value);
  if (r.success) return r.data;
  for (const issue of r.error.issues) ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
  return z.NEVER;
}

// ---------------------------------------------------------------- request form

export const RequestFormFields = z.object({
  title: z.string(),
  department: z.string(),
  seniority: z.string(),
  headcount: z.string(),
  startDate: z.string(),
  kind: z.enum(["new", "backfill"]),
  jdText: z.string(),
  mustHaves: z.string(),
  niceToHaves: z.string(),
  dealBreakers: z.string(),
  minYears: z.string(),
  idealYears: z.string(),
  languages: z.string(),
  locationPolicy: z.string(),
  searchLocations: z.string(),
  timeZone: z.string(),
  salaryMin: z.string(),
  salaryMax: z.string(),
  currency: z.string(),
  salaryPeriod: z.enum(["year", "month"]),
  justification: z.string(),
  targetCompanies: z.string(),
  avoidCompanies: z.string(),
  hiringManagerId: z.string(),
});
export type RequestFormValues = z.input<typeof RequestFormFields>;

const toRequestInput = (f: RequestFormValues) => ({
  title: f.title,
  department: f.department,
  seniority: f.seniority,
  headcount: Number(f.headcount) || 1,
  startDate: f.startDate || null,
  kind: f.kind,
  jdText: f.jdText,
  mustHaves: lines(f.mustHaves),
  niceToHaves: lines(f.niceToHaves),
  dealBreakers: lines(f.dealBreakers),
  minYears: num(f.minYears),
  idealYears: num(f.idealYears),
  languages: csv(f.languages),
  locationPolicy: f.locationPolicy,
  searchLocations: csv(f.searchLocations),
  timeZone: f.timeZone || null,
  salaryMin: num(f.salaryMin),
  salaryMax: num(f.salaryMax),
  currency: f.currency || null,
  salaryPeriod: f.salaryPeriod,
  justification: f.justification,
  targetCompanies: csv(f.targetCompanies),
  avoidCompanies: csv(f.avoidCompanies),
  hiringManagerId: f.hiringManagerId || null,
});

/** All rules run in one pass so every error shows at once: two form-only rules, then the API's. */
export const RequestForm = RequestFormFields.superRefine((f, ctx) => {
  if (!f.currency) ctx.addIssue({ code: "custom", path: ["currency"], message: "Choose a currency." });
  if (!f.justification.trim()) ctx.addIssue({ code: "custom", path: ["justification"], message: "Explain why this role is needed." });
  validateWith(RequestInput, toRequestInput(f), ctx);
}).transform((f) => RequestInput.parse(toRequestInput(f)));

// ---------------------------------------------------------------- first-run setup

export const SetupForm = SetupInput.omit({ managers: true })
  .extend({ managers: z.string() })
  .transform(({ managers, ...rest }, ctx) => {
    const parsed = lines(managers).map((l) => {
      const [name = "", email = "", department] = l.split(",").map((x) => x.trim());
      return { name, email, department };
    });
    for (const m of parsed) {
      if (!ManagerInvite.safeParse(m).success || !z.email().safeParse(m.email).success) {
        ctx.addIssue({ code: "custom", path: ["managers"], message: `Check this line: "${m.name}, ${m.email}". Use: Name, email, Department.` });
        return z.NEVER;
      }
    }
    return { ...rest, managers: parsed };
  });
export type SetupFormValues = z.input<typeof SetupForm>;

// ---------------------------------------------------------------- apply page

export const ApplyForm = ApplyFields.extend({
  cv: z.custom<FileList>().superRefine((files, ctx) => {
    const problem = cvProblem(files?.[0]);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  }),
});
export type ApplyFormValues = z.input<typeof ApplyForm>;

// ---------------------------------------------------------------- invite

export const InviteForm = InvitePasswordInput.extend({ confirm: z.string() }).refine((v) => v.password === v.confirm, {
  message: "The passwords don't match.",
  path: ["confirm"],
});
