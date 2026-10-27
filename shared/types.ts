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

export const CANDIDATE_STATUSES = ["new", "contacted", "replied", "interview", "rejected", "hired"] as const;
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
  "Finance",
  "Sales",
  "Marketing",
  "Operations",
  "Assessment",
  "HR",
] as const;

export const SENIORITIES = ["Junior", "Mid", "Mid-senior", "Senior", "Lead", "Manager", "Director"] as const;

export type ExperienceItem = {
  title: string;
  company: string;
  start?: string | null; // YYYY-MM or YYYY
  end?: string | null; // null = present
  summary?: string | null;
};
export type EducationItem = { school: string; degree?: string | null; field?: string | null; start?: string | null; end?: string | null };

export const OUTREACH_STATUSES = ["queued", "awaiting_approval", "approved", "sent", "failed", "cancelled", "skipped"] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];
