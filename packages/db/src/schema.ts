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

// ── Community and events ──────────────────────────────────────────────────

export const communities = pgTable("communities", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  /** Central instructions: tone and rules that apply in every space. */
  instructions: text("instructions").notNull().default(""),
  /** The master pause: while true, Ferri posts nothing anywhere. */
  paused: boolean("paused").notNull().default(false),
  pausedAt: timestamp("paused_at", { withTimezone: true }),
  pausedBy: text("paused_by"),
  /** Set when an organizer edits the community in Desk; the seed then leaves it alone. */
  deskEditedAt: timestamp("desk_edited_at", { withTimezone: true }),
  /** The community-wide crew is managed in Desk; the seed leaves it alone. */
  crewFromDesk: boolean("crew_from_desk").notNull().default(false),
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
    /** Set when an organizer edits the event in Desk; the seed then leaves it alone. */
    deskEditedAt: timestamp("desk_edited_at", { withTimezone: true }),
    /** This event's crew is managed in Desk; the seed leaves it alone. */
    crewFromDesk: boolean("crew_from_desk").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("events_community_slug").on(t.communityId, t.slug)],
);

// ── Spaces: every group or channel Ferri is in, on any platform ───────────

export const spaceState = pgEnum("space_state", ["new", "known"]);

export const spaces = pgTable("spaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id, { onDelete: "cascade" }),
  switchRoomId: text("switch_room_id").notNull().unique(),
  name: text("name").notNull(),
  /** "mattermost", "telegram", "slack", ... (Switch's bridge name, lowercase). */
  platform: text("platform"),
  /** New spaces wait in the Discovered list; nothing is attached, so Ferri is Off there. */
  state: spaceState("state").notNull().default("new"),
  /** Ferri is no longer in the room. */
  archived: boolean("archived").notNull().default(false),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  ...timestamps,
});

export const spaceMode = pgEnum("space_mode", ["listen", "approve", "auto"]);
export const spaceRole = pgEnum("space_role", ["members", "crew"]);

/** A space attached to an event. Not attached means Off. */
export const eventSpaces = pgTable(
  "event_spaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    mode: spaceMode("mode").notNull().default("listen"),
    /** "crew": the event's inside room, where cards go. */
    role: spaceRole("role").notNull().default("members"),
    attachedBy: text("attached_by").notNull().default("seed"),
    ...timestamps,
  },
  (t) => [uniqueIndex("event_spaces_event_space").on(t.eventId, t.spaceId), index("event_spaces_space").on(t.spaceId)],
);

