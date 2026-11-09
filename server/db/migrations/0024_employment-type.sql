ALTER TABLE "positions" ADD COLUMN "employment_type" text;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "salary_period" text;--> statement-breakpoint
ALTER TABLE "role_requests" ADD COLUMN "employment_type" text DEFAULT 'full_time' NOT NULL;--> statement-breakpoint
ALTER TABLE "role_requests" ADD COLUMN "hours_per_week" integer;--> statement-breakpoint
ALTER TABLE "role_requests" ADD COLUMN "contract_length" text;--> statement-breakpoint
ALTER TABLE "role_requests" ADD COLUMN "workload" text;--> statement-breakpoint
ALTER TABLE "role_requests" ADD COLUMN "project_description" text;