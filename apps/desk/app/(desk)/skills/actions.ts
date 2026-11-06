"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { community, db } from "@/lib/db";
import { resetSkill, saveSkill } from "@/lib/ferri";
import { skillsDir } from "@/lib/skills";
import { requireUser } from "@/lib/session";

const str = (f: FormData, k: string) =>
  String(f.get(k) ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
const back = (key: string, note: string): never => redirect(`/skills?key=${encodeURIComponent(key)}&note=${encodeURIComponent(note)}`);

/** Save the textarea as the skill's next version (with a revision). Ferri reads it on its next use. */
export async function saveSkillText(form: FormData) {
  const user = await requireUser();
  const c = await community();
  const key = str(form, "key");
  let note: string;
  try {
    const r = await saveSkill(db(), { communityId: c.id, key, body: str(form, "body"), by: user.name, origin: "desk" });
    note = r.changed ? `Saved as version ${r.version}. Ferri uses it from its next message.` : "Nothing changed.";
  } catch (err) {
    note = (err as Error).message;
  }
  revalidatePath("/skills");
  back(key, note);
}

/** Back to the default file; the edits stay in the revisions. */
export async function resetSkillText(form: FormData) {
  const user = await requireUser();
  const c = await community();
  const key = str(form, "key");
  let note: string;
  try {
    const r = await resetSkill(db(), skillsDir(), { communityId: c.id, key, by: user.name });
    note = r ? `Back to the default (version ${r.version} in the revisions).` : "It already uses the default.";
  } catch (err) {
    note = (err as Error).message;
  }
  revalidatePath("/skills");
  back(key, note);
}
