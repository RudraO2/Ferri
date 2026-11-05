import fs from "node:fs";
import path from "node:path";
import type { Effort, ModelChoice } from "./model.js";

/** Join skill files (markdown) in order into one stable prompt head. */
export function loadSkills(dir: string, names: string[]): string {
  return names.map((n) => fs.readFileSync(path.join(dir, `${n}.md`), "utf8").trim()).join("\n\n");
}

const effort = (v: string | undefined, fallback: Effort): Effort =>
  v === "low" || v === "medium" || v === "high" ? v : fallback;

/** Model choices from the environment. Tests run Haiku at low effort. */
export function modelsFromEnv(env = process.env): { main: ModelChoice; fast: ModelChoice } {
  return {
    main: { model: env.FERRI_MODEL_MAIN ?? "claude-sonnet-5-5", effort: effort(env.FERRI_EFFORT_MAIN, "low") },
    fast: { model: env.FERRI_MODEL_FAST ?? "claude-haiku-5-5", effort: effort(env.FERRI_EFFORT_FAST, "low") },
  };
}
