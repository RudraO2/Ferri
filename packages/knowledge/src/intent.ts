import { z } from "zod";
import { shortCardIds, type OpenCard } from "./cards.ts";
import { structuredCall, type ModelChoice, type Usage } from "./model.ts";
import type { PlanItem } from "./plan.ts";
import { SETTING_KEYS } from "./settings.ts";
import { TOPICS, type ChatLine } from "./triage.ts";

// ── What a crew member means when they talk to Ferri ─────────────────────

export const CrewIntentSchema = z.strictObject({
  intent: z.enum(["answer_card", "remember", "announce", "remind", "team_rooms", "plan", "build", "outreach", "care", "guests", "wrap", "desk", "settings", "question", "other"]),
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
  /** guests: the people registered for the event, by email (spec 17). */
  guests: z
    .strictObject({
      action: z.enum(["remind", "nudge", "status", "sync"]),
      audience: z.enum(["going", "waitlist"]),
      what: z.string(),
      /** ISO 8601, or "" for as soon as it is approved (not nullable: the schema allows 16 unions at most). */
      when: z.string(),
    })
    .nullable(),
  /** care: members who need a person (spec 16). */
  care: z
    .strictObject({
      action: z.enum(["mine", "builder", "solved", "drop", "message", "reopen", "status"]),
      /** The case number, 0 for none (not nullable: the schema allows 16 unions at most). */
      case: z.number().int(),
      note: z.string(),
    })
    .nullable(),
  // Specs 19 to 21 add objects that are always present with action "none" (not nullable: the schema allows 16 unions at most).
  /** wrap: after the event (spec 19). */
  wrap: z.strictObject({
    action: z.enum(["none", "recap", "close", "kit", "partners", "reopen", "start"]),
    /** The event they mean, as written ("" = the event of this room); for start, the new event's name. */
    event: z.string(),
    /** start: the event (or its starter kit) to start from, as written. Else "". */
    from: z.string(),
    /** close: the event to move the spaces to, as written. Else "". */
    to: z.string(),
    /** start: when the new event starts, ISO 8601 with the offset. Else "". */
    when: z.string(),
  }),
  /** desk: rooms with a desk skill (spec 20). */
  desk: z.strictObject({
    action: z.enum(["none", "make", "pack", "custom", "list", "sheet"]),
    /** make and sheet: the desk kind; pack: the kind of event. Else "". */
    kind: z.string(),
    /** The desk's own name if they gave one ("rangoli judges"). Else "". */
    name: z.string(),
    /** Usernames to invite, as written, without the @. */
    members: z.array(z.string()),
    /** custom: what the desk is for, in their words. Else "". */
    what: z.string(),
    /** A platform they named (discord, slack, telegram, mattermost, whatsapp). Else "". */
    platform: z.string(),
  }),
  /** settings: how Ferri behaves (spec 21). */
  settings: z.strictObject({
    action: z.enum(["none", "set", "show", "reset"]),
    scope: z.enum(["community", "event", "space"]),
    /** scope space: the space as written ("the WhatsApp group", "Discord"). Else "". */
    space: z.string(),
    key: z.enum(["", ...SETTING_KEYS]),
    value: z.string(),
  }),
});
export type CrewIntent = z.infer<typeof CrewIntentSchema>;

/** The first call's schema: everything but the spec 19 to 21 objects (with them the grammar is too large for the API). */
export const CrewIntentBaseSchema = CrewIntentSchema.omit({ wrap: true, desk: true, settings: true });

/** The spec 19 to 21 objects when the intent is not theirs. */
const NO_EXTRA_INTENT = (): Pick<CrewIntent, "wrap" | "desk" | "settings"> => ({
  wrap: { action: "none", event: "", from: "", to: "", when: "" },
  desk: { action: "none", kind: "", name: "", members: [], what: "", platform: "" },
  settings: { action: "none", scope: "community", space: "", key: "", value: "" },
});

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

- care: a case about a member who needs a person (listed under "Open cases" as Case 1, Case 2, ...; cases are not cards). care.action:
  - mine: they take a case ("I've got case 3", "I'll handle Meera", "on it, case 2").
  - builder: they want the Builder to help the member with a technical problem ("send the builder to case 3", "get the builder to help Meera with her git issue").
  - solved: a case is solved ("case 3 solved, gave her a spare charger", "Meera's sorted"). care.note is how, in their words ("" if they gave nothing).
  - drop: it is not a case ("case 4 isn't a real problem, they were joking", "drop case 2").
  - message: they want words passed to the member of a case ("tell Meera in case 3 to come to the help desk"). care.note is what to tell the member, as a standalone message to them.
  - reopen: a closed case needs attention again ("reopen case 3").
  - status: they ask who needs help ("who's stuck?", "any open cases?", "how is case 3 going?").
  care.case is the case number they mean (3 for "case 3"), or the number of the open case about the person they name; 0 when none fits (and for status about all cases). care.note is "" unless the action says otherwise. Telling everyone something is announce; answering a member's question card is answer_card; care is only about cases.

