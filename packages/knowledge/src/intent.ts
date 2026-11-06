import { z } from "zod";
import { shortCardIds, type OpenCard } from "./cards.ts";
import { structuredCall, type ModelChoice, type Usage } from "./model.ts";
import type { PlanItem } from "./plan.ts";
import { TOPICS, type ChatLine } from "./triage.ts";

// ── What a crew member means when they talk to Ferri ─────────────────────

export const CrewIntentSchema = z.strictObject({
  intent: z.enum(["answer_card", "remember", "announce", "remind", "team_rooms", "plan", "build", "outreach", "question", "other"]),
  card: z.string().nullable(),
  answer: z.string(),
  facts: z.array(z.strictObject({ heading: z.string(), text: z.string() })),
  /** announce: what members should be told, when (ISO 8601 with offset, or null for now), and which recent announcement it changes. */
  announce: z.strictObject({ what: z.string(), when: z.string().nullable(), revises: z.string().nullable() }).nullable(),
  /** remind: a reminder for the crew themselves. */
  remind: z.strictObject({ text: z.string(), when: z.string(), who: z.enum(["me", "crew"]) }).nullable(),
  /** team_rooms: the teams to make rooms for, with member usernames as written. */
  teams: z.array(z.strictObject({ name: z.string(), members: z.array(z.string()) })),
  /** plan: the event plan itself (spec 08). */
  plan: z
    .strictObject({
      action: z.enum(["draft", "show", "done", "add", "owner"]),
      ref: z.string().nullable(),
      kind: z.enum(["decision", "task", "question"]),
      what: z.string(),
      owner: z.string().nullable(),
      due: z.string().nullable(),
      topic: z.enum(TOPICS),
    })
    .nullable(),
  /** build: work for Ferri Builder (spec 11). */
  build: z
    .strictObject({
      kind: z.enum(["site", "checklist", "poster", "listing", "other"]),
      title: z.string(),
      what: z.string(),
    })
    .nullable(),
  /** outreach: partners by email (spec 15). */
  outreach: z
    .strictObject({
      action: z.enum(["find", "email", "status"]),
      who: z.string().nullable(),
      email: z.string().nullable(),
      what: z.string(),
    })
    .nullable(),
});
export type CrewIntent = z.infer<typeof CrewIntentSchema>;

