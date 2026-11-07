ALTER TABLE "applications" ADD COLUMN "status" text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "hm_decision" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "hm_comment" text;