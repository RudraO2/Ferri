import { z } from "zod";
import { shortCardIds, type OpenCard } from "./cards.ts";
import { structuredCall, type ModelChoice, type Usage } from "./model.ts";
import type { ChatLine } from "./triage.ts";

// ── What a crew member means when they talk to Ferri ─────────────────────

export const CrewIntentSchema = z.strictObject({
  intent: z.enum(["answer_card", "remember", "announce", "remind", "team_rooms", "question", "other"]),
  card: z.string().nullable(),
  answer: z.string(),
  facts: z.array(z.strictObject({ heading: z.string(), text: z.string() })),
  /** announce: what members should be told, when (ISO 8601 with offset, or null for now), and which recent announcement it changes. */
  announce: z.strictObject({ what: z.string(), when: z.string().nullable(), revises: z.string().nullable() }).nullable(),
  /** remind: a reminder for the crew themselves. */
  remind: z.strictObject({ text: z.string(), when: z.string(), who: z.enum(["me", "crew"]) }).nullable(),
  /** team_rooms: the teams to make rooms for, with member usernames as written. */
  teams: z.array(z.strictObject({ name: z.string(), members: z.array(z.string()) })),
});
export type CrewIntent = z.infer<typeof CrewIntentSchema>;

const INTENT_SYSTEM = `You read a message that someone on the organizing crew wrote to Ferri, the AI teammate of their community. Ferri holds open question cards: questions from members it could not answer and is waiting on the crew for.

Decide what the crew member wants:
- answer_card: they are giving the answer to one of the open cards ("dogs are fine if they're on a leash", "tell them parking is in the basement", "yes, lunch is veg"). card is that card's id. answer is the answer as a standalone statement, in their words, with the @mention and instructions to Ferri removed; add nothing they did not say.
- remember: they want Ferri to know facts or rules for the future ("remember that...", "note: ...", "FYI the venue has lockers") and none of it answers an open card. card is null, answer is "".
- question: they are asking Ferri something. card null, answer "", facts [].
- other: anything else (thanks, chat, instructions Ferri cannot follow). card null, answer "", facts [].

facts: every fact in the message that is not part of the card answer, each as a standalone statement in their words (text) with a 2 to 6 word title (heading, for example "Quiet room closing time"). For remember, facts holds everything to keep. For answer_card, it holds only the extra facts beside the answer, often none. Never drop a fact the crew member stated.

- announce: they want the members (participants, the community outside the crew) told something on the event's spaces ("tell everyone lunch moves to 1:30", "announce at 6 PM that submissions close at 7", "let people know the wifi is back", "post that judging starts at 4"), or they want an earlier announcement changed ("change the lunch announcement, it's 1:45 now", "fix the announcement: room 3, not room 2"). announce.what is what the members should be told, as a standalone statement in their words, with the instructions to Ferri removed. announce.when is the time they want it posted, as ISO 8601 with the offset (use "Now" below to resolve "at 6", "tomorrow 9 AM", "in 30 minutes"); null to post as soon as it is approved. announce.revises is the id (A1, A2, ...) of the recent announcement they want changed, else null. A time inside the news itself ("lunch moves to 1:30") is not announce.when.
- remind: they want a reminder for the crew themselves, not the members ("remind me at 5 to order pizza", "remind the crew at 9 PM to stack the chairs"). remind.text is the reminder as a short standalone line ("Order the pizza"), remind.when is ISO 8601 with the offset, remind.who is "me" or "crew".
- team_rooms: they want rooms or channels made for teams ("make team rooms for Team Alpha with meera and arjun, and Team Beta with priya"). teams lists each team with its name and its members' usernames as written, without the @.

For every intent, announce and remind are null unless the intent is that one, and teams is [] unless the intent is team_rooms. facts is [] for announce, remind and team_rooms.

"remember X" only teaches Ferri; "tell everyone X" is announce. A statement that answers an open card is answer_card even when it starts with "remember". When several cards fit, pick the one it answers best.`;

