CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"candidate_id" uuid,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"linkedin_url" text,
	"note" text,
	"cv_file_name" text NOT NULL,
	"cv_mime" text NOT NULL,
	"cv_base64" text NOT NULL,
	"score" integer,
	"analysis" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pdl_id" text,
	"signalhire_uid" text,
	"sources" text[] DEFAULT '{}'::text[] NOT NULL,
	"full_name" text NOT NULL,
	"headline" text,
	"current_title" text,
	"current_company" text,
	"location" text,
	"linkedin_url" text,
	"other_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"email" text,
	"phone" text,
	"contact_source" text,
	"contact_retrieved_at" timestamp with time zone,
	"experience" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"education" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"skills" text[] DEFAULT '{}'::text[] NOT NULL,
	"certifications" text[] DEFAULT '{}'::text[] NOT NULL,
	"languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"total_years" real,
	"open_to_work" boolean,
	"profile_updated_at" text,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_refreshed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_reveals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_candidate_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"run_id" uuid,
	"provider" text DEFAULT 'signalhire' NOT NULL,
	"item" text NOT NULL,
	"request_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"credits_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to_address" text NOT NULL,
	"from_address" text NOT NULL,
	"reply_to" text,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"kind" text NOT NULL,
	"mock" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"provider_message_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"link" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_candidate_id" uuid NOT NULL,
	"template_id" uuid,
	"channel" text NOT NULL,
	"sender_id" uuid,
	"to_address" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"status" text NOT NULL,
	"provider_message_id" text,
	"approved_by_id" uuid,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "outreach_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"department" text,
	"channel" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"actor_id" uuid,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"run_id" uuid,
	"prescore" real DEFAULT 0 NOT NULL,
	"score" integer,
	"score_breakdown" jsonb,
	"deal_breaker_missing" boolean DEFAULT false NOT NULL,
	"rank" integer,
	"is_top10" boolean DEFAULT false NOT NULL,
	"why_recommended" text,
	"gaps" text,
	"red_flags" text,
	"relevant_years" real,
	"web_findings" jsonb,
	"personal_line" text,
	"status" text DEFAULT 'new' NOT NULL,
	"hm_decision" text,
	"hm_comment" text,
	"date_contacted" text,
	"follow_up_date" text,
	"new_contender" boolean DEFAULT false NOT NULL,
	"scored_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" serial NOT NULL,
	"title" text NOT NULL,
	"department" text NOT NULL,
	"seniority" text NOT NULL,
	"headcount" integer DEFAULT 1 NOT NULL,
	"start_date" text,
	"kind" text DEFAULT 'new' NOT NULL,
	"jd_text" text DEFAULT '' NOT NULL,
	"must_haves" text[] DEFAULT '{}'::text[] NOT NULL,
	"nice_to_haves" text[] DEFAULT '{}'::text[] NOT NULL,
	"deal_breakers" text[] DEFAULT '{}'::text[] NOT NULL,
	"min_years" integer,
	"ideal_years" integer,
	"languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"location_policy" text DEFAULT 'Remote, global' NOT NULL,
	"search_locations" text[] DEFAULT '{}'::text[] NOT NULL,
	"time_zone" text,
	"salary_min" integer,
	"salary_max" integer,
	"currency" text,
	"salary_period" text DEFAULT 'year' NOT NULL,
	"justification" text DEFAULT '' NOT NULL,
	"target_companies" text[] DEFAULT '{}'::text[] NOT NULL,
	"avoid_companies" text[] DEFAULT '{}'::text[] NOT NULL,
	"requester_id" uuid NOT NULL,
	"hiring_manager_id" uuid,
	"recruiter_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"scorecard_weights" jsonb,
	"apply_token" text NOT NULL,
	"submitted_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"reminder_sent_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"auto_send_enabled" boolean DEFAULT true NOT NULL,
	"daily_send_cap" integer DEFAULT 30 NOT NULL,
	"signalhire_reveal_enabled" boolean DEFAULT true NOT NULL,
	"web_search_enabled" boolean DEFAULT true NOT NULL,
	"default_weights" jsonb,
	"signalhire_credits_left" integer,
	"weekly_summary_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sourcing_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"kind" text DEFAULT 'initial' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"step" text DEFAULT 'brief' NOT NULL,
	"state" jsonb DEFAULT '{"log":[]}'::jsonb NOT NULL,
	"found" integer DEFAULT 0 NOT NULL,
	"kept" integer DEFAULT 0 NOT NULL,
	"new_contenders" integer DEFAULT 0 NOT NULL,
	"pdl_records" integer DEFAULT 0 NOT NULL,
	"signalhire_searches" integer DEFAULT 0 NOT NULL,
	"signalhire_credits" integer DEFAULT 0 NOT NULL,
	"claude_input_tokens" integer DEFAULT 0 NOT NULL,
	"claude_output_tokens" integer DEFAULT 0 NOT NULL,
	"web_searches" integer DEFAULT 0 NOT NULL,
	"error" text,
	"locked_until" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppression_list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"linkedin_url" text,
	"candidate_id" uuid,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid,
	"provider" text NOT NULL,
	"action" text NOT NULL,
	"units" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"mock" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text,
	"roles" text[] DEFAULT '{}'::text[] NOT NULL,
	"department" text,
	"active" boolean DEFAULT true NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"invite_token" text,
	"invite_expires_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_request_id_role_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."role_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_reveals" ADD CONSTRAINT "contact_reveals_role_candidate_id_role_candidates_id_fk" FOREIGN KEY ("role_candidate_id") REFERENCES "public"."role_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_reveals" ADD CONSTRAINT "contact_reveals_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_reveals" ADD CONSTRAINT "contact_reveals_run_id_sourcing_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."sourcing_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_role_candidate_id_role_candidates_id_fk" FOREIGN KEY ("role_candidate_id") REFERENCES "public"."role_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_template_id_outreach_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."outreach_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_events" ADD CONSTRAINT "request_events_request_id_role_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."role_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_events" ADD CONSTRAINT "request_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_candidates" ADD CONSTRAINT "role_candidates_request_id_role_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."role_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_candidates" ADD CONSTRAINT "role_candidates_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_candidates" ADD CONSTRAINT "role_candidates_run_id_sourcing_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."sourcing_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_requests" ADD CONSTRAINT "role_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_requests" ADD CONSTRAINT "role_requests_hiring_manager_id_users_id_fk" FOREIGN KEY ("hiring_manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_requests" ADD CONSTRAINT "role_requests_recruiter_id_users_id_fk" FOREIGN KEY ("recruiter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sourcing_runs" ADD CONSTRAINT "sourcing_runs_request_id_role_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."role_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidates_linkedin_idx" ON "candidates" USING btree ("linkedin_url");--> statement-breakpoint
CREATE INDEX "candidates_email_idx" ON "candidates" USING btree ("email");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_candidates_unique" ON "role_candidates" USING btree ("request_id","candidate_id");--> statement-breakpoint
CREATE INDEX "role_requests_status_idx" ON "role_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");