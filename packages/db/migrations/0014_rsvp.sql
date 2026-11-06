ALTER TYPE "public"."card_kind" ADD VALUE 'guests';--> statement-breakpoint
ALTER TYPE "public"."card_kind" ADD VALUE 'spot';--> statement-breakpoint
CREATE TABLE "guest_mails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"send_id" uuid NOT NULL,
	"guest_id" uuid NOT NULL,
	"email" text NOT NULL,
	"resend_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guest_mails_resend_id_unique" UNIQUE("resend_id")
);
--> statement-breakpoint
CREATE TABLE "guest_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"audience" text DEFAULT 'going' NOT NULL,
	"guest_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"ask" text,
	"subject" text,
	"text" text,
	"status" text DEFAULT 'requested' NOT NULL,
	"card_id" uuid,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"total" integer DEFAULT 0 NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"requested_by" text NOT NULL,
	"requested_by_id" uuid,
	"origin" text NOT NULL,
	"source_message_id" text,
	"auto_key" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guest_sends_source_message_id_unique" UNIQUE("source_message_id"),
	CONSTRAINT "guest_sends_auto_key_unique" UNIQUE("auto_key")
);
--> statement-breakpoint
CREATE TABLE "guests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"sources" text[] DEFAULT '{}'::text[] NOT NULL,
	"site_id" text,
	"luma_id" text,
	"status" text DEFAULT 'going' NOT NULL,
	"luma_status" text,
	"site_status" text,
	"team" text,
	"code" text NOT NULL,
	"registered_at" timestamp with time zone,
	"checked_in_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"freed_at" timestamp with time zone,
	"spot_handled_at" timestamp with time zone,
	"offered_at" timestamp with time zone,
	"offer_expires_at" timestamp with time zone,
	"rsvp_answer" text,
	"rsvp_at" timestamp with time zone,
	"rsvp_handled_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guests_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "guest_send_id" uuid;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "guest_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "capacity" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "luma_event_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "guest_sync_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "guest_sync" jsonb;--> statement-breakpoint
ALTER TABLE "guest_mails" ADD CONSTRAINT "guest_mails_send_id_guest_sends_id_fk" FOREIGN KEY ("send_id") REFERENCES "public"."guest_sends"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_mails" ADD CONSTRAINT "guest_mails_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_sends" ADD CONSTRAINT "guest_sends_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_sends" ADD CONSTRAINT "guest_sends_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_sends" ADD CONSTRAINT "guest_sends_requested_by_id_crew_members_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."crew_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guest_mails_send_guest" ON "guest_mails" USING btree ("send_id","guest_id");--> statement-breakpoint
CREATE INDEX "guest_mails_status" ON "guest_mails" USING btree ("status","sent_at");--> statement-breakpoint
CREATE INDEX "guest_sends_status" ON "guest_sends" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "guests_event_email" ON "guests" USING btree ("event_id","email");--> statement-breakpoint
CREATE INDEX "guests_event_status" ON "guests" USING btree ("event_id","status");