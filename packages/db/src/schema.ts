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
/**
 * "question": the crew is asked for an answer (spec 03). "reply": an Approve-space reply waits to be sent.
 * "announce": a version of an announcement waits for its one approval (spec 09).
 */
export const cardKind = pgEnum("card_kind", ["question", "reply", "announce", "plan"]);

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
    /** Announce cards: the announcement and the version this card approves. */
    announcementId: uuid("announcement_id"),
    announcementVersion: integer("announcement_version"),
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

// ── Announcements: inside to outside (spec 09) ────────────────────────────

/**
 * - requested: written (in Desk, Pocket or chat), the approval card is not open yet;
 * - waiting: a version waits on its card;
 * - scheduled: approved, goes out at `scheduledAt`;
 * - sent: posted (later versions edit it in place);
 * - dismissed: someone said don't post; expired: nobody approved in time;
 * - missed: its time came and it was not approved (or the pause held it too long).
 */
export const announcementStatus = pgEnum("announcement_status", [
  "requested",
  "waiting",
  "scheduled",
  "sent",
  "dismissed",
  "expired",
  "missed",
]);

/** A file that lives in Switch: its media id (`mxc`), the room it was posted in, and what it is. */
export interface SwitchMedia {
  mxc: string;
  filename: string;
  mimetype: string;
  size: number | null;
  roomId: string;
  /** The Switch event that carried it. */
  eventId: string | null;
}

export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    /** Short title for lists and the saved knowledge heading ("Lunch moves to 1:30 PM"). */
    title: text("title").notNull(),
    status: announcementStatus("status").notNull().default("requested"),
    /** The approved text everyone sees (null until version 1 is approved). */
    text: text("text"),
    /** The version that is live on the platforms. 0 until something is approved. */
    liveVersion: integer("live_version").notNull().default(0),
    /** Null: post now once approved. */
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    /** Null: every Auto or Approve space of the event at posting time. */
    targetSpaceIds: uuid("target_space_ids").array(),
    /** "chat", "decision", "desk" or "pocket". */
    origin: text("origin").notNull(),
    requestedBy: text("requested_by").notNull(),
    /** The crew-room message it came from, so a replay never asks twice. */
    sourceMessageId: text("source_message_id").unique(),
    entryId: uuid("entry_id").references(() => knowledgeEntries.id, { onDelete: "set null" }),
    /** Images posted with the text (a poster or social card from the Builder), by their Switch media id. */
    media: jsonb("media").$type<SwitchMedia[]>(),
    ...timestamps,
  },
  (t) => [index("announcements_status").on(t.communityId, t.status)],
);

