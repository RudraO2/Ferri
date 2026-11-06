"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { community, db } from "@/lib/db";
import { DESK_PACK_PREFIX, DESK_REQUEST_PREFIX, kindSkill, packPreviews, shortRoomName, spacesForDesk } from "@/lib/desks";
import { answerAs, skip } from "@/lib/cards";
import { DESK_KINDS, DESK_MAKE_OPTION, PACK_TYPES, attachSpace, deskRoomName, deskSkillKey, desks, events, spaces } from "@/lib/ferri";
import { requirePocketUser, requireUser } from "@/lib/session";

const str = (f: FormData, k: string) =>
  String(f.get(k) ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
const back = (path: string, note: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}note=${encodeURIComponent(note)}`);
const deskPath = (f: FormData) => `/desks?event=${encodeURIComponent(str(f, "eventSlug"))}`;
const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
const PLATFORMS = ["", "mattermost", "slack", "discord", "telegram", "whatsapp_web"];

async function eventRow(communityId: string, eventId: string) {
  const [ev] = await db()
    .select()
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.communityId, communityId)))
    .limit(1);
  return ev ?? null;
}

async function roomTaken(communityId: string, eventId: string, roomName: string): Promise<boolean> {
  const rows = await db()
    .select({ status: desks.status })
    .from(desks)
    .where(and(eq(desks.communityId, communityId), eq(desks.eventId, eventId), eq(desks.roomName, roomName)));
  return rows.some((r) => r.status === "created" || r.status === "planned");
}

/** Make a desk: a request Ferri's tick makes at once (the room from a Switch template, attached to the event). */
export async function makeDesk(form: FormData) {
  const user = await requireUser();
  const c = await community();
  const path = deskPath(form);
  const ev = await eventRow(c.id, str(form, "eventId"));
  if (!ev) return back(path, "That event is gone.");
  const kind = str(form, "kind");
  if (!(DESK_KINDS as readonly string[]).includes(kind)) return back(path, "Pick a kind of desk.");
  const platform = str(form, "platform");
  if (!PLATFORMS.includes(platform)) return back(path, "Pick a platform.");
  const skill = await kindSkill(c.id, kind);
  if (!skill) return back(path, `The ${kind} desk skill is not valid; fix it on the Skills page first.`);
  const name = str(form, "name");
  const own = name ? slug(name.replace(/\bdesk\b/i, "")) : "";
  const room = own && own !== skill.room ? own : skill.room;
  const title = own && own !== skill.room ? `${name.replace(/\s*\bdesk\b\s*/i, " ").trim().replace(/^\w/, (x) => x.toUpperCase())} desk` : skill.title;
  const roomName = deskRoomName(ev, room);
  if (await roomTaken(c.id, ev.id, roomName)) return back(path, `#${roomName} is already a desk (or waiting to be made). Give the new one a name.`);
  const members = str(form, "members")
    .split(/[\s,]+/)
    .map((m) => m.replace(/^@/, "").trim())
    .filter(Boolean);
  await db().insert(desks).values({
    communityId: c.id,
    eventId: ev.id,
    kind: skill.kind,
    title,
    skillKey: deskSkillKey(kind),
    roomName,
    platform: platform || null,
    visibility: skill.visibility,
    members,
    status: "planned",
    requestedBy: user.name,
    sourceMessageId: `${DESK_REQUEST_PREFIX}${randomUUID()}`,
  });
  revalidatePath("/desks");
  back(path, `Asked Ferri to make #${roomName}. It makes the room within a few seconds and tells the crew room.`);
}

