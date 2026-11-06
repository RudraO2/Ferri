import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { planAgendas, planItems, type Db } from "@ferri/db";
import type { CrewMember } from "./crew.ts";
import { formatWhen } from "./launch.ts";
import { structuredCall, type ModelChoice, type Usage } from "./model.ts";
import { renderInstructions, renderKnowledge } from "./render.ts";
import type { LiveKnowledge } from "./store.ts";
import { TOPICS, type ChatLine } from "./triage.ts";

// ── The plan Ferri keeps for an event (spec 08) ───────────────────────────

export type PlanItem = typeof planItems.$inferSelect;
export type PlanKind = PlanItem["kind"];

const KIND_ORDER: PlanKind[] = ["decision", "owner", "task", "question"];

/** Every item still in the plan (not dropped), oldest first. */
export async function loadPlan(db: Db, eventId: string): Promise<PlanItem[]> {
  return db
    .select()
    .from(planItems)
    .where(and(eq(planItems.eventId, eventId), ne(planItems.status, "dropped")))
    .orderBy(asc(planItems.createdAt));
}

export async function latestAgenda(db: Db, eventId: string): Promise<{ text: string; requestedBy: string; createdAt: Date } | null> {
  const [a] = await db.select().from(planAgendas).where(eq(planAgendas.eventId, eventId)).orderBy(desc(planAgendas.createdAt)).limit(1);
  return a ?? null;
}

/** Items the model may refer to: everything open or decided, with short ids (P1, P2, ...). */
export function shortPlanIds(items: PlanItem[], crew: CrewMember[]): { text: string; byShort: Map<string, PlanItem> } {
  const byShort = new Map<string, PlanItem>();
  const names = new Map(crew.map((c) => [c.id, c.name]));
  const lines = items
    .filter((i) => i.status !== "dropped")
    .map((i, n) => {
      const id = `P${n + 1}`;
      byShort.set(id, i);
      const owner = i.ownerId ? `, owner ${names.get(i.ownerId) ?? "?"}` : "";
      const due = i.dueAt ? `, due ${i.dueAt.toISOString()}` : "";
      return `${id} [${i.kind}, ${i.status}${owner}${due}] ${i.title}: ${i.text.replace(/\s+/g, " ").slice(0, 240)}`;
    });
  return { text: lines.join("\n") || "(empty)", byShort };
}

// ── Owners from the plan feed the routing ─────────────────────────────────

/**
 * The crew with the plan's owner items applied: the latest confirmed owner of
 * a topic is its only owner, so cards on it go to that person first. The
 * seed's topics stay as they are for topics the plan does not name.
 */
export function applyPlanOwners(crew: CrewMember[], owners: { topic: string; ownerId: string | null; updatedAt: Date }[]): CrewMember[] {
  const latest = new Map<string, string>();
  for (const o of [...owners].sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())) {
    if (o.ownerId && o.topic && o.topic !== "other") latest.set(o.topic, o.ownerId);
  }
  if (!latest.size) return crew;
  return crew.map((c) => {
    const kept = c.topics.filter((t) => !latest.has(t));
    const taken = [...latest].filter(([, id]) => id === c.id).map(([t]) => t);
    return { ...c, topics: [...new Set([...kept, ...taken])] };
  });
}

/** A crew member named in chat ("Priya", "@priya", "priya_k"), by name or any handle. */
export function crewByName(crew: CrewMember[], name: string | null | undefined): CrewMember | null {
  const n = (name ?? "").trim().replace(/^@/, "").toLowerCase();
  if (!n) return null;
  return (
    crew.find((c) => c.name.toLowerCase() === n) ??
    crew.find((c) => Object.values(c.handles).some((h) => h.toLowerCase() === n)) ??
    crew.find((c) => c.name.toLowerCase().split(/\s+/)[0] === n) ??
    null
  );
}

// ── Reading the crew's own chat ───────────────────────────────────────────

export const PlanReadSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      kind: z.enum(["decision", "task", "owner", "question"]),
      title: z.string(),
      text: z.string(),
      topic: z.enum(TOPICS),
      owner: z.string().nullable(),
      due: z.string().nullable(),
      for_members: z.boolean(),
    }),
  ),
  replaces: z.array(z.string()),
  done: z.array(z.string()),
});
export type PlanRead = z.infer<typeof PlanReadSchema>;

