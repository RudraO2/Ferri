import { z } from "zod";
import type { Db } from "@ferri/db";
import { structuredCall, type ModelChoice, type Usage } from "./model.js";
import { formatSourceLine, renderInstructions, renderKnowledge } from "./render.js";
import { searchKnowledge, type KnowledgeItem, type LiveKnowledge } from "./store.js";
import type { ChatLine } from "./triage.js";

export const AnswerSchema = z.strictObject({
  kind: z.enum(["answer", "unknown", "chat"]),
  reply: z.string(),
  source_ids: z.array(z.string()),
  missing: z.string().nullable(),
});
export type ModelAnswer = z.infer<typeof AnswerSchema>;

/** Below this many characters the whole knowledge base goes into the (cached) prompt. */
export const INLINE_LIMIT_CHARS = 60_000;

export const HOLDING_REPLY = "I don't have that yet. I'm checking with the team.";

export interface AnswerResult {
  kind: "answer" | "unknown" | "chat" | "declined" | "invalid";
  /** What Ferri would post: the reply plus the source line for answers. */
  text: string;
  sources: KnowledgeItem[];
  missing: string | null;
  /** "inline" (whole knowledge in the prompt) or "search" (full text top hits). */
  retrieval: "inline" | "search";
  /** Set when the model said "answer" but cited nothing real, so Ferri held back. */
  downgraded: boolean;
  model: string;
  usage: Usage;
  latencyMs: number;
}

export function knowledgeSize(kb: LiveKnowledge): number {
  return kb.entries.reduce((n, e) => n + e.body.length + e.heading.length + e.sourceTitle.length + 60, 0);
}

/**
 * Check the model's citations against what it was shown and build the final
 * text. An "answer" without one real citation is not trusted.
 */
export function finalizeAnswer(
  out: ModelAnswer,
  ids: Map<string, KnowledgeItem>,
): Pick<AnswerResult, "kind" | "text" | "sources" | "missing" | "downgraded"> {
  const sources: KnowledgeItem[] = [];
  for (const id of out.source_ids) {
    const item = ids.get(id.trim().toUpperCase());
    if (item && !sources.includes(item)) sources.push(item);
  }
  const reply = out.reply.trim();
  if (out.kind === "answer") {
    if (sources.length === 0 || !reply) {
      return { kind: "unknown", text: HOLDING_REPLY, sources: [], missing: null, downgraded: true };
    }
    return { kind: "answer", text: `${reply}\n\n${formatSourceLine(sources)}`, sources, missing: out.missing?.trim() || null, downgraded: false };
  }
  if (out.kind === "unknown") {
    return { kind: "unknown", text: reply || HOLDING_REPLY, sources: [], missing: null, downgraded: false };
  }
  return { kind: "chat", text: reply, sources: [], missing: null, downgraded: false };
}

export async function answerQuestion(input: {
  db: Db;
  kb: LiveKnowledge;
  choice: ModelChoice;
  /** The persona plus the librarian skill: the stable head of the prompt. */
  skills: string;
  roomName: string;
  sender: string;
  question: string;
  history: ChatLine[];
  addressed: boolean;
  /** English keywords from triage; used only when the knowledge is too big to inline. */
  searchTerms?: string[];
  now?: Date;
  /** Override the inline threshold (0 forces full text search). */
  inlineLimit?: number;
}): Promise<AnswerResult> {
  const { kb } = input;
  const inline = knowledgeSize(kb) <= (input.inlineLimit ?? INLINE_LIMIT_CHARS);
  const items = inline
    ? kb.entries
    : await searchKnowledge(input.db, kb, input.searchTerms?.length ? input.searchTerms : [input.question]);
  const rendered = renderKnowledge(items);

  const context = `${renderInstructions(kb)}\n\n${rendered.text}`;
  const system = inline
    ? [
        { type: "text" as const, text: input.skills },
        { type: "text" as const, text: context, cache_control: { type: "ephemeral" as const } },
      ]
    : [
        { type: "text" as const, text: input.skills, cache_control: { type: "ephemeral" as const } },
        { type: "text" as const, text: context },
      ];

  const now = (input.now ?? new Date()).toLocaleString("en-IN", {
    timeZone: kb.community.timezone,
    dateStyle: "full",
    timeStyle: "short",
  });
  const history = input.history.slice(-12).map((l) => `${l.sender}: ${l.body}`).join("\n") || "(nothing yet)";
  const user = [
    `Now: ${now} (${kb.community.timezone})`,
    `Room: ${input.roomName}`,
    `Recent conversation:\n${history}`,
    input.addressed
      ? `${input.sender} asked you directly:\n${input.question}`
      : `${input.sender} asked the room (not you), and you may step in only with a sourced answer:\n${input.question}`,
  ].join("\n\n");

  const out = await structuredCall({ choice: input.choice, system, user, schema: AnswerSchema, maxTokens: 8000 });
  const base = { retrieval: inline ? ("inline" as const) : ("search" as const), model: out.model, usage: out.usage, latencyMs: out.latencyMs };

  if (out.refused) return { kind: "declined", text: "", sources: [], missing: null, downgraded: false, ...base };
  if (!out.data) return { kind: "invalid", text: "", sources: [], missing: null, downgraded: false, ...base };
  return { ...finalizeAnswer(out.data, rendered.ids), ...base };
}
