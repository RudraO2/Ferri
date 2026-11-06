CREATE TYPE "public"."builder_job_status" AS ENUM('queued', 'handed', 'working', 'done', 'stuck', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "builder_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"event_id" uuid,
	"number" integer NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"title" text NOT NULL,
	"brief" text NOT NULL,
	"status" "builder_job_status" DEFAULT 'queued' NOT NULL,
	"requested_by" text NOT NULL,
	"requested_by_id" uuid,
	"origin" text NOT NULL,
	"source_message_id" text,
	"room_id" text,
	"handoff_event_id" text,
	"report" text,
	"folder" text,
	"handed_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "builder_jobs_source_message_id_unique" UNIQUE("source_message_id")
);
--> statement-breakpoint
ALTER TABLE "builder_jobs" ADD CONSTRAINT "builder_jobs_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builder_jobs" ADD CONSTRAINT "builder_jobs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builder_jobs" ADD CONSTRAINT "builder_jobs_requested_by_id_crew_members_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."crew_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "builder_jobs_number" ON "builder_jobs" USING btree ("community_id","number");--> statement-breakpoint
CREATE INDEX "builder_jobs_status" ON "builder_jobs" USING btree ("status");