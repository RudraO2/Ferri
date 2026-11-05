CREATE TABLE "shield_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" text NOT NULL,
	"space_id" uuid,
	"role" text NOT NULL,
	"outcome" text NOT NULL,
	"findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"latency_ms" integer NOT NULL,
	"alerted_crew_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shield_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"domain" text NOT NULL,
	"note" text,
	"added_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shield_events" ADD CONSTRAINT "shield_events_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shield_rules" ADD CONSTRAINT "shield_rules_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shield_events_created" ON "shield_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "shield_events_outcome" ON "shield_events" USING btree ("outcome","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shield_rules_domain" ON "shield_rules" USING btree ("community_id","domain");