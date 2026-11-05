"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { community, db } from "@/lib/db";
import {
  CARD_QUESTION_ID,
  CARD_SKIP_OPTION,
  TOPICS,
  attachSpace,
  cards,
  communities,
  createEntry,
  crewMembers,
  detachSpace,
  editEntry,
  events,
  mutedPeople,
  setEntryArchived,
  slugify,
  spaces,
} from "@/lib/ferri";
import { gatewayAs, requireUser } from "@/lib/session";

// Browsers send textarea text with CRLF line ends; keep plain newlines.
const str = (f: FormData, k: string) =>
  String(f.get(k) ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
const back = (path: string, note: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}note=${encodeURIComponent(note)}`);

// ── Master pause ─────────────────────────────────────────────────────────

export async function setPause(form: FormData) {
  const user = await requireUser();
  const c = await community();
  const paused = str(form, "paused") === "1";
  await db()
    .update(communities)
    .set({ paused, pausedAt: paused ? new Date() : null, pausedBy: paused ? user.name : null, updatedAt: new Date() })
    .where(eq(communities.id, c.id));
  revalidatePath("/", "layout");
}

// ── Spaces ───────────────────────────────────────────────────────────────

const MODES = ["listen", "approve", "auto"] as const;

export async function saveSpace(form: FormData) {
  const user = await requireUser();
  const spaceId = str(form, "spaceId");
  const eventId = str(form, "eventId");
  const mode = str(form, "mode") as (typeof MODES)[number];
  const crew = str(form, "role") === "crew";
  if (!eventId || str(form, "mode") === "off") {
    await detachSpace(db(), spaceId);
  } else {
    if (!MODES.includes(mode) && !crew) back("/spaces", "Pick a mode.");
    await attachSpace(db(), { spaceId, eventId, mode: MODES.includes(mode) ? mode : "auto", role: crew ? "crew" : "members", by: user.name });
  }
  revalidatePath("/", "layout");
  back("/spaces", "Saved. Ferri follows it from the next message.");
}

export async function keepOff(form: FormData) {
  await requireUser();
  await db().update(spaces).set({ state: "known", updatedAt: new Date() }).where(eq(spaces.id, str(form, "spaceId")));
  revalidatePath("/", "layout");
}

// ── Community and events ─────────────────────────────────────────────────

export async function saveCommunity(form: FormData) {
  await requireUser();
  const c = await community();
  await db()
    .update(communities)
    .set({
      name: str(form, "name") || c.name,
      timezone: str(form, "timezone") || c.timezone,
      instructions: str(form, "instructions"),
      deskEditedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(communities.id, c.id));
  revalidatePath("/", "layout");
  back("/community", "Saved. Ferri uses it from the next answer.");
}

const STAGES = ["plan", "build", "launch", "live", "wrap"] as const;
// The form shows India time (the community's timezone for now), so read it as +05:30.
const when = (v: string) => (v ? new Date(`${v.length === 16 ? `${v}:00` : v}+05:30`) : null);

export async function saveEvent(form: FormData) {
  await requireUser();
  const id = str(form, "eventId");
  const stage = str(form, "stage") as (typeof STAGES)[number];
  const [e] = await db()
    .update(events)
    .set({
      name: str(form, "name"),
      stage: STAGES.includes(stage) ? stage : "plan",
      startsAt: when(str(form, "startsAt")),
      endsAt: when(str(form, "endsAt")),
      venue: str(form, "venue") || null,
      instructions: str(form, "instructions"),
      deskEditedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(events.id, id))
    .returning({ slug: events.slug });
  revalidatePath("/", "layout");
  back(`/events/${e?.slug ?? ""}`, "Saved.");
}

// ── Crew ─────────────────────────────────────────────────────────────────

/** "mattermost: priya, telegram: priya_k, switch: priya@example.com" */
function parseHandles(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of text.split(/[,\n]/)) {
    const m = /^\s*([a-z0-9_]+)\s*[:=]\s*@?(.+?)\s*$/i.exec(part);
    if (m) out[m[1]!.toLowerCase()] = m[2]!;
  }
  return out;
}

async function crewChanged(eventId: string | null) {
  const c = await community();
  if (eventId) await db().update(events).set({ crewFromDesk: true }).where(eq(events.id, eventId));
  else await db().update(communities).set({ crewFromDesk: true }).where(eq(communities.id, c.id));
}

export async function saveCrewMember(form: FormData) {
  await requireUser();
  const c = await community();
  const id = str(form, "id");
  const eventId = str(form, "eventId") || null;
  const name = str(form, "name");
  const slug = str(form, "slug");
  if (!name) back(`/events/${slug}`, "A crew member needs a name.");
  const values = {
    name,
    handles: parseHandles(str(form, "handles")),
    topics: form.getAll("topics").map(String).filter((t) => (TOPICS as readonly string[]).includes(t)),
    lead: form.get("lead") === "on",
    onDuty: form.get("onDuty") === "on",
    updatedAt: new Date(),
  };
  if (id) {
    await db().update(crewMembers).set(values).where(eq(crewMembers.id, id));
  } else {
    await db()
      .insert(crewMembers)
      .values({ communityId: c.id, eventId, key: `${slug || "community"}/${slugify(name)}-${Date.now().toString(36)}`, ...values });
  }
  await crewChanged(eventId);
  revalidatePath("/", "layout");
  back(slug ? `/events/${slug}` : "/community", "Crew saved. New cards follow it.");
}

export async function removeCrewMember(form: FormData) {
  await requireUser();
  const eventId = str(form, "eventId") || null;
  await db().delete(crewMembers).where(eq(crewMembers.id, str(form, "id")));
  await crewChanged(eventId);
  revalidatePath("/", "layout");
  back(str(form, "slug") ? `/events/${str(form, "slug")}` : "/community", "Removed from the crew.");
}

// ── Mute list ────────────────────────────────────────────────────────────

export async function mutePerson(form: FormData) {
  const user = await requireUser();
  const c = await community();
  const username = str(form, "username").replace(/^@/, "").toLowerCase();
  if (!username) back("/community", "Enter a username.");
  await db()
    .insert(mutedPeople)
    .values({ communityId: c.id, platform: str(form, "platform") || "*", username, note: str(form, "note") || null, mutedBy: user.name })
    .onConflictDoNothing();
  revalidatePath("/community");
  back("/community", `Muted ${username}. Ferri ignores them everywhere.`);
}

export async function unmutePerson(form: FormData) {
  await requireUser();
  await db().delete(mutedPeople).where(eq(mutedPeople.id, str(form, "id")));
  revalidatePath("/community");
  back("/community", "Unmuted.");
}

// ── Knowledge ────────────────────────────────────────────────────────────

export async function saveEntry(form: FormData) {
  const user = await requireUser();
  const id = str(form, "entryId");
  const r = await editEntry(db(), { entryId: id, heading: str(form, "heading"), body: str(form, "body"), by: user.name });
  revalidatePath("/knowledge");
  back(`/knowledge/${id}`, r.changed ? `Saved as version ${r.version}. Ferri answers with it now.` : "Nothing changed.");
}

export async function newEntry(form: FormData) {
  const user = await requireUser();
  const c = await community();
  const id = await createEntry(db(), {
    communityId: c.id,
    eventId: str(form, "eventId") || null,
    sourceTitle: str(form, "sourceTitle"),
    heading: str(form, "heading"),
    body: str(form, "body"),
    by: user.name,
  });
  revalidatePath("/knowledge");
  back(`/knowledge/${id}`, "Added. Ferri answers with it now.");
}

export async function archiveEntry(form: FormData) {
  const user = await requireUser();
  const id = str(form, "entryId");
  const archived = str(form, "archived") === "1";
  await setEntryArchived(db(), { entryId: id, archived, by: user.name });
  revalidatePath("/knowledge");
  back(`/knowledge/${id}`, archived ? "Archived. Ferri no longer uses it." : "Restored.");
}

// ── Cards (answered through Switch as the signed-in person) ──────────────

async function answer(cardId: string, a: { selected: string[]; text: string | null }, path: string) {
  const user = await requireUser();
  const [card] = await db().select().from(cards).where(and(eq(cards.id, cardId), eq(cards.status, "open"))).limit(1);
  if (!card) back(path, "That card is no longer open.");
  const agentId = process.env.FERRI_AGENT_ID;
  if (!agentId) back(path, "FERRI_AGENT_ID is not set.");
  try {
    await gatewayAs(user).answerCard(agentId!, card!.switchSessionId, card!.id, [
      { question_id: CARD_QUESTION_ID, selected_option_ids: a.selected, custom_text: a.text },
    ]);
  } catch (err) {
    const msg = (err as Error).message;
    back(path, msg.includes("401") ? "Your Switch session ended. Sign in again." : `Switch refused it: ${msg.slice(0, 200)}`);
  }
  revalidatePath("/cards");
  back(path, "Sent to Ferri. It goes out in a moment.");
}

export async function answerCard(form: FormData) {
  const text = str(form, "text");
  if (!text) back("/cards", "Write the answer first.");
  await answer(str(form, "cardId"), { selected: [], text }, "/cards");
}

export async function skipCard(form: FormData) {
  await answer(str(form, "cardId"), { selected: [CARD_SKIP_OPTION], text: null }, "/cards");
}

export async function sendReply(form: FormData) {
  const cardId = str(form, "cardId");
  const text = str(form, "text");
  const [card] = await db().select({ draft: cards.draftText }).from(cards).where(eq(cards.id, cardId)).limit(1);
  const unchanged = !text || text === (card?.draft ?? "").trim();
  await answer(cardId, unchanged ? { selected: ["send"], text: null } : { selected: [], text }, "/cards");
}

export async function skipReply(form: FormData) {
  await answer(str(form, "cardId"), { selected: [CARD_SKIP_OPTION], text: null }, "/cards");
}

