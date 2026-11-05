CREATE TYPE "public"."event_stage" AS ENUM('plan', 'build', 'launch', 'live', 'wrap');--> statement-breakpoint
CREATE TYPE "public"."knowledge_source_kind" AS ENUM('markdown', 'desk', 'crew_answer');--> statement-breakpoint
CREATE TYPE "public"."question_outcome" AS ENUM('pending', 'answered', 'chat', 'unknown', 'skipped', 'declined', 'error');--> statement-breakpoint
CREATE TABLE "agent_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "communities_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"stage" "event_stage" DEFAULT 'plan' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"venue" text,
	"instructions" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"event_id" uuid,
	"key" text NOT NULL,
	"source_kind" "knowledge_source_kind" NOT NULL,
	"source_ref" text,
	"source_title" text NOT NULL,
	"heading" text NOT NULL,
	"body" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(heading, '')), 'A') || setweight(to_tsvector('english', coalesce(body, '')), 'B')) STORED,
	"embedding" vector(1024),
	"created_by" text DEFAULT 'seed' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"heading" text NOT NULL,
	"body" text NOT NULL,
	"source_kind" "knowledge_source_kind" NOT NULL,
	"edited_by" text NOT NULL,
	"change" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid,
	"event_id" uuid,
	"room_id" text NOT NULL,
	"message_id" text NOT NULL,
	"thread_id" text,
	"asker_id" text NOT NULL,
	"asker_name" text NOT NULL,
	"text" text NOT NULL,
	"addressed" boolean NOT NULL,
	"triage" jsonb,
	"outcome" "question_outcome" DEFAULT 'pending' NOT NULL,
	"entry_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"missing" text,
	"reply_text" text,
	"reply_event_id" text,
	"model" text,
	"latency_ms" integer,
	"error" text,
	"asked_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questions_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_revisions" ADD CONSTRAINT "knowledge_revisions_entry_id_knowledge_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."knowledge_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "events_community_slug" ON "events" USING btree ("community_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_entries_community_key" ON "knowledge_entries" USING btree ("community_id","key");--> statement-breakpoint
CREATE INDEX "knowledge_entries_search" ON "knowledge_entries" USING gin ("search");--> statement-breakpoint
CREATE INDEX "knowledge_entries_event" ON "knowledge_entries" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_revisions_entry_version" ON "knowledge_revisions" USING btree ("entry_id","version");--> statement-breakpoint
CREATE INDEX "questions_outcome" ON "questions" USING btree ("outcome","created_at");--> statement-breakpoint
CREATE INDEX "questions_room" ON "questions" USING btree ("room_id");