- guests: the people registered for the event (its guest list from the event site, Luma or an import), by email. guests.action:
  - remind: email the registered guests a reminder ("remind the guests tomorrow at 9 AM to bring their laptops and ID", "email everyone who registered that doors open at 9", "send the attendees a reminder about the venue"). guests.what is what it should say, in their words; guests.when is when to send it, ISO 8601 with the offset, or "" for as soon as it is approved.
  - nudge: ask the registered guests to confirm they are still coming or free their spot for the waitlist ("ask everyone who can't come to free their spot", "nudge the guests to confirm").
  - status: how many are coming, who is on the waitlist ("how many people are coming?", "who's on the waitlist?", "how many registered?").
  - sync: refresh the guest list from Luma and the site now ("sync the guest list", "pull the Luma guests").
  guests.audience is "waitlist" only when they ask to write to the people on the waitlist, else "going". what and when are "" for status and sync.
  Telling the members in the chat spaces is announce; a reminder for the crew themselves is remind; emailing the registered guests is guests.

- wrap: the event is over, or they are moving on to the next one. wrap.action:
  - recap: how the event went ("how did build night go?", "give me the recap", "send the numbers", "wrap up build night").
  - close: close the event, so its spaces stop ("close build night", "we're done, shut the event down", "close it and move the spaces to Build Night 2"). wrap.to is the event to move the spaces to, as written, else "".
  - kit: pack the event into a starter kit for next time ("make a starter kit from build night").
  - partners: save the people and organizations the event worked with to contacts ("save the partners to contacts", "add our sponsors to the CRM for next time").
  - reopen: undo a close ("reopen build night").
  - start: start a new event, usually from an earlier one's kit ("start Build Night 2 on 12 December from the Build Night kit", "set up the next meetup like the last one"). wrap.event is the new event's name, wrap.from the earlier event or kit as written ("" if none), wrap.when its start as ISO 8601 with the offset ("" if not given).
  wrap.event is the event they mean as written ("" for the one this room belongs to), except for start. Unused fields are "".
- desk: a desk is a room Ferri makes for one job at the event, with its own way of working (help, judging, mentors, volunteers, checkin, speakers, sponsors, food, safety, tables, lost-found). desk.action:
  - make: one desk of a kind on that list ("make a judging desk with arjun and priya", "we need a help desk", "set up a check-in desk for the volunteers"). desk.kind is the kind from the list, desk.members the usernames as written without @, desk.name a name they gave ("" if none).
  - pack: every desk one kind of event needs ("set up the desks for a meetup", "make the hackathon rooms"). desk.kind is the kind of event: hackathon, meetup, game-night, festival, workshop or conference (a party, Diwali or a fair is festival; a board game night is game-night; a talk or tech meetup is meetup).
  - custom: a desk for a job not on the list ("make a desk for the rangoli judges where they post their scores", "a room where the photographers log their shots"). desk.what is what the desk is for, in their words, desk.name a short name.
  - list: what desks there are ("what desks do we have?").
  - sheet: show what a desk has collected ("show the judging scores", "who has checked in so far?", "what's in lost and found?"). desk.kind is that desk's kind.
  desk.platform is a platform they named for the room, else "". Team rooms (rooms for teams of participants) are team_rooms, not desk.
- settings: how Ferri behaves, for the whole community, this event, or one space. settings.action is set, show ("what are the settings?", "how are you set up for Build Night?") or reset (back to the default). settings.key is one of:
  - tone: how Ferri sounds ("be more playful on Discord", "keep it professional"); value: playful, warm, professional, brief, or their own words.
  - language: the language Ferri replies in ("reply in Hindi in the WhatsApp group"); value: the language name, or "" for each person's own language.
  - stepInSeconds: how long Ferri waits before answering a question said to the room ("wait a minute before answering in the rooms": 60).
  - ladderLiveMinutes, ladderBeforeMinutes: how soon an unanswered card nudges its owner, during the event and before it.
  - care: on or off ("stop reading people's mood", "turn off care").
  - autoHelp: when the Builder helps stuck members without a tap: live, always or never.
  - checkInLiveMinutes, checkInBeforeMinutes, guestReminderHours, guestNudgeDays, guestDailyCap, autoWrap (on or off), wrapAfterMinutes, decisionWatcher (on or off: offering announcements from crew decisions), planReader (on or off: keeping the plan from crew chat).
  settings.scope is space when they name a space or platform ("in the WhatsApp group", "on Discord"), with settings.space as written without "in" or "on" ("the WhatsApp group", "Discord"); "in the room" or "in the rooms" without naming one is not a space. scope is event when they name the event or say "for this event"; else community. settings.value is the new value as plain text ("60", "off", "Hindi", "playful"), "" for show and reset. settings.key is "" for show, and "" for a reset of everything ("reset the settings for Build Night"). Undoing one change is reset with that key ("stop replying in Hindi in the WhatsApp group": reset, language; "go back to your normal tone on Discord": reset, tone). Telling Ferri how to behave is settings, not remember: "remember" is for facts members may ask about.

