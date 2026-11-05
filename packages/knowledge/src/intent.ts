import { z } from "zod";
import { shortCardIds, type OpenCard } from "./cards.js";
import { structuredCall, type ModelChoice, type Usage } from "./model.js";
import type { ChatLine } from "./triage.js";

// ── What a crew member means when they talk to Ferri ─────────────────────

export const CrewIntentSchema = z.strictObject({
  intent: z.enum(["answer_card", "remember", "question", "other"]),
  card: z.string().nullable(),
  answer: z.string(),
  facts: z.array(z.strictObject({ heading: z.string(), text: z.string() })),
});
export type CrewIntent = z.infer<typeof CrewIntentSchema>;

const INTENT_SYSTEM = `You read a message that someone on the organizing crew wrote to Ferri, the AI teammate of their community. Ferri holds open question cards: questions from members it could not answer and is waiting on the crew for.

Decide what the crew member wants:
- answer_card: they are giving the answer to one of the open cards ("dogs are fine if they're on a leash", "tell them parking is in the basement", "yes, lunch is veg"). card is that card's id. answer is the answer as a standalone statement, in their words, with the @mention and instructions to Ferri removed; add nothing they did not say.
- remember: they want Ferri to know facts or rules for the future ("remember that...", "note: ...", "FYI the venue has lockers") and none of it answers an open card. card is null, answer is "".
- question: they are asking Ferri something. card null, answer "", facts [].
- other: anything else (thanks, chat, instructions Ferri cannot follow). card null, answer "", facts [].

facts: every fact in the message that is not part of the card answer, each as a standalone statement in their words (text) with a 2 to 6 word title (heading, for example "Quiet room closing time"). For remember, facts holds everything to keep. For answer_card, it holds only the extra facts beside the answer, often none. Never drop a fact the crew member stated.

A statement that answers an open card is answer_card even when it starts with "remember". When several cards fit, pick the one it answers best.`;

export async function crewIntent(input: {
  choice: ModelChoice;
  sender: string;
  message: string;
  open: OpenCard[];
  history: ChatLine[];
}): Promise<{ intent: CrewIntent | null; card: OpenCard | null; usage: Usage; latencyMs: number }> {
  const { text, byShort } = shortCardIds(input.open);
  const history = input.history.slice(-6).map((l) => `${l.sender}: ${l.body}`).join("\n") || "(none)";
  const out = await structuredCall({
    choice: input.choice,
    system: [{ type: "text", text: INTENT_SYSTEM, cache_control: { type: "ephemeral" } }],
    user: `Open cards:\n${text}\n\nRecent messages in the room:\n${history}\n\nMessage from ${input.sender} (crew) to Ferri:\n${input.message}`,
    schema: CrewIntentSchema,
    maxTokens: 2000,
  });
  const intent = out.data;
  let card =
    intent?.intent === "answer_card" && intent.card ? (byShort.get(intent.card.trim().toUpperCase()) ?? null) : null;
  // "answer_card" with no usable id but exactly one card open: that one.
  if (intent?.intent === "answer_card" && !card && input.open.length === 1) card = input.open[0]!;
  return { intent, card, usage: out.usage, latencyMs: out.latencyMs };
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
