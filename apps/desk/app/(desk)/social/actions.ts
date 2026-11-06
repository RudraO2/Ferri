"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { community, db } from "@/lib/db";
import { CARD_SKIP_OPTION, agentState, socialPosts } from "@/lib/ferri";
import { answerAs } from "@/lib/cards";
import { requireUser } from "@/lib/session";

const str = (f: FormData, k: string) =>
  String(f.get(k) ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
const back = (path: string, note: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}note=${encodeURIComponent(note)}`);
// The form shows India time (the community's timezone for now).
const when = (v: string) => (v ? new Date(`${v.length === 16 ? `${v}:00` : v}+05:30`).toISOString() : "");

/** A new social post: Ferri drafts it for each network and opens the card in the crew room. */
export async function requestSocialPost(form: FormData) {
  const user = await requireUser();
  const c = await community();
  const what = str(form, "what");
  if (!what) back("/social", "Say what the posts should say.");
  const key = `social_request:${randomUUID()}`;
  await db()
    .insert(agentState)
    .values({
      key,
      value: {
        communityId: c.id,
        eventId: str(form, "eventId") || null,
        what,
        networks: form.getAll("network").map(String),
        image: str(form, "image") === "poster" ? "poster" : "none",
        when: when(str(form, "when")),
        by: user.name,
      },
    });
  revalidatePath("/social");
  back("/social", "Asked. Ferri drafts the posts and opens the card in the crew room and Pocket in a few seconds.");
}

/** Answer an open social card as the signed-in person. */
export async function answerSocialCard(form: FormData) {
  const user = await requireUser();
  const cardId = str(form, "cardId");
  const choice = str(form, "choice");
  const text = str(form, "text");
  const where = str(form, "back") || "/social";
  const r = await answerAs(user, cardId, choice === "own" ? { selected: [], text } : { selected: [choice === "skip" ? CARD_SKIP_OPTION : choice], text: null });
  revalidatePath(where);
  back(where, r.ok ? (choice === "skip" ? "Not posted." : "Approved. Ferri sends it to Buffer now.") : r.note);
}

/** Delete a draft or scheduled post in Buffer (Ferri does it at its next tick). */
export async function deleteSocialPost(form: FormData) {
  await requireUser();
  const c = await community();
  const ids = form.getAll("id").map(String).filter(Boolean);
  if (!ids.length) back("/social", "Nothing picked.");
  await db()
    .update(socialPosts)
    .set({ deleteRequestedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(socialPosts.communityId, c.id), inArray(socialPosts.id, ids), inArray(socialPosts.status, ["draft", "scheduled"])));
  revalidatePath("/social");
  back("/social", "Ferri deletes it in Buffer within a few seconds.");
}
