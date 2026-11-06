import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

export type Effort = "low" | "medium" | "high";

export interface ModelChoice {
  model: string;
  effort: Effort;
}

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface StructuredResult<T> {
  /** Null when the model declined or the output did not match the schema. */
  data: T | null;
  refused: boolean;
  /** The model that actually answered (differs from the request after a fallback). */
  model: string;
  usage: Usage;
  latencyMs: number;
}

let shared: Anthropic | null = null;
export function anthropic(): Anthropic {
  shared ??= new Anthropic();
  return shared;
}

/** Set nested choice fields the model left as "" to their first option. True when something was changed. */
export function repairEmptyChoices(raw: unknown, issues: readonly { code: string; path: PropertyKey[]; values?: readonly unknown[] }[]): boolean {
  let changed = false;
  for (const issue of issues) {
    if (issue.code !== "invalid_value" || issue.path.length < 2 || !issue.values?.length) continue;
    let node = raw as Record<PropertyKey, unknown> | null;
    for (const key of issue.path.slice(0, -1)) node = node && typeof node === "object" ? (node[key] as Record<PropertyKey, unknown>) : null;
    const last = issue.path[issue.path.length - 1]!;
    if (node && typeof node === "object" && node[last] === "") {
      node[last] = issue.values[0];
      changed = true;
    }
  }
  return changed;
}

/** The same voice said again at the end of the request: Haiku follows tone and language there (spec 21). */
export function voiceUser(voice: string | undefined | null): string {
  if (!voice?.trim()) return "";
  return `\n\n${voice.trim()}\nWrite this text in that tone and language; names, times, links and codes stay exactly as written.`;
}

/** Spec 21: the crew's voice block (tone and language) as a system block after the cached rules, or nothing. */
export function voiceSystem(voice: string | undefined | null): Anthropic.Beta.BetaTextBlockParam[] {
  return voice?.trim() ? [{ type: "text", text: voice.trim() }] : [];
}

/**
 * One structured-output call. The schema becomes `output_config.format`, so
 * the reply is always JSON of that shape. Sonnet and Opus calls carry the
 * server-side refusal fallback; Haiku has none.
 */
export async function structuredCall<S extends z.ZodType>(opts: {
  choice: ModelChoice;
  system: Anthropic.Beta.BetaTextBlockParam[];
  user: string;
  schema: S;
  maxTokens: number;
  client?: Anthropic;
}): Promise<StructuredResult<z.infer<S>>> {
  const withFallback = /sonnet|opus/.test(opts.choice.model);
  const format = zodOutputFormat(opts.schema);
  const params = {
    model: opts.choice.model,
    max_tokens: opts.maxTokens,
    ...(withFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
    output_config: { effort: opts.choice.effort, format: { type: format.type, schema: format.schema } },
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  } as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

  const started = Date.now();
  const response = await (opts.client ?? anthropic()).beta.messages.create(params);
  const latencyMs = Date.now() - started;
  const u = response.usage;
  const usage: Usage = {
    input: u.input_tokens,
    output: u.output_tokens,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
  };
  const base = { model: response.model, usage, latencyMs };

  if (response.stop_reason === "refusal") return { data: null, refused: true, ...base };

  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    const raw = JSON.parse(text);
    let parsed = opts.schema.safeParse(raw);
    // Haiku sometimes writes "" for a nested choice it does not use ("plan.kind": ""), which voids the whole
    // answer. Such a field takes the choice's first option (its default), and the answer is read again.
    if (!parsed.success && repairEmptyChoices(raw, parsed.error.issues)) parsed = opts.schema.safeParse(raw);
    if (!parsed.success && process.env.FERRI_DEBUG_PARSE) console.error(`[structuredCall] schema mismatch: ${parsed.error.message.slice(0, 600)}\n${text.slice(0, 800)}`);
    return { data: parsed.success ? parsed.data : null, refused: false, ...base };
  } catch {
    if (process.env.FERRI_DEBUG_PARSE) console.error(`[structuredCall] not JSON:\n${text.slice(0, 800)}`);
    return { data: null, refused: false, ...base };
  }
}
