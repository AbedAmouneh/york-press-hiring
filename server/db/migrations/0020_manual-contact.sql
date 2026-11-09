ALTER TABLE "email_log" ADD COLUMN "cc" text;--> statement-breakpoint
ALTER TABLE "outreach_messages" ADD COLUMN "kind" text DEFAULT 'first' NOT NULL;