const PLAN_READ_SYSTEM = `You keep the living event plan for Ferri, the AI teammate of a community that runs events. You read one message from the organizing crew's own chat room, with the messages around it, and say what it adds to or changes in the plan. Most messages add nothing: return empty lists then. A wrong item is noise in the plan, so be strict.

items: what this message itself settles or adds. Kinds:
- decision: something the crew has now settled about the event: a date, time, place, format, rule, cap, menu, budget line, prize ("ok we're doing it on 21 Nov at the makerspace", "teams of up to 4", "let's go with pizza"). Not ideas, questions or proposals ("should we cap teams?", "maybe 4?"): those are settled only by a later message, which is read on its own. Agreeing ("agreed", "yes") settles the proposal it agrees with: then the decision is that proposal, in full.
- owner: a person takes charge of a whole area ("Priya will handle food", "Arjun owns registration", "I'll take care of the venue"). topic is that area; owner is the person's name. "I" or "me" means the sender.
- task: one concrete job someone will do, usually with a deadline ("Arjun, book the projector by Friday", "I'll print the badges tomorrow", "someone needs to order t-shirts by the 15th"). owner is who does it (null when nobody was named); due is the deadline.
- question: a decision the event still needs that the crew explicitly leaves open ("we still need to pick a venue", "we haven't decided the team size"). Not questions asked to someone in passing.
Fields: title is 2 to 5 words ("Event date", "Projector booking"). text is one standalone statement with every fact it needs from the chat ("Lantern Build Night is on 21 November at the Koramangala Makerspace."). topic is the closest of the topic list. owner is a crew member's name as listed under Crew, or null. due is ISO 8601 with the offset, resolved against Now ("by Friday" means Friday 6 PM local unless a time is said), or null. for_members is true when participants or the community need to know it (dates, venue, rules, team size, prizes, schedule, menu), false for crew-only logistics (who buys tape, budgets, volunteer shifts, tasks).

Use the current plan. Do not add an item the plan already has with the same meaning. When this message changes something already decided, add the new decision and put the old item's id in replaces. When it says a task is finished ("projector booked", "badges are printed") or settles an open question, put that item's id in done (and add the decision that settles a question as a new item). Taking a task on is not finishing it: "yep, on it", "will do", "sure, I'll handle it" and "working on it" are never done.`;

export async function readPlanChat(input: {
  choice: ModelChoice;
  sender: string;
  message: string;
  before: ChatLine[];
  after?: ChatLine[];
  plan: PlanItem[];
  crew: CrewMember[];
  now: string;
}): Promise<{ read: PlanRead | null; replaces: PlanItem[]; done: PlanItem[]; usage: Usage; latencyMs: number }> {
  const { text, byShort } = shortPlanIds(input.plan, input.crew);
  const lines = (l: ChatLine[] | undefined) => (l?.length ? l.map((x) => `${x.sender}: ${x.body}`).join("\n") : "(none)");
  const crew = input.crew.map((c) => `- ${c.name} (${Object.values(c.handles).join(", ") || "no handles"})`).join("\n") || "(none)";
  const out = await structuredCall({
    choice: input.choice,
    system: [{ type: "text", text: PLAN_READ_SYSTEM, cache_control: { type: "ephemeral" } }],
    user:
      `Now: ${input.now}\n\nTopics: ${TOPICS.join(", ")}\n\nCrew:\n${crew}\n\nCurrent plan:\n${text}\n\n` +
      `Messages before it:\n${lines(input.before.slice(-8))}\n\nThe message, from ${input.sender} (crew):\n${input.message}\n\n` +
      `Messages after it:\n${lines(input.after)}`,
    schema: PlanReadSchema,
    maxTokens: 2500,
  });
  const pick = (ids: string[] | undefined) => [...new Set((ids ?? []).map((id) => byShort.get(id.trim().toUpperCase())).filter((x): x is PlanItem => !!x))];
  const read = out.data
    ? { ...out.data, items: out.data.items.filter((i) => i.text.trim() && i.title.trim()) }
    : null;
  return { read, replaces: pick(read?.replaces), done: pick(read?.done), usage: out.usage, latencyMs: out.latencyMs };
}

// ── Drafting the agenda ───────────────────────────────────────────────────

export const AgendaSchema = z.strictObject({
  summary: z.string(),
  agenda: z.string(),
  decisions: z.array(
    z.strictObject({
      title: z.string(),
      proposal: z.string(),
      topic: z.enum(TOPICS),
      for_members: z.boolean(),
      why: z.string(),
    }),
  ),
});
export type AgendaDraft = z.infer<typeof AgendaSchema>;

