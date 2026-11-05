import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";

const client = new Anthropic();

export interface TranscriptLine {
  sender: string;
  body: string;
  timestamp: number;
}

function loadPersona(): string {
  return fs.readFileSync(path.join(config.skillsDir, "ferri.md"), "utf8");
}

function renderTranscript(lines: TranscriptLine[]): string {
  return lines
    .map((l) => `[${new Date(l.timestamp).toISOString()}] ${l.sender}: ${l.body}`)
    .join("\n");
}

/**
 * Write Ferri's reply to one message, given the room's recent history.
 * Returns null when the model declines (stop_reason "refusal").
 */
export async function reply(input: {
  roomName: string;
  history: TranscriptLine[];
  from: string;
  message: string;
}): Promise<string | null> {
  const persona = loadPersona();
  const userText = [
    `Room: ${input.roomName}`,
    `Recent conversation:\n${renderTranscript(input.history) || "(nothing yet)"}`,
    `New message from ${input.from}:\n${input.message}`,
    "Write Ferri's reply.",
  ].join("\n\n");

  // `fallbacks: "default"` re-runs a declined request on Anthropic's recommended
  // fallback model server-side. Haiku has no server-side fallback, so it is sent
  // only for Sonnet and Opus. It is newer than some SDK typings, hence the cast.
  const withFallback = /sonnet|opus/.test(config.modelMain);
  const params = {
    model: config.modelMain,
    max_tokens: 2048,
    ...(withFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
    output_config: { effort: "low" },
    system: [{ type: "text", text: persona, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userText }],
  } as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

  const response = await client.beta.messages.create(params);
  if (response.stop_reason === "refusal") return null;

  const text = response.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("")
    .trim();
  return text || null;
}
