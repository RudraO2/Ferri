CREATE TABLE "social_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"event_id" uuid,
	"card_id" uuid,
	"service" text NOT NULL,
	"channel_id" text NOT NULL,
	"channel_name" text NOT NULL,
	"text" text NOT NULL,
	"image_key" text,
	"image_url" text,
	"due_at" timestamp with time zone,
	"status" text DEFAULT 'waiting' NOT NULL,
	"buffer_post_id" text,
	"error" text,
	"ask" text,
	"requested_by" text NOT NULL,
	"origin" text NOT NULL,
	"source_message_id" text,
	"delete_requested_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "social_posts_card" ON "social_posts" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "social_posts_status" ON "social_posts" USING btree ("community_id","status");