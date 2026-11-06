"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { community, db } from "@/lib/db";
import {
  TOPICS,
  attachSpace,
  cards,
  communities,
  createAnnouncementRequest,
  createEntry,
  crewForSwitchEmail,
  crewMembers,
  detachSpace,
  editEntry,
  events,
  mutedPeople,
  planItems,
  proposeAnnouncementEdit,
  recordSpace,
  setEntryArchived,
  slugify,
  spaces,
  builderJobs,
  createBuilderJob,
  type BuilderJobKind,
  CONTACT_STATUSES,
  cannotEmail,
  contactMessages,
  contacts,
  setContactStatus,
  upsertContact,
  GUEST_STATUSES,
  GUEST_STATUS_LABEL,
  parseGuestCsv,
  upsertGuest,
} from "@/lib/ferri";
import { answerRequest } from "@/lib/builder";
import { SPOT_OFFER_OPTION, approvedNote, lumaEventIdFrom, requestSend } from "@/lib/guests";
import { announceAnswer, zonedTime } from "@/lib/announce";
import { answerAs, replyAnswer, skip, type CardAnswer } from "@/lib/cards";
import { careAction } from "@/lib/care";
import { removeRule, setRule } from "@/lib/shield";
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

/** Put Ferri in a Switch room it is not in yet; the room lands in Discovered, Off. */
export async function addFerri(form: FormData) {
  const user = await requireUser();
  const c = await community();
  const agentId = process.env.FERRI_AGENT_ID;
  if (!agentId) back("/spaces", "FERRI_AGENT_ID is not set.");
  const roomId = str(form, "roomId");
  try {
    await gatewayAs(user).addAgentsToRoom(roomId, [agentId!]);
  } catch (err) {
    const msg = (err as Error).message;
    back("/spaces", msg.includes("401") ? "Your Switch session ended. Sign in again." : `Switch refused it: ${msg.slice(0, 200)}`);
  }
  await recordSpace(db(), c.id, { roomId, name: str(form, "name") || roomId, platform: str(form, "platform") || null });
  revalidatePath("/", "layout");
  back("/spaces", `Ferri joined ${str(form, "name")}. It is under Discovered, switched off, until you attach it.`);
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

async function answer(cardId: string, a: CardAnswer, path: string) {
  const user = await requireUser();
  const r = await answerAs(user, cardId, a);
  revalidatePath("/cards");
  back(path, r.note);
}

export async function answerCard(form: FormData) {
  const text = str(form, "text");
  if (!text) back("/cards", "Write the answer first.");
  await answer(str(form, "cardId"), { selected: [], text }, "/cards");
}

export async function skipCard(form: FormData) {
  await answer(str(form, "cardId"), skip, "/cards");
}

export async function sendReply(form: FormData) {
  const cardId = str(form, "cardId");
  await answer(cardId, await replyAnswer(cardId, str(form, "text")), "/cards");
}

export async function skipReply(form: FormData) {
  await answer(str(form, "cardId"), skip, "/cards");
}

// ── Announcements (spec 09) ──────────────────────────────────────────────

/** A new announcement in the organizer's own words. Ferri opens its card; one OK posts it. */
/** The crew member linked to this Switch account, else the account's name. */
async function crewName(user: { email: string; name: string }, communityId: string): Promise<string> {
  return (await crewForSwitchEmail(db(), communityId, user.email))[0]?.name ?? user.name;
}

export async function newAnnouncement(form: FormData) {
  const user = await requireUser();
  const c = await community();
  const eventId = str(form, "eventId");
  const text = str(form, "text");
  const when = str(form, "when");
  if (!eventId) back("/announcements", "Pick the event first.");
  if (!text) back("/announcements", "Write the announcement first.");
  const scheduledAt = when ? zonedTime(when, c.timezone) : null;
  if (when && (!scheduledAt || scheduledAt.getTime() < Date.now() + 60_000)) back("/announcements", "Pick a time at least a minute from now, or leave it empty to post once approved.");
  const targets = form.getAll("target").map(String).filter(Boolean);
  await createAnnouncementRequest(db(), {
    communityId: c.id,
    eventId,
    text,
    title: str(form, "title") || null,
    scheduledAt,
    targetSpaceIds: targets,
    by: await crewName(user, c.id),
    origin: "desk",
  });
  revalidatePath("/announcements");
  back("/announcements", "Sent for approval. The card opens in the crew room and in Pocket in a few seconds.");
}

/** A new version: once approved, Ferri edits the post everywhere it went. */
export async function editAnnouncement(form: FormData) {
  const user = await requireUser();
  const c = await community();
  try {
    await proposeAnnouncementEdit(db(), { announcementId: str(form, "announcementId"), text: str(form, "text"), by: await crewName(user, c.id) });
  } catch (err) {
    back("/announcements", (err as Error).message);
  }
  revalidatePath("/announcements");
  back("/announcements", "New version sent for approval. Once approved, Ferri edits it everywhere.");
}

export async function approveAnnouncement(form: FormData) {
  const cardId = str(form, "cardId");
  await answer(cardId, await announceAnswer(cardId, str(form, "text")), "/announcements");
}

export async function dropAnnouncement(form: FormData) {
  await answer(str(form, "cardId"), skip, "/announcements");
}

// ── Shield (spec 07) ─────────────────────────────────────────────────────

/** Point Switch Trust at Shield (as the signed-in admin). */
export async function connectShield() {
  const user = await requireUser();
  const key = process.env.SHIELD_API_KEY;
  if (!key) back("/shield", "SHIELD_API_KEY is not set. Run `pnpm shield:connect` once.");
  const endpoint = process.env.SHIELD_ENDPOINT ?? `http://host.docker.internal:${process.env.SHIELD_PORT ?? "3200"}`;
  try {
    await gatewayAs(user).call("PUT", "/gateway/trust-settings", { endpoint, policy_id: process.env.SHIELD_POLICY_ID ?? "ferri-shield", api_key: key });
  } catch (err) {
    back("/shield", `Switch refused it: ${(err as Error).message.slice(0, 200)}`);
  }
  revalidatePath("/shield");
  back("/shield", "Shield is on. Switch checks the next message with it.");
}

export async function disconnectShield() {
  const user = await requireUser();
  try {
    await gatewayAs(user).call("DELETE", "/gateway/trust-settings");
  } catch (err) {
    back("/shield", `Switch refused it: ${(err as Error).message.slice(0, 200)}`);
  }
  revalidatePath("/shield");
  back("/shield", "Shield is off. Switch no longer checks messages.");
}

export async function addShieldRule(form: FormData) {
  const user = await requireUser();
  const c = await community();
  const kind = str(form, "kind") === "block" ? "block" : "allow";
  let domain = "";
  try {
    domain = await setRule(db(), { communityId: c.id, kind, domain: str(form, "domain"), note: str(form, "note") || null, by: await crewName(user, c.id) });
  } catch (err) {
    back("/shield", (err as Error).message);
  }
  revalidatePath("/shield");
  back("/shield", kind === "allow" ? `${domain} is allowed: Shield never flags it.` : `${domain} is blocked everywhere.`);
}

export async function removeShieldRule(form: FormData) {
  await requireUser();
  const c = await community();
  await removeRule(db(), c.id, str(form, "id"));
  revalidatePath("/shield");
  back("/shield", "Rule removed.");
}

// ── Plan (spec 08) ───────────────────────────────────────────────────────

/** The plan-card option Ferri reads as "confirm the proposal as it stands". */
const PLAN_CONFIRM_OPTION = "confirm";

/** Confirm a proposed decision through its Switch card: unchanged text confirms Ferri's proposal. */
export async function confirmPlanItem(form: FormData) {
  const cardId = str(form, "cardId");
  const text = str(form, "text");
  const [card] = await db().select({ draft: cards.draftText }).from(cards).where(eq(cards.id, cardId)).limit(1);
  const unchanged = !text || text === (card?.draft ?? "").trim();
  await answer(cardId, unchanged ? { selected: [PLAN_CONFIRM_OPTION], text: null } : { selected: [], text }, planPath(form));
}

export async function dropPlanItem(form: FormData) {
  await answer(str(form, "cardId"), skip, planPath(form));
}

const planPath = (form: FormData) => `/plan${str(form, "eventSlug") ? `?event=${encodeURIComponent(str(form, "eventSlug"))}` : ""}`;

/** Mark a task done (or open again), or take an item out of the plan. Ferri updates the plan document. */
export async function setPlanStatus(form: FormData) {
  const user = await requireUser();
  const c = await community();
  const status = str(form, "status") as "confirmed" | "done" | "dropped";
  if (!["confirmed", "done", "dropped"].includes(status)) back(planPath(form), "Unknown status.");
  const [item] = await db()
    .update(planItems)
    .set({ status, updatedAt: new Date(), decidedBy: status === "dropped" ? await crewName(user, c.id) : undefined })
    .where(eq(planItems.id, str(form, "itemId")))
    .returning();
  if (item?.status === "dropped" && item.entryId) await setEntryArchived(db(), { entryId: item.entryId, archived: true, by: user.name });
  revalidatePath("/plan");
  back(planPath(form), status === "done" ? "Marked done." : status === "dropped" ? "Taken out of the plan." : "Open again.");
}

/** Change who owns an item and when it is due. */
export async function updatePlanItem(form: FormData) {
  const c = await community();
  const due = str(form, "due");
  const dueAt = due ? zonedTime(due, c.timezone) : null;
  await db()
    .update(planItems)
    .set({ ownerId: str(form, "ownerId") || null, dueAt, remindedAt: null, updatedAt: new Date() })
    .where(eq(planItems.id, str(form, "itemId")));
  revalidatePath("/plan");
  back(planPath(form), "Saved. Ferri reminds the owner when it falls due.");
}

/** Put something in the plan from Desk. A member-facing decision becomes knowledge within seconds. */
export async function addPlanItem(form: FormData) {
  const user = await requireUser();
  const c = await community();
  const eventId = str(form, "eventId");
  const kind = str(form, "kind") as "decision" | "task" | "owner" | "question";
  const text = str(form, "text");
  const topic = str(form, "topic") || "other";
  const ownerId = str(form, "ownerId") || null;
  if (!eventId) back(planPath(form), "Pick the event first.");
  if (!["decision", "task", "owner", "question"].includes(kind)) back(planPath(form), "Pick what kind of item it is.");
  if (kind === "owner" && (!ownerId || topic === "other")) back(planPath(form), "An owner needs a person and a topic.");
  if (kind !== "owner" && !text) back(planPath(form), "Write the item first.");
  const due = str(form, "due");
  const dueAt = kind === "task" && due ? zonedTime(due, c.timezone) : null;
  const owner = ownerId ? (await db().select({ name: crewMembers.name }).from(crewMembers).where(eq(crewMembers.id, ownerId)).limit(1))[0] : null;
  await db()
    .insert(planItems)
    .values({
      communityId: c.id,
      eventId,
      kind,
      status: "confirmed",
      topic,
      title: kind === "owner" ? topic : str(form, "title") || text.replace(/[.]\s*$/, "").slice(0, 60),
      text: kind === "owner" ? `${owner?.name ?? "Someone"} owns ${topic}.` : text,
      ownerId,
      dueAt,
      forMembers: kind === "decision" && str(form, "forMembers") === "1",
      origin: "desk",
      decidedBy: await crewName(user, c.id),
    });
  revalidatePath("/plan");
  back(planPath(form), kind === "owner" ? `Saved. ${topic} cards go to ${owner?.name ?? "them"} first now.` : "Added to the plan.");
}

// ── Ferri Builder (spec 11) ──────────────────────────────────────────────

const BUILD_KINDS: BuilderJobKind[] = ["site", "checklist", "poster", "listing", "outreach", "other"];

/** A job for the Builder from Desk. Ferri hands it over in the crew room within seconds. */
export async function queueBuilderJob(form: FormData) {
  const user = await requireUser();
  const c = await community();
  const brief = str(form, "brief");
  const kind = (BUILD_KINDS.includes(str(form, "kind") as BuilderJobKind) ? str(form, "kind") : "other") as BuilderJobKind;
  const eventId = str(form, "eventId") || null;
  if (!brief) back("/builder", "Say what the Builder should make.");
  const title = str(form, "title") || brief.replace(/[.!?]\s*$/, "").split(/\s+/).slice(0, 6).join(" ");
  const who = (await crewForSwitchEmail(db(), c.id, user.email))[0];
  const job = await createBuilderJob(db(), {
    communityId: c.id,
    eventId,
    kind,
    title: title.slice(0, 80),
    brief,
    requestedBy: who?.name ?? user.name,
    requestedById: who?.id ?? null,
    origin: "desk",
    sourceMessageId: null,
    roomId: null,
    status: "queued",
  });
  revalidatePath("/builder");
  back("/builder", `Queued as job B${job?.number}. Ferri hands it to the Builder in the crew room.`);
}

/** Stop a job. Ferri tells the Builder in the room if it already had it. */
export async function cancelBuilderJob(form: FormData) {
  const user = await requireUser();
  const c = await community();
  const id = str(form, "id");
  const [job] = await db()
    .update(builderJobs)
    .set({ status: "cancelled", report: await crewName(user, c.id), updatedAt: new Date() })
    .where(eq(builderJobs.id, id))
    .returning();
  revalidatePath("/builder");
  back("/builder", job ? `Job B${job.number} cancelled.` : "That job is gone.");
}

/** Answer one of the Builder's own cards (a permission it asked for, or its question). */
export async function answerBuilderRequest(form: FormData) {
  const user = await requireUser();
  const ref = { agentId: str(form, "agentId"), sessionId: str(form, "sessionId"), requestId: str(form, "requestId") };
  const kind = str(form, "kind");
  const to = str(form, "back") || "/builder";
  const r =
    kind === "approval"
      ? await answerRequest(user, ref, { answer: str(form, "option") })
      : await answerRequest(user, ref, {
          answers: [
            {
              question_id: str(form, "questionId"),
              selected_option_ids: str(form, "option") ? [str(form, "option")] : [],
              custom_text: str(form, "text") || null,
            },
          ],
        });
  revalidatePath(to);
  back(to, r.note);
}

// ── Contacts and outreach email (spec 15) ────────────────────────────────

async function crewWho(user: { email: string; name: string }, communityId: string) {
  return (await crewForSwitchEmail(db(), communityId, user.email))[0] ?? null;
}

/** Add a partner by hand (an address the crew knows). */
export async function addContact(form: FormData) {
  const user = await requireUser();
  const c = await community();
  const org = str(form, "org");
  const email = str(form, "email").toLowerCase();
  if (!org) back("/contacts", "Give the organization's name.");
  if (email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) back("/contacts", `“${email}” doesn't look like an email address.`);
  const who = await crewWho(user, c.id);
  const { created } = await upsertContact(db(), {
    communityId: c.id,
    eventId: str(form, "eventId") || null,
    org,
    person: str(form, "person") || null,
    email: email || null,
    kind: str(form, "kind") || "other",
    website: str(form, "website") || null,
    source: email ? `given by ${who?.name ?? user.name}` : null,
    why: str(form, "why") || null,
    addedBy: who?.name ?? user.name,
  });
  revalidatePath("/contacts");
  back("/contacts", created ? `Added ${org}.` : `${org} was already in contacts; filled in what was missing.`);
}

/** Ask Ferri to draft an email to a contact. It opens a card in the crew room within seconds. */
export async function requestEmail(form: FormData) {
  const user = await requireUser();
  const c = await community();
  const contactId = str(form, "contactId");
  const ask = str(form, "ask");
  if (!ask) back("/contacts", "Say what the email should ask or tell them.");
  const [contact] = await db().select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
  if (!contact) back("/contacts", "That contact is gone.");
  const why = cannotEmail(contact!);
  if (why) back("/contacts", why);
  const who = await crewWho(user, c.id);
  const [lastIn] = await db()
    .select({ id: contactMessages.id })
    .from(contactMessages)
    .where(and(eq(contactMessages.contactId, contactId), eq(contactMessages.direction, "in")))
    .orderBy(desc(contactMessages.createdAt))
    .limit(1);
  await db().insert(contactMessages).values({
    communityId: c.id,
    contactId,
    eventId: str(form, "eventId") || contact!.eventId,
    direction: "out",
    status: "requested",
    ask,
    requestedBy: who?.name ?? user.name,
    requestedById: who?.id ?? null,
    inReplyToId: lastIn?.id ?? null,
  });
  revalidatePath("/contacts");
  back("/contacts", `Ferri is drafting the email to ${contact!.org}. It shows here and in the crew room for an OK.`);
}

export async function sendOutreach(form: FormData) {
  const cardId = str(form, "cardId");
  await answer(cardId, await replyAnswer(cardId, str(form, "text")), "/contacts");
}

export async function dropOutreach(form: FormData) {
  await answer(str(form, "cardId"), skip, "/contacts");
}

export async function markContact(form: FormData) {
  await requireUser();
  const status = str(form, "status");
  if (!(CONTACT_STATUSES as readonly string[]).includes(status)) back("/contacts", "Unknown status.");
  await setContactStatus(db(), str(form, "contactId"), status as (typeof CONTACT_STATUSES)[number], { notes: str(form, "notes") || undefined });
  revalidatePath("/contacts");
  back("/contacts", "Saved.");
}

// ── Care (spec 16) ───────────────────────────────────────────────────────

/**
 * One action on a case: "mine", "builder", "solved", "drop", "message" or
 * "reopen" (the form's `act`). careAction answers the case's open card
 * through Switch, or leaves the request on the case for Ferri's tick.
 */
export async function actOnCase(form: FormData) {
  const user = await requireUser();
  const r = await careAction(user, str(form, "caseId"), str(form, "act"), str(form, "note") || null);
  revalidatePath("/care");
  revalidatePath("/m", "layout");
  back("/care", r.note);
}

// ── Guests and RSVP (spec 17) ────────────────────────────────────────────

const guestsPath = (form: FormData) => `/guests${str(form, "eventSlug") ? `?event=${encodeURIComponent(str(form, "eventSlug"))}` : ""}`;

/** Answer a guests or spot card; on success, say what happens next. */
async function answerGuestCard(form: FormData, a: CardAnswer, done: string) {
  const user = await requireUser();
  const r = await answerAs(user, str(form, "cardId"), a);
  revalidatePath("/guests");
  revalidatePath("/m", "layout");
  back(guestsPath(form), r.ok ? done : r.note);
}

/** Unchanged (or empty) text sends Ferri's draft; anything else sends the organizer's version. */
export async function sendGuestEmail(form: FormData) {
  const cardId = str(form, "cardId");
  const a = await replyAnswer(cardId, str(form, "text"));
  await answerGuestCard(form, a, await approvedNote(cardId, !!a.text));
}

export async function dropGuestEmail(form: FormData) {
  await answerGuestCard(form, skip, "Okay. Nothing goes to the guests.");
}

export async function offerSpot(form: FormData) {
  await answerGuestCard(form, { selected: [SPOT_OFFER_OPTION], text: null }, "Offered. Ferri emails them the spot now.");
}

export async function dropSpot(form: FormData) {
  await answerGuestCard(form, skip, "Okay. The spot is not offered.");
}

/** Ask Ferri for a reminder or a free-your-spot nudge. Its card opens within seconds. */
export async function requestGuestSend(form: FormData) {
  const user = await requireUser();
  const r = await requestSend(user, { eventId: str(form, "eventId"), what: str(form, "what"), ask: str(form, "ask"), when: str(form, "when"), origin: "desk" });
  revalidatePath("/guests");
  revalidatePath("/m", "layout");
  back(guestsPath(form), r.note);
}

/** How many people can come, and the event's Luma listing (only its `evt-...` id is kept). */
export async function saveGuestSettings(form: FormData) {
  await requireUser();
  const path = guestsPath(form);
  const raw = str(form, "capacity");
  const capacity = raw ? Number(raw) : null;
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) return back(path, "Capacity is a whole number of people. Leave it empty for no limit.");
  const luma = lumaEventIdFrom(str(form, "luma"));
  await db().update(events).set({ capacity, lumaEventId: luma, updatedAt: new Date() }).where(eq(events.id, str(form, "eventId")));
  revalidatePath("/guests");
  back(
    path,
    luma && !luma.startsWith("evt-")
      ? "Saved. That Luma address has no evt-... id in it, so the sync may not find the event. Paste the address of its Manage page on Luma instead."
      : "Saved.",
  );
}

