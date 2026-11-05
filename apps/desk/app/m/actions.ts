"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { answerAs, replyAnswer, skip, type CardAnswer } from "@/lib/cards";
import { community, db } from "@/lib/db";
import { linkCrewAccount, pushToUsers, removePushSubscription, savePushSubscription, vapidFromEnv } from "@/lib/ferri";
import { requirePocketUser } from "@/lib/session";

const str = (f: FormData, k: string) =>
  String(f.get(k) ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
const go = (path: string, note: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}note=${encodeURIComponent(note)}`);

// ── Cards ────────────────────────────────────────────────────────────────

async function answer(cardId: string, a: CardAnswer, done: string) {
  const user = await requirePocketUser();
  const r = await answerAs(user, cardId, a);
  revalidatePath("/m", "layout");
  revalidatePath("/cards");
  if (!r.ok) go(`/m/c/${cardId}`, r.note);
  go("/m", done);
}

export async function pocketAnswer(form: FormData) {
  const cardId = str(form, "cardId");
  const text = str(form, "text");
  if (!text) go(`/m/c/${cardId}`, "Write the answer first.");
  await answer(cardId, { selected: [], text }, "Sent. Ferri tells everyone who asked, in their own app, and saves it for next time.");
}

export async function pocketSkip(form: FormData) {
  await answer(str(form, "cardId"), skip, "Okay. Nobody is sent anything new.");
}

export async function pocketSendReply(form: FormData) {
  const cardId = str(form, "cardId");
  const a = await replyAnswer(cardId, str(form, "text"));
  await answer(cardId, a, a.text ? "Sent your version." : "Sent Ferri's reply.");
}

export async function pocketDontSend(form: FormData) {
  await answer(str(form, "cardId"), skip, "Okay. That reply is not sent.");
}

// ── Who I am on the crew ─────────────────────────────────────────────────

export async function linkMe(form: FormData) {
  const user = await requirePocketUser();
  const c = await community();
  const crewMemberId = str(form, "crewMemberId");
  await linkCrewAccount(db(), { communityId: c.id, crewMemberId, email: crewMemberId ? user.email : null });
  revalidatePath("/m", "layout");
  go("/m/me", "Linked. Cards for you now buzz this phone once notifications are on.");
}

export async function unlinkMe(form: FormData) {
  await requirePocketUser();
  const c = await community();
  await linkCrewAccount(db(), { communityId: c.id, crewMemberId: str(form, "crewMemberId"), email: null });
  revalidatePath("/m", "layout");
  go("/m/me", "Unlinked.");
}

// ── Push ─────────────────────────────────────────────────────────────────

export async function pushKey(): Promise<string | null> {
  return vapidFromEnv()?.publicKey ?? null;
}

export async function savePush(json: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requirePocketUser();
  try {
    const ua = (await headers()).get("user-agent");
    await savePushSubscription(db(), user.uid, JSON.parse(json), ua);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function removePush(endpoint: string): Promise<void> {
  await requirePocketUser();
  await removePushSubscription(db(), endpoint);
}

export async function testPush(): Promise<{ sent: number; error?: string }> {
  const user = await requirePocketUser();
  if (!vapidFromEnv()) return { sent: 0, error: "Push keys are missing on the server (run `pnpm push:keys`)." };
  const r = await pushToUsers(db(), [user.uid], {
    kind: "test",
    title: "Ferri Pocket is on",
    body: "Questions for you will show up here, like this one.",
    url: "/m",
    tag: "ferri-test",
    renotify: true,
  });
  if (!r.sent) return { sent: 0, error: r.failed ? "The push service refused it. Turn notifications off and on again." : "No device is subscribed yet." };
  return { sent: r.sent };
}
