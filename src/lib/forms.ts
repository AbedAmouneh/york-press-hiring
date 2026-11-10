// Form schemas for react-hook-form. Each one keeps the browser's field shape (text inputs, one item
// per line) and pipes into the shared API schema, so the browser enforces the same rules as the server.
import { z } from "zod";
import { EMPLOYMENT_TYPES, isContractWork, PAY_PERIODS } from "../../shared/types";
import { ApplyFields, cvProblem, InvitePasswordInput, LocationInput, ManagerInvite, PositionInput, RequestInput, SetupInput, submitProblems } from "../../shared/schemas";

/** "a\nb\n\nc" → ["a", "b", "c"] */
export const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
/** "a, b ,c" → ["a", "b", "c"] */
export const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
/**
 * "2,500" → 2500, "2.5" → 2.5, "" → null. Anything else becomes NaN so the schema reports it, instead of digits being
 * pulled out of it ("2.5 years" used to become 25).
 */
const num = (s: string) => {
  const t = s.trim().replace(/[\s,]/g, "");
  return t === "" ? null : Number(t);
};

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
  employmentType: z.enum(EMPLOYMENT_TYPES),
  salaryPeriod: z.enum(PAY_PERIODS),
  hoursPerWeek: z.string(),
  contractLength: z.string(),
  workload: z.string(),
  projectDescription: z.string(),
  justification: z.string(),
  targetCompanies: z.string(),
  avoidCompanies: z.string(),
  hiringManagerId: z.string(),
  locationId: z.string(),
  workingHours: z.string(),
  /** One university per line (names can contain commas). */
  universities: z.string(),
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
  employmentType: f.employmentType,
  salaryPeriod: f.salaryPeriod,
  // Details that belong to another type are dropped, so switching type never leaves stale ones behind.
  hoursPerWeek: f.employmentType === "part_time" ? num(f.hoursPerWeek) : null,
  contractLength: isContractWork(f.employmentType) ? f.contractLength.trim() || null : null,
  workload: isContractWork(f.employmentType) ? f.workload.trim() || null : null,
  projectDescription: isContractWork(f.employmentType) ? f.projectDescription.trim() || null : null,
  justification: f.justification,
  targetCompanies: csv(f.targetCompanies),
  avoidCompanies: csv(f.avoidCompanies),
  hiringManagerId: f.hiringManagerId || null,
  locationId: f.locationId || null,
  workingHours: f.workingHours.trim() || null,
  universities: lines(f.universities),
});

/** All rules run in one pass so every error shows at once: three form-only rules, then the API's. */
export const RequestForm = RequestFormFields.superRefine((f, ctx) => {
  for (const p of submitProblems(f)) ctx.addIssue({ code: "custom", path: [p.path], message: p.message });
  validateWith(RequestInput, toRequestInput(f), ctx);
}).transform((f) => RequestInput.parse(toRequestInput(f)));

/** Saving a draft only needs what the API needs (a title, valid numbers); location, budget and reason can wait. */
export const RequestDraftForm = RequestFormFields.superRefine((f, ctx) => {
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

// ---------------------------------------------------------------- saved positions (Settings)

export const PositionFormFields = z.object({
  title: z.string(),
  department: z.string(),
  seniority: z.string(),
  mustHaves: z.string(),
  niceToHaves: z.string(),
  languages: z.string(),
  minYears: z.string(),
  idealYears: z.string(),
  jdText: z.string(),
  /** "" = no usual type / pay basis. */
  employmentType: z.string(),
  salaryPeriod: z.string(),
  active: z.boolean(),
});
export type PositionFormValues = z.input<typeof PositionFormFields>;

const toPositionInput = (f: PositionFormValues) => ({
  title: f.title,
  department: f.department,
  seniority: f.seniority,
  mustHaves: lines(f.mustHaves),
  niceToHaves: lines(f.niceToHaves),
  languages: csv(f.languages),
  minYears: num(f.minYears),
  idealYears: num(f.idealYears),
  jdText: f.jdText,
  employmentType: f.employmentType || null,
  salaryPeriod: f.salaryPeriod || null,
  active: f.active,
});

export const PositionForm = PositionFormFields.superRefine((f, ctx) => {
  validateWith(PositionInput, toPositionInput(f), ctx);
}).transform((f) => PositionInput.parse(toPositionInput(f)));

// ---------------------------------------------------------------- hiring locations (Settings)

export const LocationFormFields = z.object({
  name: z.string(),
  country: z.string(),
  city: z.string(),
  workArrangement: z.string(),
  workingHours: z.string(),
  /** "" = no currency suggested. */
  currency: z.string(),
  /** One university per line. */
  universities: z.string(),
  active: z.boolean(),
});
export type LocationFormValues = z.input<typeof LocationFormFields>;

const toLocationInput = (f: LocationFormValues) => ({ ...f, city: f.city.trim() || null, currency: f.currency || null, universities: lines(f.universities) });

export const LocationForm = LocationFormFields.superRefine((f, ctx) => {
  validateWith(LocationInput, toLocationInput(f), ctx);
}).transform((f) => LocationInput.parse(toLocationInput(f)));
