import "server-only";
import { db } from "./db";
import {
  communitySkillRows,
  defaultSkill,
  listSkillFiles,
  settingLevels,
  skillRevisionList,
  skillsDirFrom,
  sortSkillKeys,
  voiceBlock,
  explainSettings,
  type SkillRevision,
  type SkillRow,
} from "./ferri";
import { deskBase } from "./settings";

/**
 * Customization (spec 21): the skills that shape Ferri. The files in the
 * repo's skills/ folder are the defaults; a row in `skills` (edited in Desk,
 * or a custom desk Ferri wrote) wins until it is reset.
 */

export const skillsDir = () => skillsDirFrom();

export interface SkillListItem {
  key: string;
  hasDefault: boolean;
  row: SkillRow | null;
  /** "default", "edited by Rudra", "written by Ferri", "reset to default by Asha". */
  source: string;
  live: "default" | "edited";
}

function sourceOf(row: SkillRow | null): { source: string; live: "default" | "edited" } {
  if (!row) return { source: "default", live: "default" };
  if (row.resetAt) return { source: `reset to default by ${row.editedBy}`, live: "default" };
  if (row.origin === "ferri" && row.version === 1) return { source: "written by Ferri", live: "edited" };
  return { source: `edited by ${row.editedBy} (v${row.version})`, live: "edited" };
}

/** Every skill: the default files and the community's own rows (custom desks have no file). */
export async function skillList(communityId: string): Promise<SkillListItem[]> {
  const dir = skillsDir();
  const files = listSkillFiles(dir);
  const rows = await communitySkillRows(db(), communityId);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return sortSkillKeys([...files, ...rows.map((r) => r.key)]).map((key) => {
    const row = byKey.get(key) ?? null;
    return { key, hasDefault: files.includes(key), row, ...sourceOf(row) };
  });
}

export interface SkillDetail extends SkillListItem {
  defaultText: string | null;
  /** The text Ferri uses now. */
  text: string;
  revisions: SkillRevision[];
}

export async function skillDetail(communityId: string, key: string): Promise<SkillDetail | null> {
  const item = (await skillList(communityId)).find((s) => s.key === key);
  if (!item) return null;
  const defaultText = defaultSkill(skillsDir(), key);
  const text = item.row && !item.row.resetAt ? item.row.body : (defaultText ?? item.row?.body ?? "");
  const revisions = item.row ? await skillRevisionList(db(), item.row.id) : [];
  return { ...item, defaultText, text, revisions };
}

/** What the head of an answer prompt looks like with this skill: persona, answer rules, the skill (a desk), then the community's voice. */
export async function promptPreview(communityId: string, key: string): Promise<string> {
  const parts: string[] = [];
  for (const k of ["ferri", "librarian"]) {
    const d = await skillDetail(communityId, k);
    if (d?.text) parts.push(d.text);
  }
  if (key !== "ferri" && key !== "librarian") {
    const d = await skillDetail(communityId, key);
    if (d?.text) parts.push(d.text);
  }
  const levels = await settingLevels(db(), { communityId });
  const e = explainSettings({ base: deskBase(), community: levels.community });
  const voice = voiceBlock({ tone: String(e.tone.value), language: String(e.language.value) });
  if (voice) parts.push(voice);
  return parts.join("\n\n");
}
