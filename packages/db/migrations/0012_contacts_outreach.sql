ALTER TYPE "public"."card_kind" ADD VALUE 'outreach';--> statement-breakpoint
CREATE TABLE "contact_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"event_id" uuid,
	"direction" text NOT NULL,
	"status" text NOT NULL,
	"ask" text,
	"subject" text,
	"text" text,
	"from_address" text,
	"to_address" text,
	"reply_to" text,
	"resend_id" text,
	"card_id" uuid,
	"in_reply_to_id" uuid,
	"reading" jsonb,
	"requested_by" text,
	"requested_by_id" uuid,
	"source_message_id" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_messages_source_message_id_unique" UNIQUE("source_message_id")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"event_id" uuid,
	"code" text NOT NULL,
	"org" text NOT NULL,
	"person" text,
	"email" text,
	"kind" text DEFAULT 'other' NOT NULL,
	"status" text DEFAULT 'prospect' NOT NULL,
	"website" text,
	"source" text,
	"why" text,
	"notes" text,
	"added_by" text NOT NULL,
	"job_id" uuid,
	"last_email_at" timestamp with time zone,
	"last_reply_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"handled_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_events_delivery_id_unique" UNIQUE("delivery_id")
);
--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "contact_message_id" uuid;--> statement-breakpoint
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_requested_by_id_crew_members_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."crew_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_job_id_builder_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."builder_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_messages_contact" ON "contact_messages" USING btree ("contact_id","created_at");--> statement-breakpoint
CREATE INDEX "contact_messages_status" ON "contact_messages" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_messages_resend" ON "contact_messages" USING btree ("resend_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_code" ON "contacts" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_email" ON "contacts" USING btree ("community_id","email");--> statement-breakpoint
CREATE INDEX "contacts_status" ON "contacts" USING btree ("community_id","status");--> statement-breakpoint
CREATE INDEX "email_events_open" ON "email_events" USING btree ("handled_at","created_at");