import { z } from "zod";
import { structuredCall, type ModelChoice, type Usage } from "./model.ts";

export interface ChatLine {
  sender: string;
  body: string;
}

export const TOPICS = [
  "schedule",
  "food",
  "venue",
  "registration",
  "teams",
  "prizes",
  "judging",
  "rules",
  "tech",
  "sponsors",
  "community",
  "other",
] as const;

export const TriageSchema = z.strictObject({
  is_question: z.boolean(),
  for_organizers: z.boolean(),
  already_answered: z.boolean(),
  topic: z.enum(TOPICS),
  search_terms: z.array(z.string()),
  language: z.string(),
});
export type Triage = z.infer<typeof TriageSchema>;

const SYSTEM = `You triage chat messages for Ferri, the AI teammate of a community that runs events (hackathons, meetups, parties). Ferri answers questions about the community and its events from a knowledge base. You decide whether one message is a question Ferri should look at. You never answer it.

Fields:
- is_question: the message asks for information or help, even without a question mark ("need the wifi password", "kab shuru hoga").
- for_organizers: the question is about the community or one of its events (schedule, food, venue, registration, teams, prizes, judging, rules, tech setup, sponsors, contacts), the kind of thing an organizer would answer. False for personal chat between members ("anyone want chai?", "how was your weekend?", "can someone review my code?"), jokes, rhetorical questions, and questions clearly aimed at one named person about themselves.
- already_answered: someone in "Messages after it" has already given a real answer to this question. A "no idea" or "same question" is not an answer. False when there are no messages after it.
- topic: the closest topic.
- search_terms: 2 to 6 short English keywords for a full text search of the knowledge base, with useful synonyms (for "wifi" also "wi-fi" and "internet"). Translate when the message is not in English. Empty when it is not a question.
- language: the language of the message as an English name ("English", "Hindi", "Hinglish", "Kannada").`;

function lines(list: ChatLine[]): string {
  return list.length ? list.map((l) => `${l.sender}: ${l.body}`).join("\n") : "(none)";
}

export async function triageMessage(input: {
  choice: ModelChoice;
  roomName: string;
  sender: string;
  message: string;
  before: ChatLine[];
  after?: ChatLine[];
}): Promise<{ triage: Triage | null; model: string; usage: Usage; latencyMs: number; refused: boolean }> {
  const user = [
    `Room: ${input.roomName}`,
    `Earlier messages:\n${lines(input.before.slice(-8))}`,
    `The message, from ${input.sender}:\n${input.message}`,
    `Messages after it:\n${lines(input.after ?? [])}`,
  ].join("\n\n");
  const out = await structuredCall({
    choice: input.choice,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    user,
    schema: TriageSchema,
    maxTokens: 2000,
  });
  return { triage: out.data, model: out.model, usage: out.usage, latencyMs: out.latencyMs, refused: out.refused };
}

/** Whether Ferri should try to answer a message nobody addressed to it. */
export function worthAnswering(t: Triage): boolean {
  return t.is_question && t.for_organizers && !t.already_answered;
}
