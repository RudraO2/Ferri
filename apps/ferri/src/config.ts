import path from "node:path";
import { fileURLToPath } from "node:url";
import { modelsFromEnv } from "@ferri/knowledge";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "../../..");

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env and run \`pnpm setup:switch\`.`);
  }
  return value;
}

const models = modelsFromEnv();

export const config = {
  switchUrl: process.env.SWITCH_URL ?? "http://localhost:8000",
  agentId: required("FERRI_AGENT_ID"),
  agentKey: required("FERRI_AGENT_KEY"),
  /** Ferri's Switch handle, as in `@ferri`. */
  agentName: process.env.FERRI_AGENT_NAME ?? "ferri",
  /** Answers (Sonnet in production, Haiku in tests). */
  modelMain: models.main,
  /** Per-message triage. */
  modelFast: models.fast,
  /** Which community this install serves; the oldest one when unset. */
  community: process.env.FERRI_COMMUNITY || undefined,
  /** Spec 01's cursor file, imported into Postgres once. */
  legacyStateDir: path.join(repoRoot, ".ferri-state"),
  skillsDir: path.join(repoRoot, "skills"),
  /** Messages older than this when they arrive (catch-up after downtime) get no reply. */
  maxReplyAgeMs: 10 * 60 * 1000,
  /**
   * For a question nobody addressed to Ferri: how long to wait so a person can
   * answer first. Ferri then checks the room again before stepping in.
   */
  roomGraceMs: Number(process.env.FERRI_ROOM_GRACE_SECONDS ?? 20) * 1000,
  /** Where question cards go when the event names no crew room (`pnpm setup:switch` writes it). */
  crewRoomId: process.env.FERRI_CREW_ROOM_ID || undefined,
  /** Rooms that get the knowledge mirror document. */
  mirrorRoomIds: [process.env.FERRI_LAB_ROOM_ID, process.env.FERRI_CREW_ROOM_ID].filter((x): x is string => Boolean(x)),
  /** Sibling Switch checkout's .env, for the admin password fallback. */
  switchEnvFile: path.join(repoRoot, "..", "switch", ".env"),
  /** Test override for the ladder's T (nudge at T, escalate at 2T). Unset: 10 min live, 2 h before. */
  nudgeSeconds: optionalNumber(process.env.FERRI_NUDGE_SECONDS),
  /** Test override for how long a card stays open. Unset: 24 h or the event's end. */
  cardTtlSeconds: optionalNumber(process.env.FERRI_CARD_TTL_SECONDS),
  outcomePollMs: 2000,
  ladderTickMs: 5000,
};

function optionalNumber(v: string | undefined): number | undefined {
  if (v === undefined || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
