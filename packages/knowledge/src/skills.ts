import fs from "node:fs";
import path from "node:path";
import { and, desc, eq, isNull } from "drizzle-orm";
import { skillRevisions, skills, type Db } from "@ferri/db";
import type { Effort, ModelChoice } from "./model.ts";

/** Join skill files (markdown) in order into one stable prompt head. */
export function loadSkills(dir: string, names: string[]): string {
  return names.map((n) => fs.readFileSync(path.join(dir, `${n}.md`), "utf8").trim()).join("\n\n");
}

/** The default text of a skill: its file in skills/ ("desks/judging" is skills/desks/judging.md), or null. */
export function defaultSkill(dir: string, key: string): string | null {
  if (!/^[a-z0-9][a-z0-9/_-]*$/.test(key) || key.includes("..")) return null;
  try {
    return fs.readFileSync(path.join(dir, `${key}.md`), "utf8").trim();
  } catch {
    return null;
  }
}

/**
 * The text of one skill as the community runs it (spec 21): the edited row in
 * `skills` when there is one that was not reset, else the default file.
 */
export async function skillText(db: Db, dir: string, communityId: string, key: string): Promise<{ text: string; version: number; edited: boolean } | null> {
  const [row] = await db
    .select({ body: skills.body, version: skills.version })
    .from(skills)
    .where(and(eq(skills.communityId, communityId), eq(skills.key, key), isNull(skills.resetAt)))
    .limit(1);
  if (row) return { text: row.body.trim(), version: row.version, edited: true };
  const file = defaultSkill(dir, key);
  return file === null ? null : { text: file, version: 0, edited: false };
}

/** The persona and the answer rules, as the community runs them. */
export async function loadCommunitySkills(db: Db, dir: string, communityId: string, names = ["ferri", "librarian"]): Promise<string> {
  const parts: string[] = [];
  for (const n of names) {
    const s = await skillText(db, dir, communityId, n);
    if (s) parts.push(s.text);
  }
  return parts.join("\n\n");
}

// ── Editing skills (spec 21: Desk's Skills page, custom desks Ferri writes) ──

/**
 * The repo's skills/ folder from a working directory: FERRI_SKILLS_DIR, else
 * `skills/` here or two levels up (Desk runs in apps/desk).
 */
export function skillsDirFrom(env: Record<string, string | undefined> = process.env, cwd = process.cwd()): string {
  if (env.FERRI_SKILLS_DIR?.trim()) return path.resolve(env.FERRI_SKILLS_DIR.trim());
  for (const dir of [path.join(cwd, "skills"), path.join(cwd, "..", "..", "skills"), path.join(cwd, "..", "skills")]) {
    if (fs.existsSync(path.join(dir, "ferri.md"))) return path.resolve(dir);
  }
  return path.resolve(cwd, "..", "..", "skills");
}

/** Every default skill file as its key ("ferri", "desks/judging", "packs/hackathon"), sorted with ferri and librarian first. */
export function listSkillFiles(dir: string): string[] {
  const keys: string[] = [];
  const walk = (sub: string) => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(path.join(dir, sub), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const rel = sub ? `${sub}/${e.name}` : e.name;
      if (e.isDirectory()) walk(rel);
      else if (e.isFile() && e.name.endsWith(".md") && e.name.toLowerCase() !== "readme.md") keys.push(rel.slice(0, -3));
    }
  };
  walk("");
  return sortSkillKeys(keys.filter((k) => /^[a-z0-9][a-z0-9/_-]*$/.test(k)));
}

const SKILL_ORDER = ["ferri", "librarian"];
export function sortSkillKeys(keys: string[]): string[] {
  const rank = (k: string) => (SKILL_ORDER.includes(k) ? SKILL_ORDER.indexOf(k) : k.startsWith("desks/") ? 10 : k.startsWith("packs/") ? 20 : 30);
  return [...new Set(keys)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export type SkillRow = typeof skills.$inferSelect;
export type SkillRevision = typeof skillRevisions.$inferSelect;

/**
 * Save a new text for a skill: the row is created on the first edit
 * (version 1; the file stays the default) and each later save is the next
 * version, each with a revision. A save after a reset makes the row live again.
 */
export async function saveSkill(
  db: Db,
  input: { communityId: string; key: string; body: string; by: string; origin?: "desk" | "ferri" },
): Promise<{ version: number; changed: boolean }> {
  const body = input.body.replace(/\r\n?/g, "\n").trim();
  if (!body) throw new Error("A skill cannot be empty. Use Reset to go back to the default.");
  if (!/^[a-z0-9][a-z0-9/_-]*$/.test(input.key) || input.key.includes("..")) throw new Error("Not a skill key.");
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(skills).where(and(eq(skills.communityId, input.communityId), eq(skills.key, input.key))).for("update");
    if (row && !row.resetAt && row.body.trim() === body) return { version: row.version, changed: false };
    if (!row) {
      const [made] = await tx
        .insert(skills)
        .values({ communityId: input.communityId, key: input.key, body, version: 1, origin: input.origin ?? "desk", editedBy: input.by })
        .returning();
      await tx.insert(skillRevisions).values({ skillId: made!.id, version: 1, body, editedBy: input.by, change: "created" });
      return { version: 1, changed: true };
    }
    const version = row.version + 1;
    await tx.update(skills).set({ body, version, editedBy: input.by, resetAt: null, updatedAt: new Date() }).where(eq(skills.id, row.id));
    await tx.insert(skillRevisions).values({ skillId: row.id, version, body, editedBy: input.by, change: "edited" });
    return { version, changed: true };
  });
}

/**
 * Back to the default file: the row keeps its history but is not used
 * (`resetAt`), with a "reset" revision holding the default text. A skill with
 * no default file (a custom desk) cannot be reset.
 */
export async function resetSkill(db: Db, dir: string, input: { communityId: string; key: string; by: string }): Promise<{ version: number } | null> {
  const def = defaultSkill(dir, input.key);
  if (def === null) throw new Error("This skill has no default file to go back to.");
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(skills).where(and(eq(skills.communityId, input.communityId), eq(skills.key, input.key))).for("update");
    if (!row || row.resetAt) return null;
    const version = row.version + 1;
    await tx.update(skills).set({ version, resetAt: new Date(), editedBy: input.by, updatedAt: new Date() }).where(eq(skills.id, row.id));
    await tx.insert(skillRevisions).values({ skillId: row.id, version, body: def, editedBy: input.by, change: "reset" });
    return { version };
  });
}

/** A community's skill rows (edited, reset or written by Ferri). */
export async function communitySkillRows(db: Db, communityId: string): Promise<SkillRow[]> {
  return db.select().from(skills).where(eq(skills.communityId, communityId));
}

/** One skill's revisions, newest first. */
export async function skillRevisionList(db: Db, skillId: string): Promise<SkillRevision[]> {
  return db.select().from(skillRevisions).where(eq(skillRevisions.skillId, skillId)).orderBy(desc(skillRevisions.version));
}

/** Split a skill file into its YAML front matter (raw text) and its body. */
export function splitFrontMatter(text: string): { front: string; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text.trim());
  return m ? { front: m[1]!, body: m[2]!.trim() } : { front: "", body: text.trim() };
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