export async function crewIntent(input: {
  choice: ModelChoice;
  sender: string;
  message: string;
  open: OpenCard[];
  history: ChatLine[];
  /** Recent announcements (newest first), for "change the lunch announcement". */
  announcements?: RecentAnnouncement[];
  /** "Friday 6 November 2026, 3:10 pm (Asia/Kolkata, UTC+05:30)": resolves "at 6 PM". */
  now?: string;
}): Promise<{
  intent: CrewIntent | null;
  card: OpenCard | null;
  /** The announcement `announce.revises` names, when it names a real one. */
  revises: RecentAnnouncement | null;
  usage: Usage;
  latencyMs: number;
}> {
  const { text, byShort } = shortCardIds(input.open);
  const recent = shortAnnouncementIds(input.announcements ?? []);
  const history = input.history.slice(-6).map((l) => `${l.sender}: ${l.body}`).join("\n") || "(none)";
  const out = await structuredCall({
    choice: input.choice,
    system: [{ type: "text", text: INTENT_SYSTEM, cache_control: { type: "ephemeral" } }],
    user:
      `Now: ${input.now ?? new Date().toISOString()}\n\nOpen cards:\n${text}\n\nRecent announcements:\n${recent.text}\n\n` +
      `Recent messages in the room:\n${history}\n\nMessage from ${input.sender} (crew) to Ferri:\n${input.message}`,
    schema: CrewIntentSchema,
    maxTokens: 2500,
  });
  const intent = out.data;
  let card =
    intent?.intent === "answer_card" && intent.card ? (byShort.get(intent.card.trim().toUpperCase()) ?? null) : null;
  // "answer_card" with no usable id but exactly one card open: that one.
  if (intent?.intent === "answer_card" && !card && input.open.length === 1) card = input.open[0]!;
  const ref = intent?.intent === "announce" ? intent.announce?.revises?.trim().toUpperCase() : undefined;
  const revises = ref ? (recent.byShort.get(ref) ?? null) : null;
  return { intent, card, revises, usage: out.usage, latencyMs: out.latencyMs };
}

// ── Announcements a crew member may refer to ─────────────────────────────

export interface RecentAnnouncement {
  id: string;
  title: string;
  text: string;
  status: string;
}

/** Short ids (A1, A2, ...) for recent announcements, newest first, and the way back. */
export function shortAnnouncementIds(list: RecentAnnouncement[]): { text: string; byShort: Map<string, RecentAnnouncement> } {
  const byShort = new Map<string, RecentAnnouncement>();
  const lines = list.map((a, i) => {
    const id = `A${i + 1}`;
    byShort.set(id, a);
    return `${id} [${a.status}] ${a.title}: ${a.text.replace(/\s+/g, " ").slice(0, 300)}`;
  });
  return { text: lines.join("\n") || "(none)", byShort };
}

// ── Which open cards a newly taught fact answers ─────────────────────────

export const CoversSchema = z.strictObject({ answers: z.array(z.string()) });

export async function cardsAnsweredBy(input: {
  choice: ModelChoice;
  fact: string;
  open: OpenCard[];
}): Promise<OpenCard[]> {
  const candidates = input.open.filter((c) => !c.personal);
  if (!candidates.length) return [];
  const { text, byShort } = shortCardIds(candidates);
  const out = await structuredCall({
    choice: input.choice,
    system: [
      {
        type: "text",
        text: "The organizing crew just taught Ferri a fact. List the ids of the open question cards that this fact fully answers on its own. A card the fact only touches on is not answered. Return an empty list when none is answered.",
      },
    ],
    user: `Fact:\n${input.fact}\n\nOpen cards:\n${text}`,
    schema: CoversSchema,
    maxTokens: 1500,
  });
  const found = new Set<OpenCard>();
  for (const id of out.data?.answers ?? []) {
    const c = byShort.get(id.trim().toUpperCase());
    if (c) found.add(c);
  }
  return [...found];
}

/** A typed answer to a Switch card ("A1 ...", "R3 2"), which Switch handles itself. */
export function looksLikeCardAnswer(body: string): boolean {
  return /^[\s*_`~]*[AR][1-9]\d*(?:[\s:.,\-–—]|$)/i.test(body);
}