const AGENDA_SYSTEM = `You help the organizing crew of a community event plan it. They asked Ferri, their AI teammate, to draft the agenda. You write a draft run of show and list the key decisions the event still needs, each with a concrete proposal the crew can confirm with one tap.

Ground everything in the event block, the knowledge, and the current plan. Confirmed decisions in the plan are fixed facts: use them, never propose them again. Do not invent sponsors, people, prizes or prices; when the knowledge does not settle something the agenda needs, put a sensible placeholder in the agenda and mark it "(to confirm)".

- summary: one or two sentences for the crew room about what you drafted.
- agenda: the run of show as plain text lines, one block per line, with day and time ("Sat 10:00  Doors open, check-in"). At most 30 lines. No markdown headings or tables.
- decisions: the key decisions still open that the event cannot run without (for example date and time, venue, team size, judging format, food, registration cap), at most 6, most important first. Skip anything the plan already confirms. Each has title (2 to 4 words, like "Team size"), proposal (one standalone statement of what you propose, concrete, like "Teams of 2 to 4 people."; no "(to confirm)" marker, the card already asks), topic (closest of the topic list), for_members (participants need to know it once confirmed) and why (one short line: why this, from the knowledge or common practice).`;

export async function draftAgenda(input: {
  choice: ModelChoice;
  kb: LiveKnowledge;
  eventId: string;
  request: string;
  plan: PlanItem[];
  crew: CrewMember[];
  now: string;
}): Promise<{ draft: AgendaDraft | null; usage: Usage; latencyMs: number }> {
  const event = input.kb.events.find((e) => e.id === input.eventId);
  const tz = input.kb.community.timezone;
  const eventBlock = event
    ? [
        `<event name="${event.name}" stage="${event.stage}">`,
        `Starts: ${event.startsAt ? formatWhen(event.startsAt, tz) : "not set"}`,
        `Ends: ${event.endsAt ? formatWhen(event.endsAt, tz) : "not set"}`,
        `Venue: ${event.venue ?? "not set"}`,
        event.instructions || "",
        "</event>",
      ].join("\n")
    : "(no event)";
  const knowledge = renderKnowledge(input.kb.entries.filter((e) => e.eventId === input.eventId || e.eventId === null)).text;
  const { text: plan } = shortPlanIds(input.plan, input.crew);
  const out = await structuredCall({
    choice: input.choice,
    system: [{ type: "text", text: AGENDA_SYSTEM, cache_control: { type: "ephemeral" } }],
    user:
      `Now: ${input.now}\n\nTopics: ${TOPICS.join(", ")}\n\n${renderInstructions(input.kb)}\n\n${eventBlock}\n\n` +
      `Knowledge:\n${knowledge}\n\nCurrent plan:\n${plan}\n\nThe request:\n${input.request}`,
    schema: AgendaSchema,
    maxTokens: 6000,
  });
  const d = out.data;
  const draft =
    d && d.agenda.trim()
      ? {
          summary: d.summary.trim(),
          agenda: d.agenda.trim().slice(0, 6000),
          decisions: d.decisions.filter((x) => x.title.trim() && x.proposal.trim()).slice(0, 6),
        }
      : null;
  return { draft, usage: out.usage, latencyMs: out.latencyMs };
}

// ── The plan as text ──────────────────────────────────────────────────────

function ownerName(item: PlanItem, crew: CrewMember[]): string | null {
  return item.ownerId ? (crew.find((c) => c.id === item.ownerId)?.name ?? null) : null;
}

