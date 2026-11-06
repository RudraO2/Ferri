ALTER TYPE "public"."card_kind" ADD VALUE 'wrap';--> statement-breakpoint
ALTER TYPE "public"."card_kind" ADD VALUE 'desk';--> statement-breakpoint
ALTER TYPE "public"."card_kind" ADD VALUE 'social';--> statement-breakpoint
CREATE TABLE "contact_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"role" text DEFAULT 'partner' NOT NULL,
	"note" text,
	"added_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "desk_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"desk_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"by" text NOT NULL,
	"message_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "desk_rows_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE TABLE "desks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"event_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"skill_key" text NOT NULL,
	"skill_version" integer DEFAULT 0 NOT NULL,
	"space_id" uuid,
	"room_name" text NOT NULL,
	"switch_room_id" text,
	"platform" text,
	"visibility" text DEFAULT 'private' NOT NULL,
	"members" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"error" text,
	"card_id" uuid,
	"sheet_document_id" text,
	"requested_by" text NOT NULL,
	"source_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_recaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"stats" jsonb NOT NULL,
	"lessons" jsonb NOT NULL,
	"text" text NOT NULL,
	"document_id" text,
	"origin" text NOT NULL,
	"requested_by" text NOT NULL,
	"source_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_recaps_source_message_id_unique" UNIQUE("source_message_id")
);
--> statement-breakpoint
CREATE TABLE "skill_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"body" text NOT NULL,
	"edited_by" text NOT NULL,
	"change" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"key" text NOT NULL,
	"body" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"origin" text DEFAULT 'desk' NOT NULL,
	"edited_by" text NOT NULL,
	"reset_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "starter_kits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"from_event_id" uuid,
	"name" text NOT NULL,
	"content" jsonb NOT NULL,
	"markdown" text NOT NULL,
	"document_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "payload" jsonb;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "event_spaces" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "closed_by" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "wrap_proposed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "from_kit_id" uuid;--> statement-breakpoint
ALTER TABLE "contact_events" ADD CONSTRAINT "contact_events_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_events" ADD CONSTRAINT "contact_events_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desk_rows" ADD CONSTRAINT "desk_rows_desk_id_desks_id_fk" FOREIGN KEY ("desk_id") REFERENCES "public"."desks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desks" ADD CONSTRAINT "desks_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desks" ADD CONSTRAINT "desks_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desks" ADD CONSTRAINT "desks_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_recaps" ADD CONSTRAINT "event_recaps_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_recaps" ADD CONSTRAINT "event_recaps_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_revisions" ADD CONSTRAINT "skill_revisions_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "starter_kits" ADD CONSTRAINT "starter_kits_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "starter_kits" ADD CONSTRAINT "starter_kits_from_event_id_events_id_fk" FOREIGN KEY ("from_event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contact_events_pair" ON "contact_events" USING btree ("contact_id","event_id");--> statement-breakpoint
CREATE INDEX "desk_rows_desk" ON "desk_rows" USING btree ("desk_id","created_at");--> statement-breakpoint
CREATE INDEX "desks_event" ON "desks" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "desks_room" ON "desks" USING btree ("switch_room_id");--> statement-breakpoint
CREATE INDEX "event_recaps_event" ON "event_recaps" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_revisions_version" ON "skill_revisions" USING btree ("skill_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_key" ON "skills" USING btree ("community_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "starter_kits_event" ON "starter_kits" USING btree ("from_event_id");--> statement-breakpoint
UPDATE "events" SET "closed_at" = "updated_at", "closed_by" = 'before spec 19' WHERE "stage" = 'wrap';