/** Every version of an announcement: the first is posted, later ones edit the posts. */
export const announcementVersions = pgTable(
  "announcement_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    announcementId: uuid("announcement_id")
      .notNull()
      .references(() => announcements.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    /** The title this version gives the announcement. */
    title: text("title").notNull(),
    /** What was proposed. */
    draft: text("draft").notNull(),
    /** What was approved (the draft, or the approver's own version). */
    text: text("text"),
    /** "pending" (needs a card), "waiting", "approved", "rejected", "expired". */
    status: text("status").notNull().default("pending"),
    /** Why this version exists ("lunch moves to 1:45"), for the card. */
    reason: text("reason"),
    proposedBy: text("proposed_by").notNull(),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    cardId: uuid("card_id").references(() => cards.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("announcement_versions_version").on(t.announcementId, t.version)],
);

/** One announcement in one space: the Switch event id, so later versions can edit it. */
export const announcementPosts = pgTable(
  "announcement_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    announcementId: uuid("announcement_id")
      .notNull()
      .references(() => announcements.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id").references(() => spaces.id, { onDelete: "set null" }),
    roomId: text("room_id").notNull(),
    spaceName: text("space_name").notNull(),
    platform: text("platform"),
    /** The Switch event id of the post (null when it failed). */
    eventId: text("event_id"),
    /** The version showing in this space. */
    version: integer("version").notNull(),
    /** "posted", "edited", "reposted" (edit not possible, sent as a new "Update:"), "failed", "skipped". */
    status: text("status").notNull(),
    error: text("error"),
    ...timestamps,
  },
  (t) => [uniqueIndex("announcement_posts_space").on(t.announcementId, t.roomId)],
);

/** A reminder for the crew: posted in the crew room at its time, with a push. No approval (inside only). */
export const crewReminders = pgTable(
  "crew_reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    crewRoomId: text("crew_room_id").notNull(),
    /** Who it is for (empty: the whole crew). */
    crewMemberIds: uuid("crew_member_ids").array().notNull().default(sql`'{}'::uuid[]`),
    text: text("text").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    /** "pending", "sent", "missed" (more than 30 minutes late after a pause), "cancelled". */
    status: text("status").notNull().default("pending"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    requestedBy: text("requested_by").notNull(),
    sourceMessageId: text("source_message_id").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crew_reminders_due").on(t.status, t.dueAt)],
);

/** Team rooms Ferri made from a Switch template, so it never makes the same one twice. */
export const teamRooms = pgTable(
  "team_rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    team: text("team").notNull(),
    members: text("members").array().notNull().default(sql`'{}'::text[]`),
    roomName: text("room_name").notNull(),
    switchRoomId: text("switch_room_id"),
    /** "created" or "failed". */
    status: text("status").notNull(),
    error: text("error"),
    requestedBy: text("requested_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("team_rooms_event_team").on(t.communityId, t.eventId, t.team)],
);

// ── Plan stage (spec 08) ──────────────────────────────────────────────────

export const planItemKind = pgEnum("plan_item_kind", ["decision", "task", "owner", "question"]);
export const planItemStatus = pgEnum("plan_item_status", ["proposed", "confirmed", "done", "dropped"]);

/**
 * One line of an event's living plan: something decided, a task with an
 * owner and a deadline, who owns a topic, or a question still open. Settled
 * in crew chat: confirmed at once. Proposed by Ferri (the agenda draft):
 * waits on a plan card.
 */
export const planItems = pgTable(
  "plan_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    kind: planItemKind("kind").notNull(),
    status: planItemStatus("status").notNull(),
    /** The triage topic list (food, venue, schedule, ...). */
    topic: text("topic").notNull().default("other"),
    /** Short label ("Date", "Projector booking"). */
    title: text("title").notNull(),
    /** The item as one standalone statement. */
    text: text("text").notNull(),
    ownerId: uuid("owner_id").references(() => crewMembers.id, { onDelete: "set null" }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    /** Members need to know it (saved as knowledge once confirmed). */
    forMembers: boolean("for_members").notNull().default(false),
    /** "chat", "draft" or "desk". */
    origin: text("origin").notNull(),
    /** Who said it, decided it or confirmed it. */
    decidedBy: text("decided_by"),
    /** `<message id>#<n>` for items read from chat, so a replay adds nothing twice. */
    sourceKey: text("source_key").unique(),
    cardId: uuid("card_id"),
    entryId: uuid("entry_id").references(() => knowledgeEntries.id, { onDelete: "set null" }),
    remindedAt: timestamp("reminded_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("plan_items_event").on(t.eventId, t.status), index("plan_items_due").on(t.status, t.dueAt)],
);

/** The agenda (run of show) Ferri drafted for an event, newest first. */
export const planAgendas = pgTable("plan_agendas", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  requestedBy: text("requested_by").notNull(),
  sourceMessageId: text("source_message_id").unique(),
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

// ── Shield: Switch Trust checks (spec 07) ─────────────────────────────────

/** One check Switch Trust asked Shield for. Never holds the message or the detected text. */
export const shieldEvents = pgTable(
  "shield_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The Switch room (Switch sends it as x-agent-session-id). */
    roomId: text("room_id").notNull(),
    spaceId: uuid("space_id").references(() => spaces.id, { onDelete: "set null" }),
    /** "user" (a person's message) or "assistant" (an agent's post). */
    role: text("role").notNull(),
    /** "ok", "alerted", "redacted" or "blocked". */
    outcome: text("outcome").notNull(),
    /** [{category, detector_name, severity, reason}] — reasons are defanged, never the secret. */
    findings: jsonb("findings").$type<{ category: string; detector_name: string; severity: string; reason: string }[]>().notNull().default([]),
    latencyMs: integer("latency_ms").notNull(),
    /** Set when the crew was told about it. */
    alertedCrewAt: timestamp("alerted_crew_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("shield_events_created").on(t.createdAt), index("shield_events_outcome").on(t.outcome, t.createdAt)],
);

/** Domains the community allows (never flagged) or blocks (always blocked). */
export const shieldRules = pgTable(
  "shield_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    /** "allow" or "block". */
    kind: text("kind").notNull(),
    domain: text("domain").notNull(),
    note: text("note"),
    addedBy: text("added_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("shield_rules_domain").on(t.communityId, t.domain)],
);

// ── Ferri Builder: jobs handed to the Claude Code agent Switch runs (spec 11) ─

export const builderJobStatus = pgEnum("builder_job_status", [
  "queued",
  "handed",
  "working",
  "done",
  "stuck",
  "failed",
  "cancelled",
]);

/** One piece of work handed to Ferri Builder (B1, B2, ... per community). */
export const builderJobs = pgTable(
  "builder_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    /** Short number: job B<number>. */
    number: integer("number").notNull(),
    /** "site", "checklist", "poster", "other". */
    kind: text("kind").notNull().default("other"),
    /** Short label ("Event one-page site"). */
    title: text("title").notNull(),
    /** What the crew asked for, in their words. */
    brief: text("brief").notNull(),
    status: builderJobStatus("status").notNull().default("queued"),
    /** Who asked: a crew member's name, or "Desk". */
    requestedBy: text("requested_by").notNull(),
    requestedById: uuid("requested_by_id").references(() => crewMembers.id, { onDelete: "set null" }),
    /** "chat" or "desk". */
    origin: text("origin").notNull(),
    /** The crew message that asked, so a replay starts nothing twice. */
    sourceMessageId: text("source_message_id").unique(),
    roomId: text("room_id"),
    /** Ferri's hand-off message (send_targeted_message). */
    handoffEventId: text("handoff_event_id"),
    /** The Builder's last report ("Job B1 done: ..."). */
    report: text("report"),
    /** The Builder's folder for this job, relative to its working folder. */
    folder: text("folder"),
    /** The live address the Builder reported (the first https link of its done report). */
    url: text("url"),
    /** Files the Builder posted in the room for this job (images, by their Switch media id). */
    media: jsonb("media").$type<SwitchMedia[]>().notNull().default([]),
    handedAt: timestamp("handed_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("builder_jobs_number").on(t.communityId, t.number), index("builder_jobs_status").on(t.status)],
);

/** What an event site the Builder shipped reports back (spec 12): registrations, credit pools. */
export const siteEvents = pgTable(
  "site_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    /** The job that shipped the site (B5), as the site names itself. */
    site: text("site").notNull(),
    jobId: uuid("job_id").references(() => builderJobs.id, { onDelete: "set null" }),
    /** "registration", "pool_low", "pool_refilled". */
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    /** Ferri told the crew (or decided not to). */
    handledAt: timestamp("handled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("site_events_open").on(t.handledAt, t.createdAt)],
);
