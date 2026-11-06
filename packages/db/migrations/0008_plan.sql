CREATE TYPE "public"."plan_item_kind" AS ENUM('decision', 'task', 'owner', 'question');--> statement-breakpoint
CREATE TYPE "public"."plan_item_status" AS ENUM('proposed', 'confirmed', 'done', 'dropped');--> statement-breakpoint
ALTER TYPE "public"."card_kind" ADD VALUE 'plan';--> statement-breakpoint
CREATE TABLE "plan_agendas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"text" text NOT NULL,
	"requested_by" text NOT NULL,
	"source_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_agendas_source_message_id_unique" UNIQUE("source_message_id")
);
--> statement-breakpoint
CREATE TABLE "plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"kind" "plan_item_kind" NOT NULL,
	"status" "plan_item_status" NOT NULL,
	"topic" text DEFAULT 'other' NOT NULL,
	"title" text NOT NULL,
	"text" text NOT NULL,
	"owner_id" uuid,
	"due_at" timestamp with time zone,
	"for_members" boolean DEFAULT false NOT NULL,
	"origin" text NOT NULL,
	"decided_by" text,
	"source_key" text,
	"card_id" uuid,
	"entry_id" uuid,
	"reminded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_items_source_key_unique" UNIQUE("source_key")
);
--> statement-breakpoint
ALTER TABLE "plan_agendas" ADD CONSTRAINT "plan_agendas_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_owner_id_crew_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."crew_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_entry_id_knowledge_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."knowledge_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_items_event" ON "plan_items" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "plan_items_due" ON "plan_items" USING btree ("status","due_at");