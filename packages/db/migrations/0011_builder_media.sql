ALTER TABLE "announcements" ADD COLUMN "media" jsonb;--> statement-breakpoint
ALTER TABLE "builder_jobs" ADD COLUMN "media" jsonb DEFAULT '[]'::jsonb NOT NULL;