/** Set up a pack: Ferri opens one desk card in the crew room listing every room. */
export async function setupPack(form: FormData) {
  const user = await requireUser();
  const c = await community();
  const path = deskPath(form);
  const ev = await eventRow(c.id, str(form, "eventId"));
  if (!ev) return back(path, "That event is gone.");
  const type = str(form, "type");
  if (!(PACK_TYPES as readonly string[]).includes(type)) return back(path, "Pick a pack.");
  const preview = (await packPreviews(c.id)).find((p) => p.type === type);
  if (!preview?.pack) return back(path, `The ${type} pack is not valid${preview?.error ? `: ${preview.error}` : ""}.`);
  const batch = `${DESK_PACK_PREFIX}${type}:${randomUUID()}`;
  const planned: string[] = [];
  const skipped: string[] = [];
  for (const d of preview.desks) {
    if (!d.skill) {
      skipped.push(`${d.kind} (skill not valid)`);
      continue;
    }
    const roomName = deskRoomName(ev, d.skill.room);
    if (await roomTaken(c.id, ev.id, roomName)) {
      skipped.push(`#${roomName} (already there)`);
      continue;
    }
    await db().insert(desks).values({
      communityId: c.id,
      eventId: ev.id,
      kind: d.skill.kind,
      title: d.skill.title,
      skillKey: deskSkillKey(d.kind),
      roomName,
      visibility: d.skill.visibility,
      members: [],
      status: "planned",
      requestedBy: user.name,
      sourceMessageId: batch,
    });
    planned.push(`#${roomName}`);
  }
  revalidatePath("/desks");
  if (!planned.length) return back(path, `Every desk of that pack is already there: ${skipped.join(", ")}.`);
  back(path, `Ferri puts ${planned.join(", ")} on one desk card in the crew room; "Make them" makes them.${skipped.length ? ` Left out: ${skipped.join(", ")}.` : ""}`);
}

/** Turn a space the event already has into a desk: no new room, the desk skill applies there from the next message. */
export async function spaceToDesk(form: FormData) {
  const user = await requireUser();
  const c = await community();
  const path = deskPath(form);
  const ev = await eventRow(c.id, str(form, "eventId"));
  if (!ev) return back(path, "That event is gone.");
  const kind = str(form, "kind");
  if (!(DESK_KINDS as readonly string[]).includes(kind)) return back(path, "Pick a kind of desk.");
  const skill = await kindSkill(c.id, kind);
  if (!skill) return back(path, `The ${kind} desk skill is not valid; fix it on the Skills page first.`);
  const space = (await spacesForDesk(c.id, ev.id)).find((s) => s.id === str(form, "spaceId"));
  if (!space) return back(path, "Pick a space of this event that is not a desk yet.");
  const [row] = await db().select().from(spaces).where(eq(spaces.id, space.id)).limit(1);
  if (!row) return back(path, "That space is gone.");
  await db().insert(desks).values({
    communityId: c.id,
    eventId: ev.id,
    kind: skill.kind,
    title: skill.title,
    skillKey: deskSkillKey(kind),
    spaceId: row.id,
    roomName: shortRoomName(row.name),
    switchRoomId: row.switchRoomId,
    platform: row.platform,
    visibility: skill.visibility,
    members: [],
    status: "created",
    requestedBy: user.name,
    sourceMessageId: null,
  });
  if (str(form, "mode") === "skill") await attachSpace(db(), { eventId: ev.id, spaceId: row.id, mode: skill.mode, role: "members", by: user.name });
  revalidatePath("/desks");
  back(path, `${row.name} is the ${skill.title} now. Ferri works there the desk's way from the next message${skill.sheet ? ` and keeps its ${skill.sheet.name} sheet` : ""}.`);
}

/** A desk card answered from Pocket or Desk ("Make them" or "Don't"), through Switch as the signed-in person. */
export async function answerDeskCard(form: FormData) {
  const back = str(form, "back") || "/m";
  const pocket = back.startsWith("/m");
  const user = pocket ? await requirePocketUser() : await requireUser();
  const cardId = str(form, "cardId");
  const make = str(form, "choice") === "make";
  const r = await answerAs(user, cardId, make ? { selected: [DESK_MAKE_OPTION], text: null } : skip);
  revalidatePath("/m", "layout");
  revalidatePath("/desks");
  revalidatePath("/cards");
  if (!r.ok) return back_(back, r.note);
  back_(pocket ? "/m" : back, make ? "Approved. Ferri makes the rooms now and tells the crew room." : "Okay. Nothing is made.");
}
const back_ = (path: string, note: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}note=${encodeURIComponent(note)}`);

/** Stop treating a room as a desk (the room and its space stay; the sheet's rows are kept). */
export async function removeDesk(form: FormData) {
  await requireUser();
  const c = await community();
  const path = deskPath(form);
  const [d] = await db()
    .update(desks)
    .set({ status: "removed", updatedAt: new Date() })
    .where(and(eq(desks.id, str(form, "deskId")), eq(desks.communityId, c.id)))
    .returning();
  revalidatePath("/desks");
  back(path, d ? `#${d.roomName} is no longer a desk. The room stays; Ferri answers there like in any other space.` : "That desk is gone.");
}
