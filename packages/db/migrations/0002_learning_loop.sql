CREATE TYPE "public"."card_status" AS ENUM('open', 'answered', 'dismissed', 'expired', 'closed');--> statement-breakpoint
CREATE TABLE "cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"event_id" uuid,
	"crew_room_id" text NOT NULL,
	"switch_session_id" text NOT NULL,
	"topic" text NOT NULL,
	"question" text NOT NULL,
	"personal" boolean DEFAULT false NOT NULL,
	"owner_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"status" "card_status" DEFAULT 'open' NOT NULL,
	"nudge_at" timestamp with time zone NOT NULL,
	"nudged_at" timestamp with time zone,
	"escalate_at" timestamp with time zone NOT NULL,
	"escalated_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"answered_at" timestamp with time zone,
	"answered_by" text,
	"answered_via" text,
	"answer_text" text,
	"entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crew_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"message_id" text NOT NULL,
	"room_id" text NOT NULL,
	"crew_member_id" uuid,
	"crew_name" text NOT NULL,
	"intent" text NOT NULL,
	"card_id" uuid,
	"entry_id" uuid,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crew_actions_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE TABLE "crew_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"event_id" uuid,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"handles" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"topics" text[] DEFAULT '{}'::text[] NOT NULL,
	"lead" boolean DEFAULT false NOT NULL,
	"on_duty" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "crew_room_id" text;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "card_id" uuid;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "resolution" text;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "resolution_text" text;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "resolution_event_id" text;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_entry_id_knowledge_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."knowledge_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_actions" ADD CONSTRAINT "crew_actions_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_actions" ADD CONSTRAINT "crew_actions_crew_member_id_crew_members_id_fk" FOREIGN KEY ("crew_member_id") REFERENCES "public"."crew_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_actions" ADD CONSTRAINT "crew_actions_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_actions" ADD CONSTRAINT "crew_actions_entry_id_knowledge_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."knowledge_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cards_status" ON "cards" USING btree ("status","community_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crew_members_community_key" ON "crew_members" USING btree ("community_id","key");--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "questions_card" ON "questions" USING btree ("card_id");