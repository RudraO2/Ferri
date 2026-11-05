import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

// ── Community and events (first slice of the model; spec 04 adds spaces and crew) ──

export const communities = pgTable("communities", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  /** Central instructions: tone and rules that apply in every space. */
  instructions: text("instructions").notNull().default(""),
  ...timestamps,
});

export const eventStage = pgEnum("event_stage", ["plan", "build", "launch", "live", "wrap"]);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    stage: eventStage("stage").notNull().default("plan"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    venue: text("venue"),
    /** Event instructions, layered on top of the community's. */
    instructions: text("instructions").notNull().default(""),
    ...timestamps,
  },
  (t) => [uniqueIndex("events_community_slug").on(t.communityId, t.slug)],
);

// ── Knowledge ─────────────────────────────────────────────────────────────

export const knowledgeSourceKind = pgEnum("knowledge_source_kind", ["markdown", "desk", "crew_answer"]);

export const knowledgeEntries = pgTable(
  "knowledge_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    /** Null means community knowledge; set means it belongs to one event. */
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    /** Stable identity across re-seeds, e.g. `events/build-night/faq.md#food`. */
    key: text("key").notNull(),
    sourceKind: knowledgeSourceKind("source_kind").notNull(),
    /** File path for markdown, message or card id for crew answers. */
    sourceRef: text("source_ref"),
    /** Human name of the source, shown in replies: "Lantern Build Night FAQ". */
    sourceTitle: text("source_title").notNull(),
    heading: text("heading").notNull(),
    body: text("body").notNull(),
    /** Order inside its source (section order in the markdown file). */
    position: integer("position").notNull().default(0),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    version: integer("version").notNull().default(1),
    search: tsvector("search").generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce(heading, '')), 'A') || setweight(to_tsvector('english', coalesce(body, '')), 'B')`,
    ),
    /** Filled only once retrieval needs embeddings; full text search comes first. */
    embedding: vector("embedding", { dimensions: 1024 }),
    createdBy: text("created_by").notNull().default("seed"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("knowledge_entries_community_key").on(t.communityId, t.key),
    index("knowledge_entries_search").using("gin", t.search),
    index("knowledge_entries_event").on(t.eventId),
  ],
);

/** Every version of every entry, so no edit is ever lost. */
export const knowledgeRevisions = pgTable(
  "knowledge_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => knowledgeEntries.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    heading: text("heading").notNull(),
    body: text("body").notNull(),
    sourceKind: knowledgeSourceKind("source_kind").notNull(),
    editedBy: text("edited_by").notNull(),
    /** "created", "updated", "archived" or "restored". */
    change: text("change").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("knowledge_revisions_entry_version").on(t.entryId, t.version)],
);

// ── Questions: the answer log (spec 03 builds cards on the unknown ones) ───

export const questionOutcome = pgEnum("question_outcome", [
  "pending",
  "answered",
  "chat",
  "unknown",
  "skipped",
  "declined",
  "error",
]);

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id").references(() => communities.id, { onDelete: "set null" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    roomId: text("room_id").notNull(),
    /** Unique: inserting the row is how Ferri claims a message, so it never answers twice. */
    messageId: text("message_id").notNull().unique(),
    threadId: text("thread_id"),
    askerId: text("asker_id").notNull(),
    askerName: text("asker_name").notNull(),
    text: text("text").notNull(),
    addressed: boolean("addressed").notNull(),
    triage: jsonb("triage"),
    outcome: questionOutcome("outcome").notNull().default("pending"),
    entryIds: uuid("entry_ids").array().notNull().default(sql`'{}'::uuid[]`),
    /** The part of a partial answer the knowledge did not cover. */
    missing: text("missing"),
    replyText: text("reply_text"),
    replyEventId: text("reply_event_id"),
    model: text("model"),
    latencyMs: integer("latency_ms"),
    error: text("error"),
    askedAt: timestamp("asked_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("questions_outcome").on(t.outcome, t.createdAt), index("questions_room").on(t.roomId)],
);

// ── Agent state (connection id, cursor, mirror document id) ───────────────

export const agentState = pgTable("agent_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