const INTENT_SYSTEM = `You read a message that someone on the organizing crew wrote to Ferri, the AI teammate of their community. Ferri holds open question cards: questions from members it could not answer and is waiting on the crew for.

Decide what the crew member wants:
- answer_card: they are giving the answer to one of the open cards ("dogs are fine if they're on a leash", "tell them parking is in the basement", "yes, lunch is veg"). card is that card's id. answer is the answer as a standalone statement, in their words, with the @mention and instructions to Ferri removed; add nothing they did not say.
- remember: they want Ferri to know facts or rules for the future ("remember that...", "note: ...", "FYI the venue has lockers") and none of it answers an open card. card is null, answer is "".
- question: they are asking Ferri something about the event or the community. card null, answer "", facts []. Asking about the plan itself ("what's the plan?", "what's the plan so far?", "what's left to do?", "what have we decided?") is plan with action show, not question.
- other: anything else (thanks, chat, instructions Ferri cannot follow). card null, answer "", facts [].

facts: every fact in the message that is not part of the card answer, each as a standalone statement in their words (text) with a 2 to 6 word title (heading, for example "Quiet room closing time"). For remember, facts holds everything to keep. For answer_card, it holds only the extra facts beside the answer, often none. Never drop a fact the crew member stated.

- announce: they want the members (participants, the community outside the crew) told something on the event's spaces ("tell everyone lunch moves to 1:30", "announce at 6 PM that submissions close at 7", "let people know the wifi is back", "post that judging starts at 4"), or they want an earlier announcement changed ("change the lunch announcement, it's 1:45 now", "fix the announcement: room 3, not room 2"). announce.what is what the members should be told, as a standalone statement in their words, with the instructions to Ferri removed. announce.when is the time they want it posted, as ISO 8601 with the offset (use "Now" below to resolve "at 6", "tomorrow 9 AM", "in 30 minutes"); null to post as soon as it is approved. announce.revises is the id (A1, A2, ...) of the recent announcement they want changed, else null. Set it only when they ask to change, fix, update or correct an earlier announcement; news on the same topic without that ask ("let people know lunch moves to 2 PM") is a new announcement, revises null. A time inside the news itself ("lunch moves to 1:30") is not announce.when.
- remind: they want a reminder for the crew themselves, not the members ("remind me at 5 to order pizza", "remind the crew at 9 PM to stack the chairs"). remind.text is the reminder as a short standalone line ("Order the pizza"), remind.when is ISO 8601 with the offset, remind.who is "me" or "crew". For announce.when and remind.when, a time of day with no date that has already passed today ("at 5 PM" said at 6 PM) means that time tomorrow; a time still ahead today means today.
- team_rooms: they want rooms or channels made for teams ("make team rooms for Team Alpha with meera and arjun, and Team Beta with priya"). teams lists each team with its name and its members' usernames as written, without the @.

- plan: they are working on the event plan with Ferri (what is decided, who owns what, tasks and deadlines, the agenda). plan.action:
  - draft: "draft the agenda", "make a plan for the event", "draft the run of show". plan.what is any guidance they gave ("" if none).
  - show: "what's the plan?", "what's left?", "what have we decided?", "what's due this week?".
  - done: a task or open item in the plan is finished or settled ("the projector is booked", "mark the badges done"). plan.ref is that plan item's id (P1, P2, ...) from "Plan".
  - add: they put something in the plan ("add a task: print badges by Friday, Meera", "add to the plan that we cap teams at 4", "we still need to decide the judging format, put it on the plan"). plan.kind is task, decision or question (still to decide); plan.what is the item as a standalone statement; plan.owner and plan.due as below.
  - owner: they say who owns a whole area ("Arjun owns registration", "put Meera on food"). plan.owner is that person, plan.topic the area.
  plan.owner is a person's name as written (the sender's own name for "me"), else null. plan.due is ISO 8601 with the offset ("by Friday" means Friday 6 PM), else null. plan.topic is the closest of: ${TOPICS.join(", ")}. plan.ref is null except for done; plan.kind is "task" unless add says otherwise.
  "remember X" is for facts members may ask about; a task, an owner or an agenda request is plan.

- build: they want something made: a page or site, a checklist, a poster, a file, a document ("get the builder to make a one-page site for Build Night", "can you make us a day-of checklist?", "make a poster for the meetup", "have the builder put together a sponsor one-pager", "put Build Night on Luma", "list the meetup on Meetup"). Ferri Builder, Ferri's teammate that makes things, does it. build.kind is site (a web page or site), checklist, poster, listing (putting the event on an event platform such as Luma, Meetup, Commudle, Devfolio or Eventbrite), or other. build.title is a 2 to 6 word label ("Event one-page site", "Day-of checklist"). build.what is what they asked for as a standalone request in their words, with the instructions to Ferri removed, keeping every detail they gave. Writing a plan or agenda is plan, not build; telling members something is announce, not build; finding or emailing partners is outreach, not build.

- outreach: partners, sponsors, colleges, venues, other communities or the media, by email. outreach.action:
  - find: look for organizations to approach ("find colleges and companies in Bengaluru that could sponsor Build Night", "who could host us?", "look for communities to partner with"). outreach.what is the request in their words (where, what kind, for what); who and email are null.
  - email: write to one partner ("email CloudCo about sponsoring", "write to asha@cloudco.example asking if they'd host us", "reply to CloudCo and say Monday works", "follow up with the college"). outreach.who is the organization or person as written; outreach.email is an email address if the message gives one, else null; outreach.what is what the email should say or ask, in their words, with the instructions to Ferri removed.
  - status: they ask how outreach is going ("who have we heard back from?", "any replies from sponsors?", "which partners said yes?"). who is the organization if they name one, else null.

For every intent, announce, remind, plan, build and outreach are null unless the intent is that one, and teams is [] unless the intent is team_rooms. facts is [] for announce, remind, team_rooms, plan, build and outreach.

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
  /** The event plan with short ids (P1, ...), for "the projector is booked". */
  plan?: { text: string; byShort: Map<string, PlanItem> };
}): Promise<{
  intent: CrewIntent | null;
  card: OpenCard | null;
  /** The announcement `announce.revises` names, when it names a real one. */
  revises: RecentAnnouncement | null;
  /** The plan item `plan.ref` names, when it names a real one. */
  planItem: PlanItem | null;
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
      `Plan:\n${input.plan?.text ?? "(empty)"}\n\n` +
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
  const pref = intent?.intent === "plan" ? intent.plan?.ref?.trim().toUpperCase() : undefined;
  const planItem = pref ? (input.plan?.byShort.get(pref) ?? null) : null;
  return { intent, card, revises, planItem, usage: out.usage, latencyMs: out.latencyMs };
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
