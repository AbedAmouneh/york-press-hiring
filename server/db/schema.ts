import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  type AnyPgColumn,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { CandidateStatus, EducationItem, ExperienceItem, HmDecision, OutreachStatus, RequestStatus, Role, Weights } from "../../shared/types.js";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  passwordHash: text("password_hash"),
  roles: text("roles").array().$type<Role[]>().notNull().default(sql`'{}'::text[]`),
  department: text("department"),
  active: boolean("active").notNull().default(true),
  isDemo: boolean("is_demo").notNull().default(false),
  inviteToken: text("invite_token"),
  inviteExpiresAt: ts("invite_expires_at"),
  lastLoginAt: ts("last_login_at"),
  // Two-step login: secrets are AES-GCM encrypted, recovery codes are SHA-256 hashes.
  totpSecret: text("totp_secret"),
  totpPendingSecret: text("totp_pending_secret"),
  totpEnabledAt: ts("totp_enabled_at"),
  totpLastStep: integer("totp_last_step"),
  recoveryCodes: text("recovery_codes").array().notNull().default(sql`'{}'::text[]`),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("users_email_idx").on(t.email)]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256 of the cookie token
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
});

export const roleRequests = pgTable("role_requests", {
  id: id(),
  number: serial("number").notNull(),
  title: text("title").notNull(),
  department: text("department").notNull(),
  seniority: text("seniority").notNull(),
  headcount: integer("headcount").notNull().default(1),
  startDate: text("start_date"),
  kind: text("kind").$type<"new" | "backfill">().notNull().default("new"), // new | backfill
  jdText: text("jd_text").notNull().default(""),
  mustHaves: text("must_haves").array().notNull().default(sql`'{}'::text[]`),
  niceToHaves: text("nice_to_haves").array().notNull().default(sql`'{}'::text[]`),
  dealBreakers: text("deal_breakers").array().notNull().default(sql`'{}'::text[]`),
  minYears: integer("min_years"),
  idealYears: integer("ideal_years"),
  languages: text("languages").array().notNull().default(sql`'{}'::text[]`),
  locationPolicy: text("location_policy").notNull().default("Remote, global"),
  searchLocations: text("search_locations").array().notNull().default(sql`'{}'::text[]`),
  timeZone: text("time_zone"),
  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  currency: text("currency"),
  salaryPeriod: text("salary_period").$type<"year" | "month">().notNull().default("year"),
  justification: text("justification").notNull().default(""),
  targetCompanies: text("target_companies").array().notNull().default(sql`'{}'::text[]`),
  avoidCompanies: text("avoid_companies").array().notNull().default(sql`'{}'::text[]`),
  locationId: uuid("location_id").references((): AnyPgColumn => locations.id, { onDelete: "set null" }),
  workingHours: text("working_hours"),
  requesterId: uuid("requester_id").notNull().references(() => users.id),
  hiringManagerId: uuid("hiring_manager_id").references(() => users.id),
  recruiterId: uuid("recruiter_id").references(() => users.id),
  status: text("status").$type<RequestStatus>().notNull().default("draft"),
  scorecardWeights: jsonb("scorecard_weights").$type<Weights>(),
  applyToken: text("apply_token").notNull(),
  submittedAt: ts("submitted_at"),
  decidedAt: ts("decided_at"),
  reminderSentAt: ts("reminder_sent_at"),
  closedAt: ts("closed_at"),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [index("role_requests_status_idx").on(t.status)]);

export const requestEvents = pgTable("request_events", {
  id: id(),
  requestId: uuid("request_id").notNull().references(() => roleRequests.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").references(() => users.id),
  actorName: text("actor_name").notNull(),
  action: text("action").notNull(),
  comment: text("comment"),
  createdAt: createdAt(),
});

export type RunState = {
  brief?: SearchBrief;
  log: { at: string; msg: string }[];
  rawProfiles?: number;
  newRoleCandidateIds?: string[];
  /** A Claude Message Batch in flight (weekly runs): chunk custom_id → role-candidate ids. */
  scoreBatch?: { id: string; submittedAt: string; chunks: Record<string, string[]> };
};
export type SearchBrief = {
  titles: string[];
  skills: string[];
  keywords: string[];
  seniorityLevels: string[];
  locations: string[];
  excludeCompanies: string[];
  targetCompanies: string[];
  summary: string;
};

export const sourcingRuns = pgTable("sourcing_runs", {
  id: id(),
  requestId: uuid("request_id").notNull().references(() => roleRequests.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"initial" | "weekly" | "manual">().notNull().default("initial"), // initial | weekly | manual
  status: text("status").$type<"queued" | "running" | "waiting" | "done" | "failed">().notNull().default("queued"), // queued | running | waiting | done | failed
  step: text("step").notNull().default("brief"),
  state: jsonb("state").$type<RunState>().notNull().default({ log: [] }),
  found: integer("found").notNull().default(0),
  kept: integer("kept").notNull().default(0),
  newContenders: integer("new_contenders").notNull().default(0),
  pdlRecords: integer("pdl_records").notNull().default(0),
  signalhireSearches: integer("signalhire_searches").notNull().default(0),
  signalhireCredits: integer("signalhire_credits").notNull().default(0),
  claudeInputTokens: integer("claude_input_tokens").notNull().default(0),
  claudeOutputTokens: integer("claude_output_tokens").notNull().default(0),
  webSearches: integer("web_searches").notNull().default(0),
  error: text("error"),
  lockedUntil: ts("locked_until"),
  startedAt: ts("started_at"),
  finishedAt: ts("finished_at"),
  createdAt: createdAt(),
});

export const candidates = pgTable("candidates", {
  id: id(),
  pdlId: text("pdl_id"),
  signalhireUid: text("signalhire_uid"),
  sources: text("sources").array().notNull().default(sql`'{}'::text[]`),
  fullName: text("full_name").notNull(),
  headline: text("headline"),
  currentTitle: text("current_title"),
  currentCompany: text("current_company"),
  location: text("location"),
  linkedinUrl: text("linkedin_url"),
  otherUrls: text("other_urls").array().notNull().default(sql`'{}'::text[]`),
  email: text("email"),
  phone: text("phone"),
  contactSource: text("contact_source"),
  contactRetrievedAt: ts("contact_retrieved_at"),
  experience: jsonb("experience").$type<ExperienceItem[]>().notNull().default([]),
  education: jsonb("education").$type<EducationItem[]>().notNull().default([]),
  skills: text("skills").array().notNull().default(sql`'{}'::text[]`),
  certifications: text("certifications").array().notNull().default(sql`'{}'::text[]`),
  languages: text("languages").array().notNull().default(sql`'{}'::text[]`),
  totalYears: real("total_years"),
  openToWork: boolean("open_to_work"),
  profileUpdatedAt: text("profile_updated_at"),
  isSample: boolean("is_sample").notNull().default(false),
  firstSeenAt: createdAt(),
  lastRefreshedAt: ts("last_refreshed_at").notNull().defaultNow(),
}, (t) => [
  index("candidates_linkedin_idx").on(t.linkedinUrl),
  index("candidates_email_idx").on(t.email),
]);

export type ScoreBreakdown = Partial<Weights>;
export type WebFinding = { finding: string; url: string };

export const roleCandidates = pgTable("role_candidates", {
  id: id(),
  requestId: uuid("request_id").notNull().references(() => roleRequests.id, { onDelete: "cascade" }),
  candidateId: uuid("candidate_id").notNull().references(() => candidates.id, { onDelete: "cascade" }),
  runId: uuid("run_id").references(() => sourcingRuns.id, { onDelete: "set null" }),
  prescore: real("prescore").notNull().default(0),
  score: integer("score"),
  scoreBreakdown: jsonb("score_breakdown").$type<ScoreBreakdown>(),
  dealBreakerMissing: boolean("deal_breaker_missing").notNull().default(false),
  rank: integer("rank"),
  isTop10: boolean("is_top10").notNull().default(false),
  whyRecommended: text("why_recommended"),
  gaps: text("gaps"),
  redFlags: text("red_flags"),
  relevantYears: real("relevant_years"),
  webFindings: jsonb("web_findings").$type<WebFinding[]>(),
  personalLine: text("personal_line"),
  status: text("status").$type<CandidateStatus>().notNull().default("new"),
  hmDecision: text("hm_decision").$type<HmDecision>(),
  hmComment: text("hm_comment"),
  dateContacted: text("date_contacted"),
  followUpDate: text("follow_up_date"),
  newContender: boolean("new_contender").notNull().default(false),
  scoredAt: ts("scored_at"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("role_candidates_unique").on(t.requestId, t.candidateId)]);

export const contactReveals = pgTable("contact_reveals", {
  id: id(),
  roleCandidateId: uuid("role_candidate_id").notNull().references(() => roleCandidates.id, { onDelete: "cascade" }),
  candidateId: uuid("candidate_id").notNull().references(() => candidates.id, { onDelete: "cascade" }),
  runId: uuid("run_id").references(() => sourcingRuns.id, { onDelete: "set null" }),
  provider: text("provider").notNull().default("signalhire"),
  item: text("item").notNull(), // identifier sent (LinkedIn URL or UID)
  requestId: text("request_id"), // SignalHire requestId
  status: text("status").notNull().default("pending"), // pending | success | failed | credits_are_over | timeout_exceeded
  creditsUsed: integer("credits_used").notNull().default(0),
  requestedAt: createdAt(),
  receivedAt: ts("received_at"),
});

export const outreachTemplates = pgTable("outreach_templates", {
  id: id(),
  name: text("name").notNull(),
  department: text("department"), // null = default for all
  channel: text("channel").$type<"email" | "linkedin">().notNull(), // email | linkedin
  subject: text("subject"),
  body: text("body").notNull(),
  active: boolean("active").notNull().default(true),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Positions York Press hires for often. Picking one on the request form suggests these details. */
export const positions = pgTable("positions", {
  id: id(),
  title: text("title").notNull(),
  department: text("department").notNull(),
  seniority: text("seniority").notNull(),
  mustHaves: text("must_haves").array().notNull().default(sql`'{}'::text[]`),
  niceToHaves: text("nice_to_haves").array().notNull().default(sql`'{}'::text[]`),
  languages: text("languages").array().notNull().default(sql`'{}'::text[]`),
  minYears: integer("min_years"),
  idealYears: integer("ideal_years"),
  jdText: text("jd_text").notNull().default(""),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("positions_title_idx").on(sql`lower(${t.title})`)]);

/** Places York Press hires for (an office city or a country). Picking one fills a request's arrangement, hours and search country. */
export const locations = pgTable("locations", {
  id: id(),
  name: text("name").notNull(), // e.g. "Zouk Mosbeh, Lebanon"
  country: text("country").notNull(),
  city: text("city"),
  workArrangement: text("work_arrangement").notNull().default("On-site"),
  workingHours: text("working_hours").notNull().default(""),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("locations_name_idx").on(sql`lower(${t.name})`)]);

export const outreachMessages = pgTable("outreach_messages", {
  id: id(),
  roleCandidateId: uuid("role_candidate_id").notNull().references(() => roleCandidates.id, { onDelete: "cascade" }),
  templateId: uuid("template_id").references(() => outreachTemplates.id, { onDelete: "set null" }),
  channel: text("channel").$type<"email" | "linkedin">().notNull(),
  senderId: uuid("sender_id").references(() => users.id),
  toAddress: text("to_address").notNull(), // email or LinkedIn URL
  subject: text("subject"),
  body: text("body").notNull(),
  status: text("status").$type<OutreachStatus>().notNull(), // queued | awaiting_approval | approved | sent | failed | cancelled | skipped
  providerMessageId: text("provider_message_id"),
  approvedById: uuid("approved_by_id").references(() => users.id),
  error: text("error"),
  queuedAt: createdAt(),
  sentAt: ts("sent_at"),
});

export const suppressionList = pgTable("suppression_list", {
  id: id(),
  email: text("email"),
  linkedinUrl: text("linkedin_url"),
  candidateId: uuid("candidate_id"),
  reason: text("reason").notNull(), // opted_out | rejected | york_press_employee | manual
  createdAt: createdAt(),
});

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  autoSendEnabled: boolean("auto_send_enabled").notNull().default(true),
  dailySendCap: integer("daily_send_cap").notNull().default(30),
  signalhireRevealEnabled: boolean("signalhire_reveal_enabled").notNull().default(true),
  webSearchEnabled: boolean("web_search_enabled").notNull().default(true),
  defaultWeights: jsonb("default_weights").$type<Weights>(),
  signalhireCreditsLeft: integer("signalhire_credits_left"),
  weeklySummaryEnabled: boolean("weekly_summary_enabled").notNull().default(true),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  link: text("link"),
  readAt: ts("read_at"),
  createdAt: createdAt(),
}, (t) => [index("notifications_user_idx").on(t.userId)]);

export const emailLog = pgTable("email_log", {
  id: id(),
  toAddress: text("to_address").notNull(),
  fromAddress: text("from_address").notNull(),
  replyTo: text("reply_to"),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  kind: text("kind").notNull(), // system | outreach
  mock: boolean("mock").notNull().default(false),
  status: text("status").notNull().default("sent"),
  providerMessageId: text("provider_message_id"),
  error: text("error"),
  createdAt: createdAt(),
});

export const applications = pgTable("applications", {
  id: id(),
  requestId: uuid("request_id").notNull().references(() => roleRequests.id, { onDelete: "cascade" }),
  candidateId: uuid("candidate_id").references(() => candidates.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  linkedinUrl: text("linkedin_url"),
  note: text("note"),
  cvFileName: text("cv_file_name").notNull(),
  cvMime: text("cv_mime").notNull(),
  // Where the CV file lives: a private Vercel Blob pathname in production, or inline base64 locally.
  cvBlobPath: text("cv_blob_path"),
  cvBase64: text("cv_base64"),
  score: integer("score"),
  analysis: jsonb("analysis").$type<{ why?: string; gaps?: string; breakdown?: ScoreBreakdown }>(),
  createdAt: createdAt(),
});

export const usageLog = pgTable("usage_log", {
  id: id(),
  runId: uuid("run_id"),
  provider: text("provider").notNull(), // claude | pdl | signalhire | resend
  action: text("action").notNull(),
  units: integer("units").notNull().default(0),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  // Prompt caching: tokens read from cache (~10% of the input price) and written to it (~125%).
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
  mock: boolean("mock").notNull().default(false),
  createdAt: createdAt(),
});

/** One row per counted attempt (failed sign-ins, CV uploads). Shared by every serverless instance. */
export const rateLimitHits = pgTable("rate_limit_hits", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(), // e.g. "login:email:jane@x.com", "login:ip:1.2.3.4"
  createdAt: createdAt(),
}, (t) => [index("rate_limit_hits_key_idx").on(t.key, t.createdAt)]);
