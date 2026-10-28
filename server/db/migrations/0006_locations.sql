CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"country" text NOT NULL,
	"city" text,
	"work_arrangement" text DEFAULT 'On-site' NOT NULL,
	"working_hours" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "jd_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "role_requests" ADD COLUMN "location_id" uuid;--> statement-breakpoint
ALTER TABLE "role_requests" ADD COLUMN "working_hours" text;--> statement-breakpoint
CREATE UNIQUE INDEX "locations_name_idx" ON "locations" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "role_requests" ADD CONSTRAINT "role_requests_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;