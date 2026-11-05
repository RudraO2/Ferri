CREATE TYPE "public"."card_kind" AS ENUM('question', 'reply');--> statement-breakpoint
CREATE TYPE "public"."space_mode" AS ENUM('listen', 'approve', 'auto');--> statement-breakpoint
CREATE TYPE "public"."space_role" AS ENUM('members', 'crew');--> statement-breakpoint
CREATE TYPE "public"."space_state" AS ENUM('new', 'known');--> statement-breakpoint
ALTER TYPE "public"."question_outcome" ADD VALUE 'listened';--> statement-breakpoint
ALTER TYPE "public"."question_outcome" ADD VALUE 'held';--> statement-breakpoint
CREATE TABLE "desk_users" (
	"switch_user_id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"last_login_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"mode" "space_mode" DEFAULT 'listen' NOT NULL,
	"role" "space_role" DEFAULT 'members' NOT NULL,
	"attached_by" text DEFAULT 'seed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "muted_people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"username" text NOT NULL,
	"note" text,
	"muted_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"switch_room_id" text NOT NULL,
	"name" text NOT NULL,
	"platform" text,
	"state" "space_state" DEFAULT 'new' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spaces_switch_room_id_unique" UNIQUE("switch_room_id")
);
--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "kind" "card_kind" DEFAULT 'question' NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "draft_text" text;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "target_room_id" text;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "target_question_id" uuid;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "sent_text" text;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "sent_event_id" text;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "paused_by" text;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "desk_edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "crew_from_desk" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "desk_edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "crew_from_desk" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "space_id" uuid;--> statement-breakpoint
ALTER TABLE "event_spaces" ADD CONSTRAINT "event_spaces_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_spaces" ADD CONSTRAINT "event_spaces_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "muted_people" ADD CONSTRAINT "muted_people_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_spaces_event_space" ON "event_spaces" USING btree ("event_id","space_id");--> statement-breakpoint
CREATE INDEX "event_spaces_space" ON "event_spaces" USING btree ("space_id");--> statement-breakpoint
CREATE UNIQUE INDEX "muted_people_who" ON "muted_people" USING btree ("community_id","platform","username");--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;