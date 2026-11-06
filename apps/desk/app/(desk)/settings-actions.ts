"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { community, db } from "@/lib/db";
import {
  SETTING_INFO,
  SPACE_KEYS,
  cleanSettings,
  normalizeSettingInput,
  parseSetting,
  settingLevels,
  writeSettings,
  type FerriSettings,
  type SettingKey,
  type SettingsTarget,
} from "@/lib/ferri";
import { requireUser } from "@/lib/session";

/**
 * Customization (spec 21): the settings forms on the Community page, each
 * event page and the Spaces page. A blank field (or "inherit") means the
 * level does not set it; Ferri reads the change on its next use.
 */

const str = (f: FormData, k: string) =>
  String(f.get(k) ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
const back = (path: string, note: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}note=${encodeURIComponent(note)}`);
// Only paths inside Desk.
const safeBack = (v: string) => (v.startsWith("/") && !v.startsWith("//") ? v : "/community");

async function targetFrom(form: FormData): Promise<{ target: SettingsTarget; scope: { communityId: string; eventId: string | null; spaceId: string | null }; level: "community" | "event" | "space" }> {
  const c = await community();
  const level = str(form, "level");
  const eventId = str(form, "eventId");
  const spaceId = str(form, "spaceId");
  if (level === "space" && eventId && spaceId) return { level, target: { level: "space", eventId, spaceId }, scope: { communityId: c.id, eventId, spaceId } };
  if (level === "event" && eventId) return { level, target: { level: "event", eventId }, scope: { communityId: c.id, eventId, spaceId: null } };
  return { level: "community", target: { level: "community", communityId: c.id }, scope: { communityId: c.id, eventId: null, spaceId: null } };
}

export async function saveSettings(form: FormData) {
  const user = await requireUser();
  const path = safeBack(str(form, "back"));
  const { target, scope, level } = await targetFrom(form);
  const raw = await settingLevels(db(), scope);
  const own = cleanSettings(raw[level], level === "space" ? SPACE_KEYS : undefined) as Record<string, unknown>;
  const set: Partial<Record<SettingKey, FerriSettings[SettingKey]>> = {};
  const remove: SettingKey[] = [];
  const bad: string[] = [];
  for (const info of SETTING_INFO) {
    if (level === "space" && !SPACE_KEYS.includes(info.key)) continue;
    if (!form.has(`s_${info.key}`)) continue;
    const input = str(form, `s_${info.key}`);
    if (!input || input === "__inherit") {
      if (info.key in own) remove.push(info.key);
      continue;
    }
    const value = parseSetting(info.key, normalizeSettingInput(info.key, input));
    if (value === undefined) {
      bad.push(`${info.label} (${info.type === "number" ? `${info.min ?? 0} to ${info.max ?? "any"}` : info.type === "choice" ? info.choices!.join(", ") : "on or off"})`);
      continue;
    }
    if (own[info.key] !== value) set[info.key] = value;
  }
  if (!Object.keys(set).length && !remove.length) {
    back(path, bad.length ? `Not saved: ${bad.join("; ")}.` : "Nothing changed.");
  }
  await writeSettings(db(), target, { set: set as Partial<FerriSettings>, remove, by: user.name });
  revalidatePath("/", "layout");
  const changed = [...Object.keys(set), ...remove].length;
  back(path, `Saved ${changed} setting${changed === 1 ? "" : "s"}${bad.length ? `; not saved: ${bad.join("; ")}` : ""}. Ferri uses them from its next message.`);
}

/** The Reset button next to one setting: this level stops setting it. */
export async function resetSetting(form: FormData) {
  const user = await requireUser();
  const path = safeBack(str(form, "back"));
  const key = str(form, "resetKey") as SettingKey;
  const info = SETTING_INFO.find((i) => i.key === key);
  if (!info) back(path, "No such setting.");
  const { target } = await targetFrom(form);
  await writeSettings(db(), target, { remove: [key], by: user.name });
  revalidatePath("/", "layout");
  back(path, `${info!.label} is back to what applies above.`);
}
