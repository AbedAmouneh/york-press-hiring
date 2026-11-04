CREATE TABLE "learned_weights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"department" text NOT NULL,
	"weights" jsonb NOT NULL,
	"previous" jsonb NOT NULL,
	"labels" integer NOT NULL,
	"positives" integer NOT NULL,
	"accuracy_before" real NOT NULL,
	"accuracy_after" real NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"undone_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "learned_weights_department_idx" ON "learned_weights" USING btree ("department","created_at");