For every intent, announce, remind, plan, build, outreach, care and guests are null unless the intent is that one, and teams is [] unless the intent is team_rooms. wrap.action, desk.action and settings.action are "none" unless the intent is that one (with every other field of that object "" or [], and settings.scope "community"). facts is [] for announce, remind, team_rooms, plan, build, outreach, care, guests, wrap, desk and settings.

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
  /** Open care cases, one line each ("Case 3 [stuck, ...]: ..."), for "case 3 solved". */
  cases?: string[];
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
  const user =
    `Now: ${input.now ?? new Date().toISOString()}\n\nOpen cards:\n${text}\n\nRecent announcements:\n${recent.text}\n\n` +
    `Plan:\n${input.plan?.text ?? "(empty)"}\n\n` +
    `Open cases:\n${input.cases?.length ? input.cases.join("\n") : "(none)"}\n\n` +
    `Recent messages in the room:\n${history}\n\nMessage from ${input.sender} (crew) to Ferri:\n${input.message}`;
  // The whole schema is past the API's grammar limit ("The compiled grammar is too large"), so the
  // wrap, desk and settings objects (specs 19 to 21) come from a second small call, only for those intents.
  const out = await structuredCall({
    choice: input.choice,
    system: [{ type: "text", text: INTENT_SYSTEM, cache_control: { type: "ephemeral" } }],
    user,
    schema: CrewIntentBaseSchema,
    maxTokens: 2500,
  });
  const usage = { ...out.usage };
  let latencyMs = out.latencyMs;
  let intent: CrewIntent | null = out.data ? { ...out.data, ...NO_EXTRA_INTENT() } : null;
  if (intent && (intent.intent === "wrap" || intent.intent === "desk" || intent.intent === "settings")) {
    const k = intent.intent;
    const more = await structuredCall({
      choice: input.choice,
      system: [{ type: "text", text: INTENT_SYSTEM, cache_control: { type: "ephemeral" } }],
      user: `${user}\n\nThe intent is ${k}. Fill in only the ${k} object for this message, by the rules above.`,
      schema: z.strictObject({ [k]: CrewIntentSchema.shape[k] }),
      maxTokens: 1500,
    });
    usage.input += more.usage.input;
    usage.output += more.usage.output;
    usage.cacheRead += more.usage.cacheRead;
    usage.cacheWrite += more.usage.cacheWrite;
    latencyMs += more.latencyMs;
    const extra = (more.data as Partial<Pick<CrewIntent, "wrap" | "desk" | "settings">> | null)?.[k];
    if (extra) intent = { ...intent, [k]: extra } as CrewIntent;
    else intent = { ...intent, intent: "other" };
  }
  // "other" or "question" with exactly one intent's details filled in: that intent (Haiku sometimes labels it loosely).
  if (intent && (intent.intent === "other" || intent.intent === "question")) {
    const filled: CrewIntent["intent"][] = (["announce", "remind", "plan", "build", "outreach", "care", "guests"] as const).filter((k) => intent[k] !== null);
    for (const k of ["wrap", "desk", "settings"] as const) if (intent[k].action !== "none") filled.push(k);
    if (filled.length === 1) intent.intent = filled[0]!;
  }
  let card =
    intent?.intent === "answer_card" && intent.card ? (byShort.get(intent.card.trim().toUpperCase()) ?? null) : null;
  // "answer_card" with no usable id but exactly one card open: that one.
  if (intent?.intent === "answer_card" && !card && input.open.length === 1) card = input.open[0]!;
  const ref = intent?.intent === "announce" ? intent.announce?.revises?.trim().toUpperCase() : undefined;
  const revises = ref ? (recent.byShort.get(ref) ?? null) : null;
  const pref = intent?.intent === "plan" ? intent.plan?.ref?.trim().toUpperCase() : undefined;
  const planItem = pref ? (input.plan?.byShort.get(pref) ?? null) : null;
  return { intent, card, revises, planItem, usage, latencyMs };
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