/** Ferri syncs every source of the event's guests at its next tick. */
export async function syncGuestsNow(form: FormData) {
  await requireUser();
  await db().update(events).set({ guestSyncRequestedAt: new Date() }).where(eq(events.id, str(form, "eventId")));
  revalidatePath("/guests");
  back(guestsPath(form), "Ferri syncs the guest list from every source in a few seconds.");
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A pasted or uploaded CSV (Luma's export, a form's, a sheet): every row with an email is added or updated. */
export async function importGuests(form: FormData) {
  await requireUser();
  const c = await community();
  const path = guestsPath(form);
  const eventId = str(form, "eventId");
  if (!eventId) return back(path, "Pick the event first.");
  const file = form.get("file");
  const text = file instanceof File && file.size > 0 ? await file.text() : str(form, "csv");
  if (!text.trim()) return back(path, "Paste the list or choose a CSV file first.");
  const { rows, skipped } = parseGuestCsv(text);
  if (!rows.length) return back(path, `Nothing was imported. ${skipped[0] ?? "No row has an email address."}`);
  let added = 0;
  let updated = 0;
  let failed = 0;
  for (const r of rows) {
    try {
      const { created } = await upsertGuest(db(), { communityId: c.id, eventId, email: r.email, name: r.name, source: "import", status: r.status, team: r.team });
      if (created) added++;
      else updated++;
    } catch {
      failed++;
    }
  }
  revalidatePath("/guests");
  const left = skipped.length + failed;
  back(
    path,
    `Added ${plural(added, "new guest")} and updated ${plural(updated, "guest")} already on the list.` +
      (left ? ` Skipped ${plural(left, "row")} without a valid email address.` : ""),
  );
}

/** One guest by hand (source "desk"). */
export async function addGuest(form: FormData) {
  await requireUser();
  const c = await community();
  const path = guestsPath(form);
  const status = str(form, "status") as (typeof GUEST_STATUSES)[number];
  if (!GUEST_STATUSES.includes(status)) return back(path, "Pick a status.");
  const email = str(form, "email").toLowerCase();
  let result: Awaited<ReturnType<typeof upsertGuest>> | null = null;
  try {
    result = await upsertGuest(db(), { communityId: c.id, eventId: str(form, "eventId"), email, name: str(form, "name"), source: "desk", status });
  } catch {
    result = null;
  }
  if (!result) return back(path, `“${email}” doesn't look like an email address.`);
  revalidatePath("/guests");
  back(path, result.created ? `Added ${result.guest.name}.` : `${result.guest.name} was already on the list. They are ${GUEST_STATUS_LABEL[result.guest.status] ?? result.guest.status} now.`);
}
