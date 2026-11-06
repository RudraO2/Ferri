CREATE TABLE "site_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"site" text NOT NULL,
	"job_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "builder_jobs" ADD COLUMN "url" text;--> statement-breakpoint
ALTER TABLE "site_events" ADD CONSTRAINT "site_events_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_events" ADD CONSTRAINT "site_events_job_id_builder_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."builder_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_events_open" ON "site_events" USING btree ("handled_at","created_at");