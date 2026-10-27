ALTER TABLE "applications" ALTER COLUMN "cv_base64" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "cv_blob_path" text;