CREATE TYPE "public"."announcement_status" AS ENUM('requested', 'waiting', 'scheduled', 'sent', 'dismissed', 'expired', 'missed');--> statement-breakpoint
ALTER TYPE "public"."card_kind" ADD VALUE 'announce';--> statement-breakpoint
CREATE TABLE "announcement_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"announcement_id" uuid NOT NULL,
	"space_id" uuid,
	"room_id" text NOT NULL,
	"space_name" text NOT NULL,
	"platform" text,
	"event_id" text,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcement_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"announcement_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"draft" text NOT NULL,
	"text" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"proposed_by" text NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"card_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"event_id" uuid,
	"title" text NOT NULL,
	"status" "announcement_status" DEFAULT 'requested' NOT NULL,
	"text" text,
	"live_version" integer DEFAULT 0 NOT NULL,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"target_space_ids" uuid[],
	"origin" text NOT NULL,
	"requested_by" text NOT NULL,
	"source_message_id" text,
	"entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcements_source_message_id_unique" UNIQUE("source_message_id")
);
--> statement-breakpoint
CREATE TABLE "crew_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"event_id" uuid,
	"crew_room_id" text NOT NULL,
	"crew_member_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"text" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"requested_by" text NOT NULL,
	"source_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crew_reminders_source_message_id_unique" UNIQUE("source_message_id")
);
--> statement-breakpoint
CREATE TABLE "team_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"event_id" uuid,
	"team" text NOT NULL,
	"members" text[] DEFAULT '{}'::text[] NOT NULL,
	"room_name" text NOT NULL,
	"switch_room_id" text,
	"status" text NOT NULL,
	"error" text,
	"requested_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "announcement_id" uuid;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "announcement_version" integer;--> statement-breakpoint
ALTER TABLE "announcement_posts" ADD CONSTRAINT "announcement_posts_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_posts" ADD CONSTRAINT "announcement_posts_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_versions" ADD CONSTRAINT "announcement_versions_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_versions" ADD CONSTRAINT "announcement_versions_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_entry_id_knowledge_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."knowledge_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_reminders" ADD CONSTRAINT "crew_reminders_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_reminders" ADD CONSTRAINT "crew_reminders_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_rooms" ADD CONSTRAINT "team_rooms_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_rooms" ADD CONSTRAINT "team_rooms_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "announcement_posts_space" ON "announcement_posts" USING btree ("announcement_id","room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "announcement_versions_version" ON "announcement_versions" USING btree ("announcement_id","version");--> statement-breakpoint
CREATE INDEX "announcements_status" ON "announcements" USING btree ("community_id","status");--> statement-breakpoint
CREATE INDEX "crew_reminders_due" ON "crew_reminders" USING btree ("status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "team_rooms_event_team" ON "team_rooms" USING btree ("community_id","event_id","team");