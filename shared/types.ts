// Types and constants shared by the React app and the API.

export const ROLES = ["admin", "recruiter", "ceo", "manager", "hm"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  recruiter: "Recruiter",
  ceo: "CEO approver",
  manager: "Manager",
  hm: "Hiring manager",
};

export const REQUEST_STATUSES = [
  "draft",
  "submitted",
  "changes_requested",
  "rejected",
  "sourcing",
  "open",
  "closed",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  draft: "Draft",
  submitted: "Awaiting approval",
  changes_requested: "Changes requested",
  rejected: "Rejected",
  sourcing: "Sourcing",
  open: "Open",
  closed: "Closed",
};

export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contractor", "freelance"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  full_time: "Full time",
  part_time: "Part time",
  contractor: "Contractor",
  freelance: "Freelance",
};

/** How pay is quoted. Each employment type starts on one (`PAY_DEFAULT`), and any request can switch. */
export const PAY_PERIODS = ["hour", "day", "month", "year", "project"] as const;
export type PayPeriod = (typeof PAY_PERIODS)[number];
export const PAY_LABELS: Record<PayPeriod, string> = { hour: "Per hour", day: "Per day", month: "Per month", year: "Per year", project: "Per project" };
export const PAY_DEFAULT: Record<EmploymentType, PayPeriod> = { full_time: "month", part_time: "month", contractor: "day", freelance: "hour" };
/** Contractors and freelancers get contract length, workload and a project description. */
export const isContractWork = (t: EmploymentType) => t === "contractor" || t === "freelance";

export const CANDIDATE_STATUSES =["new", "contacted", "replied", "interview", "rejected", "hired"] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const HM_DECISIONS = ["yes", "maybe", "no"] as const;
export type HmDecision = (typeof HM_DECISIONS)[number];

export const CRITERIA = [
  { key: "must", label: "Must-have skills / qualifications", weight: 35 },
  { key: "exp", label: "Relevant experience", weight: 20 },
  { key: "industry", label: "Industry / domain fit", weight: 15 },
  { key: "seniority", label: "Seniority / title match", weight: 10 },
  { key: "trajectory", label: "Career trajectory & stability", weight: 10 },
  { key: "remote", label: "Remote / time zone / language", weight: 5 },
  { key: "signals", label: "Supporting signals", weight: 5 },
] as const;
export type CriterionKey = (typeof CRITERIA)[number]["key"];
export type Weights = Record<CriterionKey, number>;
export const DEFAULT_WEIGHTS: Weights = Object.fromEntries(CRITERIA.map((c) => [c.key, c.weight])) as Weights;

export const CURRENCIES = ["USD", "EUR", "GBP", "AED", "SAR", "LBP"] as const;

export const DEPARTMENTS = [
  "Editorial",
  "Product & Technology",
  "Design & Multimedia",
  "Finance",
  "Sales",
  "Marketing",
  "Operations",
  "Assessment",
  "HR",
] as const;

/** Suggested levels; managers can also type their own. */
export const SENIORITIES = ["Entry", "Junior", "Mid", "Senior", "Manager"] as const;

export const WORK_ARRANGEMENTS = ["On-site", "Hybrid", "Remote"] as const;

export type ExperienceItem = {
  title: string;
  company: string;
  start?: string | null; // YYYY-MM or YYYY
  end?: string | null; // null = present
  summary?: string | null;
};
export type EducationItem = { school: string; degree?: string | null; field?: string | null; start?: string | null; end?: string | null };

/** Facts computed in code from a candidate's profile for one role (see server/services/signals.ts). */
export type Signals = {
  relevantYears: number | null;
  totalYears: number | null;
  level: "below" | "match" | "above" | "unknown";
  shortStints: number;
  medianTenureMonths: number | null;
  datedProfile: boolean;
  skillsInWork: string[];
  skillsListedOnly: string[];
  skillsMissing: string[];
  /** Office software, degrees, soft skills: not checked and never a gap. Missing on signals saved before it existed. */
  basicMustHaves?: string[];
  locationFit: "match" | "mismatch" | "unknown";
  languageFit: "match" | "missing" | "unknown";
  reachable: { email: boolean; phone: boolean; linkedin: boolean };
};

/** How strongly the profile shows each must-have, as judged by Claude with a short quote or reason. */
export type MustHaveEvidence = { mustHave: string; level: "proven" | "claimed" | "missing"; evidence: string };

export const OUTREACH_STATUSES = ["queued", "sending", "awaiting_approval", "approved", "sent", "failed", "cancelled", "skipped"] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];
