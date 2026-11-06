"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { zonedTime } from "@/lib/announce";
import { answerAs, skip } from "@/lib/cards";
import { community, db } from "@/lib/db";
import { WRAP_MOVE_OPTION, WRAP_OFF_OPTION, cards, events, requestWrap, slugify, startFromKit, type WrapCardPayload } from "@/lib/ferri";
import { requireUser } from "@/lib/session";

// ── Wrap (spec 19): Desk's actions, as the signed-in person ───────────────

const str = (f: FormData, k: string) =>
  String(f.get(k) ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
const back = (path: string, note: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}note=${encodeURIComponent(note)}`);
/** Back to the Wrap page, or to a Pocket page when the form came from one. */
const here = (form: FormData) => {
  const b = str(form, "back");
  if (b === "/m" || b.startsWith("/m/") || b.startsWith("/wrap") || b.startsWith("/events")) return b;
  const slug = str(form, "eventSlug");
  return slug ? `/wrap?event=${encodeURIComponent(slug)}` : "/wrap";
};

async function eventIn(form: FormData) {
  const c = await community();
  const [e] = await db()
    .select()
    .from(events)
    .where(and(eq(events.id, str(form, "eventId")), eq(events.communityId, c.id)))
    .limit(1);
  return e ?? null;
}

async function openCard(eventId: string) {
  const [c] = await db()
    .select()
    .from(cards)
    .where(and(eq(cards.eventId, eventId), eq(cards.kind, "wrap"), eq(cards.status, "open")))
    .limit(1);
  return c ?? null;
}

function refresh() {
  revalidatePath("/wrap");
  revalidatePath("/events");
  revalidatePath("/m", "layout");
}

/**
 * Close the event: with an open close card, answer it through Switch (so Ferri
 * settles it like any card); otherwise leave a request Ferri's tick does at once.
 */
export async function closeEvent(form: FormData) {
  const user = await requireUser();
  const path = here(form);
  const e = await eventIn(form);
  if (!e) return back(path, "That event is gone.");
  if (e.closedAt) return back(path, `${e.name} is already closed.`);
  const how = str(form, "how");
  const moveTo = how === "move" ? str(form, "moveTo") || null : null;
  if (how === "move" && !moveTo) return back(path, "Pick the event the spaces move to.");
  const card = await openCard(e.id);
  const payload = (card?.payload ?? null) as WrapCardPayload | null;
  if (card && (how !== "move" || payload?.moveTo === moveTo)) {
    const r = await answerAs(user, card.id, { selected: [how === "move" ? WRAP_MOVE_OPTION : WRAP_OFF_OPTION], text: null });
    refresh();
    return back(path, r.ok ? `Closing ${e.name}. Ferri says goodbye in the crew room and turns the spaces ${moveTo ? "over" : "Off"} in a moment.` : r.note);
  }
  await requestWrap(db(), { action: "close", eventId: e.id, moveTo, by: user.name });
  refresh();
  back(path, `Closing ${e.name}. Ferri makes the recap and kit, says goodbye in the crew room and turns the spaces ${moveTo ? "over" : "Off"} within a few seconds.`);
}

/** "Not yet" on the open close card. */
export async function notYet(form: FormData) {
  const user = await requireUser();
  const path = here(form);
  const e = await eventIn(form);
  const card = e ? await openCard(e.id) : null;
  if (!card) return back(path, "There is no close card open.");
  const r = await answerAs(user, card.id, skip);
  refresh();
  back(path, r.ok ? `${e!.name} stays open.` : r.note);
}

export async function reopenEvent(form: FormData) {
  const user = await requireUser();
  const path = here(form);
  const e = await eventIn(form);
  if (!e) return back(path, "That event is gone.");
  if (!e.closedAt) return back(path, `${e.name} is not closed.`);
  await requestWrap(db(), { action: "reopen", eventId: e.id, moveTo: null, by: user.name });
  refresh();
  back(path, `Reopening ${e.name}: its spaces come back with their modes within a few seconds.`);
}

async function ask(form: FormData, action: "recap" | "kit" | "partners", note: (name: string) => string) {
  const user = await requireUser();
  const path = here(form);
  const e = await eventIn(form);
  if (!e) return back(path, "That event is gone.");
  await requestWrap(db(), { action, eventId: e.id, moveTo: null, by: user.name });
  refresh();
  back(path, note(e.name));
}

export async function freshRecap(form: FormData) {
  await ask(form, "recap", (n) => `Ferri is making a fresh recap of ${n}. It shows here in a few seconds.`);
}

export async function rebuildKit(form: FormData) {
  await ask(form, "kit", (n) => `Ferri is packing the ${n} kit again. It shows here in a few seconds.`);
}

export async function savePartnersNow(form: FormData) {
  await ask(form, "partners", (n) => `Ferri is saving the partners of ${n} to contacts. Nobody is emailed.`);
}

/** A new event from a starter kit (no model call, so Desk does it directly). */
export async function startEventFromKit(form: FormData) {
  const user = await requireUser();
  const c = await community();
  const path = str(form, "back").startsWith("/") ? str(form, "back") : "/events";
  const kitId = str(form, "kitId");
  const name = str(form, "name");
  if (!name) return back(path, "Give the new event a name.");
  const when = str(form, "startsAt");
  const startsAt = when ? zonedTime(when, c.timezone) : null;
  if (!kitId) {
    // No kit: a plain new event in Plan.
    const slugBase = slugify(name);
    const taken = new Set((await db().select({ slug: events.slug }).from(events).where(eq(events.communityId, c.id))).map((e) => e.slug));
    let slug = slugBase;
    for (let i = 2; taken.has(slug); i++) slug = `${slugBase}-${i}`;
    await db().insert(events).values({ communityId: c.id, slug, name, stage: "plan", startsAt, deskEditedAt: new Date(), crewFromDesk: true });
    refresh();
    return back(`/events/${slug}`, `${name} is in Plan. Add its crew, knowledge and spaces here.`);
  }
  let started;
  try {
    started = await startFromKit(db(), { communityId: c.id, kitId, name, startsAt, by: user.name });
  } catch (err) {
    return back(path, (err as Error).message);
  }
  refresh();
  revalidatePath("/plan");
  back(
    `/events/${started.slug}`,
    `${started.name} started from the kit: ${started.crew} crew, ${started.knowledge} knowledge entries kept, ${started.questions} questions in its plan, ${started.tasks} tasks proposed. Nothing was posted outside. Attach its spaces next.`,
  );
}