/** People Ferri ignores everywhere in the community. */
export const mutedPeople = pgTable(
  "muted_people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    username: text("username").notNull(),
    note: text("note"),
    mutedBy: text("muted_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("muted_people_who").on(t.communityId, t.platform, t.username)],
);

/** Switch accounts that signed in to Desk, so their card answers carry a name. */
export const deskUsers = pgTable("desk_users", {
  switchUserId: text("switch_user_id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Crew ──────────────────────────────────────────────────────────────────

export const crewMembers = pgTable(
  "crew_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    /** Null means crew for the whole community. */
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    /** Stable identity across re-seeds, e.g. `build-night/priya`. */
    key: text("key").notNull(),
    name: text("name").notNull(),
    /** Username per platform, e.g. {"mattermost": "priya", "telegram": "priya_k"}. */
    handles: jsonb("handles").$type<Record<string, string>>().notNull().default({}),
    /** Topics this person owns (the triage topic list). Their cards go to them first. */
    topics: text("topics").array().notNull().default(sql`'{}'::text[]`),
    lead: boolean("lead").notNull().default(false),
    onDuty: boolean("on_duty").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("crew_members_community_key").on(t.communityId, t.key)],
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
  /** Heard in a Listen space: logged, never answered there. */
  "listened",
  /** A reply drafted in an Approve space, waiting for an organizer. */
  "held",
]);

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id").references(() => communities.id, { onDelete: "set null" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    roomId: text("room_id").notNull(),
    spaceId: uuid("space_id").references(() => spaces.id, { onDelete: "set null" }),
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
    /** The card this question waits on (spec 03). */
    cardId: uuid("card_id").references(() => cards.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    /** "answered", "dismissed" or "expired". */
    resolution: text("resolution"),
    resolutionText: text("resolution_text"),
    resolutionEventId: text("resolution_event_id"),
    askedAt: timestamp("asked_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [
    index("questions_outcome").on(t.outcome, t.createdAt),
    index("questions_room").on(t.roomId),
    index("questions_card").on(t.cardId),
  ],
);

// ── Cards: one per question the crew is asked (mirrors a Switch question card) ──

export const cardStatus = pgEnum("card_status", ["open", "answered", "dismissed", "expired", "closed"]);
/** "question": the crew is asked for an answer (spec 03). "reply": an Approve-space reply waits to be sent. */
export const cardKind = pgEnum("card_kind", ["question", "reply"]);

export const cards = pgTable(
  "cards",
  {
    /** Also the Switch request id. */
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    crewRoomId: text("crew_room_id").notNull(),
    switchSessionId: text("switch_session_id").notNull(),
    kind: cardKind("kind").notNull().default("question"),
    /** Reply cards: the drafted reply, where it goes, and for which question. */
    draftText: text("draft_text"),
    targetRoomId: text("target_room_id"),
    targetQuestionId: uuid("target_question_id"),
    sentText: text("sent_text"),
    sentEventId: text("sent_event_id"),
    topic: text("topic").notNull(),
    /** Short canonical English form of the question, used for matching and as the saved heading. */
    question: text("question").notNull(),
    /** About one person's own situation: answered to them only, never saved. */
    personal: boolean("personal").notNull().default(false),
    ownerIds: uuid("owner_ids").array().notNull().default(sql`'{}'::uuid[]`),
    status: cardStatus("status").notNull().default("open"),
    nudgeAt: timestamp("nudge_at", { withTimezone: true }).notNull(),
    nudgedAt: timestamp("nudged_at", { withTimezone: true }),
    escalateAt: timestamp("escalate_at", { withTimezone: true }).notNull(),
    escalatedAt: timestamp("escalated_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    answeredBy: text("answered_by"),
    /** "card", "chat" or "remember". */
    answeredVia: text("answered_via"),
    answerText: text("answer_text"),
    entryId: uuid("entry_id").references(() => knowledgeEntries.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("cards_status").on(t.status, t.communityId)],
);

// ── Crew actions: what the crew told Ferri (answers in chat, facts to remember) ──

export const crewActions = pgTable("crew_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id, { onDelete: "cascade" }),
  /** Unique: inserting the row claims the message, so a replay never acts twice. */
  messageId: text("message_id").notNull().unique(),
  roomId: text("room_id").notNull(),
  crewMemberId: uuid("crew_member_id").references(() => crewMembers.id, { onDelete: "set null" }),
  crewName: text("crew_name").notNull(),
  /** "answer_card" or "remember". */
  intent: text("intent").notNull(),
  cardId: uuid("card_id").references(() => cards.id, { onDelete: "set null" }),
  entryId: uuid("entry_id").references(() => knowledgeEntries.id, { onDelete: "set null" }),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Agent state (connection id, cursor, mirror document id) ───────────────

export const agentState = pgTable("agent_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Ferri Pocket: Web Push (spec 06) ──────────────────────────────────────

/** A browser or phone that gets push notifications for one Switch user. */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The Switch user (a Desk or Pocket sign-in). Crew members link to it through `handles.switch`. */
    switchUserId: text("switch_user_id").notNull(),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    lastOkAt: timestamp("last_ok_at", { withTimezone: true }),
    failures: integer("failures").notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("push_subscriptions_endpoint").on(t.endpoint), index("push_subscriptions_user").on(t.switchUserId)],
);

/** Every push Ferri sent, so a settled card can replace the notifications it caused. */
export const pushLog = pgTable(
  "push_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cardId: uuid("card_id").references(() => cards.id, { onDelete: "cascade" }),
    switchUserId: text("switch_user_id").notNull(),
    /** "open", "nudge", "escalate", "expire", "settled" or "test". */
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    /** "sent", "gone" (the browser dropped the subscription) or "failed". */
    status: text("status").notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("push_log_card").on(t.cardId)],
);