/** The Switch document: what is decided, waiting, owned, due and open, then the agenda draft. */
export function renderPlanDocument(input: {
  eventName: string;
  items: PlanItem[];
  crew: CrewMember[];
  agenda: { text: string; requestedBy: string; createdAt: Date } | null;
  timeZone: string;
  now?: Date;
}): string {
  const { items, crew, timeZone } = input;
  const when = (d: Date) => formatWhen(d, timeZone);
  const out: string[] = [
    `# ${input.eventName}: the plan`,
    "",
    `Kept by Ferri from the crew's chat, cards and Desk. Updated ${when(input.now ?? new Date())}.`,
    "",
  ];
  const section = (title: string, rows: string[]) => {
    out.push(`## ${title}`, "", ...(rows.length ? rows : ["(none yet)"]), "");
  };
  const by = (i: PlanItem) => (i.decidedBy ? ` (${i.decidedBy})` : "");
  section(
    "Decided",
    items.filter((i) => i.kind === "decision" && i.status === "confirmed").map((i) => `- **${i.title}**: ${i.text}${by(i)}${i.forMembers ? "" : " [crew only]"}`),
  );
  section(
    "Waiting for an OK",
    items.filter((i) => i.status === "proposed").map((i) => `- **${i.title}**: ${i.text} (proposed by Ferri, on a card in the crew room)`),
  );
  const owners = new Map<string, string[]>();
  for (const c of crew) for (const t of c.topics) owners.set(t, [...(owners.get(t) ?? []), c.name]);
  section(
    "Who owns what",
    [...owners].sort(([a], [b]) => a.localeCompare(b)).map(([t, names]) => `- ${t}: ${names.join(", ")}`),
  );
  const tasks = items.filter((i) => i.kind === "task" && (i.status === "confirmed" || i.status === "done"));
  tasks.sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity));
  section(
    "Tasks and deadlines",
    tasks.map((i) => {
      const who = ownerName(i, crew) ?? "nobody yet";
      const due = i.dueAt ? `, due ${when(i.dueAt)}` : "";
      return `- [${i.status === "done" ? "x" : " "}] ${i.text} (${who}${due})`;
    }),
  );
  section(
    "Still open",
    items.filter((i) => i.kind === "question" && i.status === "confirmed").map((i) => `- ${i.text}`),
  );
  if (input.agenda) {
    out.push(`## Agenda draft`, "", `Drafted for ${input.agenda.requestedBy} at ${when(input.agenda.createdAt)}.`, "", "```", input.agenda.text, "```", "");
  }
  return out.join("\n");
}

/** "@ferri what's the plan?": a short answer for chat. */
export function planSummary(input: { items: PlanItem[]; crew: CrewMember[]; timeZone: string; now?: Date }): string {
  const { items, crew } = input;
  const now = (input.now ?? new Date()).getTime();
  const when = (d: Date) => formatWhen(d, input.timeZone);
  const decided = items.filter((i) => i.kind === "decision" && i.status === "confirmed");
  const waiting = items.filter((i) => i.status === "proposed");
  const open = items.filter((i) => i.kind === "question" && i.status === "confirmed");
  const tasks = items
    .filter((i) => i.kind === "task" && i.status === "confirmed")
    .sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity));
  if (!decided.length && !waiting.length && !open.length && !tasks.length) {
    return "The plan is empty so far. Decide things in this room and I'll keep track, or say “draft the agenda”.";
  }
  const parts: string[] = [];
  if (decided.length) parts.push(`Decided: ${decided.map((i) => `${i.title} (${i.text.replace(/\.$/, "")})`).join("; ")}.`);
  if (waiting.length) parts.push(`Waiting for an OK on a card: ${waiting.map((i) => i.title).join(", ")}.`);
  if (open.length) parts.push(`Still open: ${open.map((i) => i.text.replace(/\.$/, "")).join("; ")}.`);
  if (tasks.length) {
    const lines = tasks.slice(0, 6).map((i) => {
      const late = i.dueAt && i.dueAt.getTime() < now ? " (overdue)" : "";
      return `${i.title} (${ownerName(i, crew) ?? "nobody yet"}${i.dueAt ? `, ${when(i.dueAt)}` : ""}${late})`;
    });
    parts.push(`Next up: ${lines.join("; ")}${tasks.length > 6 ? `, and ${tasks.length - 6} more` : ""}.`);
  }
  return parts.join("\n");
}

/** Plan items in display order, for Desk. */
export function sortPlan(items: PlanItem[]): PlanItem[] {
  return [...items].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

/** Confirmed member-facing decisions not yet saved as knowledge. */
export async function decisionsToSave(db: Db, eventId: string): Promise<PlanItem[]> {
  return db
    .select()
    .from(planItems)
    .where(and(eq(planItems.eventId, eventId), eq(planItems.kind, "decision"), eq(planItems.status, "confirmed"), eq(planItems.forMembers, true)));
}

/** Owner items that route cards: confirmed, with an owner. */
export async function planOwners(db: Db, eventIds: string[]): Promise<{ topic: string; ownerId: string | null; updatedAt: Date }[]> {
  if (!eventIds.length) return [];
  return db
    .select({ topic: planItems.topic, ownerId: planItems.ownerId, updatedAt: planItems.updatedAt })
    .from(planItems)
    .where(and(inArray(planItems.eventId, eventIds), eq(planItems.kind, "owner"), eq(planItems.status, "confirmed")));
}
