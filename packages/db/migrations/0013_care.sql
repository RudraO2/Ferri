ALTER TYPE "public"."card_kind" ADD VALUE 'care';--> statement-breakpoint
CREATE TABLE "care_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"event_id" uuid,
	"number" integer NOT NULL,
	"space_id" uuid,
	"room_id" text NOT NULL,
	"person_id" text NOT NULL,
	"person_name" text NOT NULL,
	"platform" text,
	"kind" text NOT NULL,
	"technical" boolean DEFAULT false NOT NULL,
	"severity" text DEFAULT 'normal' NOT NULL,
	"topic" text DEFAULT 'other' NOT NULL,
	"reason" text NOT NULL,
	"quote" text,
	"status" text DEFAULT 'open' NOT NULL,
	"owner_id" uuid,
	"owner_name" text,
	"card_id" uuid,
	"builder_job_id" uuid,
	"source_message_id" text,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"request" jsonb,
	"check_in_at" timestamp with time zone,
	"check_ins" integer DEFAULT 0 NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" text,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "care_cases_source_message_id_unique" UNIQUE("source_message_id")
);
--> statement-breakpoint
CREATE TABLE "care_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"by" text NOT NULL,
	"message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "care_case_id" uuid;--> statement-breakpoint
ALTER TABLE "care_cases" ADD CONSTRAINT "care_cases_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_cases" ADD CONSTRAINT "care_cases_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_cases" ADD CONSTRAINT "care_cases_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_cases" ADD CONSTRAINT "care_cases_owner_id_crew_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."crew_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_cases" ADD CONSTRAINT "care_cases_builder_job_id_builder_jobs_id_fk" FOREIGN KEY ("builder_job_id") REFERENCES "public"."builder_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_notes" ADD CONSTRAINT "care_notes_case_id_care_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."care_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "care_cases_number" ON "care_cases" USING btree ("community_id","number");--> statement-breakpoint
CREATE INDEX "care_cases_status" ON "care_cases" USING btree ("community_id","status");--> statement-breakpoint
CREATE INDEX "care_cases_person" ON "care_cases" USING btree ("person_id","status");--> statement-breakpoint
CREATE INDEX "care_notes_case" ON "care_notes" USING btree ("case_id","created_at");