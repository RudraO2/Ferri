import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "../../..");

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env and run \`pnpm setup:switch\`.`);
  }
  return value;
}

export const config = {
  switchUrl: process.env.SWITCH_URL ?? "http://localhost:8000",
  agentId: required("FERRI_AGENT_ID"),
  agentKey: required("FERRI_AGENT_KEY"),
  modelMain: process.env.FERRI_MODEL_MAIN ?? "claude-sonnet-5-5",
  modelFast: process.env.FERRI_MODEL_FAST ?? "claude-haiku-5-5",
  stateDir: path.join(repoRoot, ".ferri-state"),
  skillsDir: path.join(repoRoot, "skills"),
  /** Messages older than this when they arrive (catch-up after downtime) get no reply. */
  maxReplyAgeMs: 10 * 60 * 1000,
};
