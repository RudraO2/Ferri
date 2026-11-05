import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, lte } from "drizzle-orm";
import { announcementPosts, announcementVersions, announcements, cards, crewReminders, events, teamRooms, type Db } from "@ferri/db";
import {
  CARD_QUESTION_ID,
  CARD_SESSION,
  CARD_SKIP_OPTION,
  announcementTargets,
  approvers,
  attachSpace,
  describeTargets,
  draftAnnouncement,
  editEntry,
  findRoomId,
  formatWhen,
  isPaused,
  loadCrew,
  loadLiveKnowledge,
  mention,
  recordSpace,
  saveCrewEntry,
  spaceLabel,
  switchExpiry,
  teamRoomName,
  teamRoomsTemplate,
  type RoomDetail,
  type TargetSpace,
} from "@ferri/knowledge";
import { pushToUsers, reminderNotice, switchUsersForCrew } from "@ferri/push";
import type { SwitchAgent } from "@ferri/switch";
import { config } from "./config.ts";
import type { Loop, RoomInfo } from "./loop.ts";

/** Announce-card option: post (or, for a later version, edit everywhere). */
export const ANNOUNCE_POST_OPTION = "post";

/** A scheduled post or reminder later than this (a pause, or Ferri was down) is not sent. */
const LATE_LIMIT_MS = 30 * 60_000;

export interface LaunchDeps {
  db: Db;
  agent: SwitchAgent;
  loop: Loop;
  room: (roomId: string) => Promise<RoomInfo>;
  log: (msg: string) => void;
}

type AnnouncementRow = typeof announcements.$inferSelect;
type VersionRow = typeof announcementVersions.$inferSelect;
type CardRow = typeof cards.$inferSelect;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Launch, and inside to outside (spec 09): announcements with one approval
 * per version, posted to every space of the event and edited in place later
 * (through Ferri's Switch fork), scheduled posts, crew reminders, and team
 * rooms from a Switch template.
 */
export function createLaunch(deps: LaunchDeps) {
  const { db, agent, loop, log } = deps;

  async function load(id: string): Promise<AnnouncementRow | null> {
    const [a] = await db.select().from(announcements).where(eq(announcements.id, id)).limit(1);
    return a ?? null;
  }

  async function eventOf(eventId: string | null) {
    if (!eventId) return null;
    const [e] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
    return e ?? null;
  }

  async function communityTz(communityId: string): Promise<string> {
    const kb = await loadLiveKnowledge(db, config.community);
    return kb?.community.id === communityId ? kb.community.timezone : "Asia/Kolkata";
  }

  // ── Asking for an announcement ─────────────────────────────────────────

  /**
   * A crew member (or a decision in crew chatter) asks for an announcement:
   * Ferri drafts it and opens the approval card. Returns a line for the
   * crew, or null when the message was already handled (a replay).
   */
  async function request(input: {
    communityId: string;
    eventId: string | null;
    what: string;
    when: Date | null;
    by: string;
    origin: "chat" | "decision";
    sourceMessageId: string;
  }): Promise<string | null> {
    if (!input.eventId) return "This room is not attached to an event, so there is nowhere to announce it.";
    const targets = await announcementTargets(db, input.eventId);
    if (!targets.length) return "This event has no Auto or Approve spaces yet, so there is nowhere to announce it. Attach some in Desk.";
    const kb = await loadLiveKnowledge(db, config.community, { eventId: input.eventId });
    if (!kb) return null;
    const { draft } = await draftAnnouncement({ choice: config.modelMain, kb, what: input.what, sender: input.by });
    if (!draft) return "I could not draft that announcement. Try saying it again in other words.";
    const [a] = await db
      .insert(announcements)
      .values({
        communityId: input.communityId,
        eventId: input.eventId,
        title: draft.title,
        status: "requested",
        scheduledAt: input.when,
        origin: input.origin,
        requestedBy: input.by,
        sourceMessageId: input.sourceMessageId,
      })
      .onConflictDoNothing({ target: announcements.sourceMessageId })
      .returning();
    if (!a) return null;
    await db.insert(announcementVersions).values({
      announcementId: a.id,
      version: 1,
      title: draft.title,
      draft: draft.text,
      reason: input.what,
      proposedBy: input.by,
    });
    log(`announcement ${a.id} requested by ${input.by} (${input.origin}): "${draft.title}"`);
    await openPending();
    return null;
  }

  /** A change to an announcement: a new version, drafted from the one live now, on its own card. */
  async function revise(input: { announcementId: string; what: string; by: string; origin: "chat" | "decision" }): Promise<string | null> {
    const a = await load(input.announcementId);
    if (!a) return "I could not find that announcement.";
    const [latest] = await db
      .select()
      .from(announcementVersions)
      .where(eq(announcementVersions.announcementId, a.id))
      .orderBy(desc(announcementVersions.version))
      .limit(1);
    const current = a.text ?? latest?.text ?? latest?.draft ?? a.title;
    const kb = await loadLiveKnowledge(db, config.community, { eventId: a.eventId });
    if (!kb) return null;
    const { draft } = await draftAnnouncement({ choice: config.modelMain, kb, what: input.what, current, sender: input.by });
    if (!draft) return "I could not redraft that announcement. Try saying the change again.";
    await replaceWaiting(a.id, null);
    await db.insert(announcementVersions).values({
      announcementId: a.id,
      version: (latest?.version ?? 0) + 1,
      title: draft.title,
      draft: draft.text,
      reason: input.what,
      proposedBy: input.by,
    });
    log(`announcement ${a.id}: version ${(latest?.version ?? 0) + 1} requested by ${input.by}`);
    await openPending();
    return null;
  }

  /** A newer version replaces any version of the same announcement still waiting for its OK (its card is closed). */
  async function replaceWaiting(announcementId: string, keepVersionId: string | null): Promise<void> {
    const waiting = await db
      .select()
      .from(announcementVersions)
      .where(and(eq(announcementVersions.announcementId, announcementId), inArray(announcementVersions.status, ["pending", "waiting"])));
    for (const w of waiting) {
      if (w.id === keepVersionId) continue;
      await db.update(announcementVersions).set({ status: "replaced" }).where(eq(announcementVersions.id, w.id));
      if (w.cardId) {
        const closed = await loop.claim(w.cardId, { status: "closed" });
        if (closed) {
          await agent.closeCard(closed.switchSessionId, closed.id).catch(() => {});
          loop.pocketSettled(closed, "dismissed", "a newer version");
        }
      }
    }
  }

  // ── The approval card ──────────────────────────────────────────────────

  let opening = false;

  /** Open a card for every version that waits for one (from chat, Desk or Pocket). */
  async function openPending(): Promise<void> {
    if (opening) return;
    opening = true;
    try {
      const pending = await db
        .select({ v: announcementVersions, a: announcements })
        .from(announcementVersions)
        .innerJoin(announcements, eq(announcements.id, announcementVersions.announcementId))
        .where(eq(announcementVersions.status, "pending"))
        .orderBy(asc(announcementVersions.createdAt));
      for (const { v, a } of pending) await openCard(a, v);
    } finally {
      opening = false;
    }
  }

  async function openCard(a: AnnouncementRow, v: VersionRow): Promise<void> {
    if (await isPaused(db, a.communityId)) return; // opens once the pause is lifted
    const crewRoomId = await loop.crewRoomFor(a.eventId);
    if (!crewRoomId) {
      await db.update(announcementVersions).set({ status: "no_crew_room" }).where(eq(announcementVersions.id, v.id));
      log(`announcement ${a.id}: the event has no crew room, so nobody can approve it`);
      return;
    }
    const [newer] = await db
      .select({ id: announcementVersions.id })
      .from(announcementVersions)
      .where(and(eq(announcementVersions.announcementId, a.id), gt(announcementVersions.version, v.version), inArray(announcementVersions.status, ["pending", "waiting"])))
      .limit(1);
    if (newer) {
      await db.update(announcementVersions).set({ status: "replaced" }).where(eq(announcementVersions.id, v.id));
      return;
    }
    await replaceWaiting(a.id, v.id);
    const event = await eventOf(a.eventId);
    const tz = await communityTz(a.communityId);
    const targets = await announcementTargets(db, a.eventId, a.targetSpaceIds);
    const where = describeTargets(targets);
    const crew = await loadCrew(db, a.communityId, a.eventId);
    const route = approvers(crew);
    const times = loop.ladder(event?.stage ?? null, event?.endsAt ?? null);
    const edit = a.liveVersion > 0;
    // A post scheduled for later can only be approved until its time.
    if (a.scheduledAt && !edit) {
      const last = Math.max(Date.now() + 60_000, a.scheduledAt.getTime());
      if (last < times.expiresAt.getTime()) times.expiresAt = new Date(last);
    }
    const id = randomUUID();
    await db.insert(cards).values({
      id,
      communityId: a.communityId,
      eventId: a.eventId,
      crewRoomId,
      switchSessionId: CARD_SESSION,
      kind: "announce",
      topic: "announce",
      question: clip(v.title, 300),
      ownerIds: route.owners.map((o) => o.id),
      draftText: v.draft,
      announcementId: a.id,
      announcementVersion: v.version,
      ...times,
    });
    const when = a.scheduledAt && !edit ? `Goes out at ${formatWhen(a.scheduledAt, tz)}.` : edit ? "Approving it edits the post everywhere it went." : "Goes out as soon as it is approved.";
    const head = `${edit ? "Announcement edit" : "Announcement"} · to ${where} · `;
    try {
      await agent.openQuestionsCard(CARD_SESSION, {
        request_id: id,
        turn_id: id,
        title: `${clip(head, 380)}“${clip(v.title, 500 - Math.min(head.length, 380) - 2)}”`,
        detail: "Announcements always need one approval. Nothing is posted until someone on the crew says so.",
        questions: [
          {
            id: CARD_QUESTION_ID,
            title: edit ? "Edit the announcement everywhere?" : "Post this announcement?",
            prompt:
              `${edit ? "New version" : "Ferri's draft"}:\n\n${v.draft.slice(0, 3000)}\n\n${when}\n\n` +
              `Pick ${edit ? "Edit everywhere or Keep it as it is" : "Post it or Don't post"}, or write your own version in quotes after the card code to post that instead.`,
            options: [
              { id: ANNOUNCE_POST_OPTION, label: edit ? "Edit everywhere" : "Post it", description: null },
              { id: CARD_SKIP_OPTION, label: edit ? "Keep it as it is" : "Don't post", description: null },
            ],
            multi_select: false,
            allow_custom_answer: true,
          },
        ],
        room_id: crewRoomId,
        thread_id: null,
        expires_at: switchExpiry(times.expiresAt).toISOString(),
      });
    } catch (err) {
      await db.update(cards).set({ status: "closed", updatedAt: new Date() }).where(eq(cards.id, id));
      log(`announcement ${a.id}: opening the card failed: ${(err as Error).message}`);
      return;
    }
    await db.update(announcementVersions).set({ status: "waiting", cardId: id }).where(eq(announcementVersions.id, v.id));
    if (a.status === "requested") await db.update(announcements).set({ status: "waiting", updatedAt: new Date() }).where(eq(announcements.id, a.id));
    const { platform } = await deps.room(crewRoomId);
    const who = route.owners.map((o) => mention(o, platform)).join(" ") || "Crew";
    const ask =
      a.origin === "decision" && !edit
        ? `sounds like a decision the members should hear: “${v.title}”. Want me to announce it (${where})?`
        : edit
          ? `${v.proposedBy} wants to change the announcement “${a.title}” everywhere it went. The new version needs your OK.`
          : `an announcement needs your OK: “${v.title}” (${where}${a.scheduledAt ? `, at ${formatWhen(a.scheduledAt, tz)}` : ""}).`;
    await loop.post(a.communityId, crewRoomId, `${who}, ${ask} It's on the card above.`);
    const [opened] = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
    if (opened) loop.pocketNotify("open", opened, route.owners.map((o) => o.id), { roomName: plural(targets.length, "space", "spaces") });
    log(`announcement ${a.id}: card ${id} for version ${v.version} opened for ${route.owners.map((o) => o.name).join(", ") || "the crew"}`);
  }

  async function versionFor(card: CardRow): Promise<VersionRow | null> {
    const [v] = await db.select().from(announcementVersions).where(eq(announcementVersions.cardId, card.id)).limit(1);
    return v ?? null;
  }

  /** Someone answered an announce card: post it, edit it everywhere, or drop it. */
  async function outcome(card: CardRow, answer: { written: string | null; selected: string[] }, by: string): Promise<void> {
    const v = await versionFor(card);
    const a = card.announcementId ? await load(card.announcementId) : null;
    if (!v || !a) return;
    if (answer.selected.includes(CARD_SKIP_OPTION) && !answer.written) {
      const claimed = await loop.claim(card.id, { status: "dismissed", answeredAt: new Date(), answeredBy: by, answeredVia: "card" });
      if (!claimed) return;
      await db.update(announcementVersions).set({ status: "rejected", approvedBy: by }).where(eq(announcementVersions.id, v.id));
      if (a.liveVersion === 0 && a.status !== "scheduled") await db.update(announcements).set({ status: "dismissed", updatedAt: new Date() }).where(eq(announcements.id, a.id));
      loop.pocketSettled(claimed, "dismissed", by);
      await loop.post(
        a.communityId,
        card.crewRoomId,
        a.liveVersion > 0 ? `Okay ${by}, the announcement “${a.title}” stays as it is.` : `Okay ${by}, I won't post “${v.title}”.`,
      );
      log(`announcement ${a.id}: version ${v.version} dropped by ${by}`);
      return;
    }
    if (!answer.written && !answer.selected.includes(ANNOUNCE_POST_OPTION)) return;
    const text = answer.written ?? v.draft;
    const claimed = await loop.claim(card.id, { status: "answered", answeredAt: new Date(), answeredBy: by, answeredVia: "card", answerText: text });
    if (!claimed) return;
    await db
      .update(announcementVersions)
      .set({ status: "approved", text, approvedBy: by, approvedAt: new Date() })
      .where(eq(announcementVersions.id, v.id));
    const reached = await apply(a, v, text, by, !!answer.written);
    loop.pocketSettled(claimed, "answered", by, reached);
  }

  /** An approved version: post it (now or at its time), or edit what is already out. Returns the spaces reached. */
  async function apply(a: AnnouncementRow, v: VersionRow, text: string, by: string, ownWords: boolean): Promise<number> {
    const crewRoomId = (await loop.crewRoomFor(a.eventId)) ?? null;
    const tz = await communityTz(a.communityId);
    if (a.liveVersion > 0) return editEverywhere(a, v, text, by);
    await db.update(announcements).set({ title: v.title, text, updatedAt: new Date() }).where(eq(announcements.id, a.id));
    if (a.scheduledAt && a.scheduledAt.getTime() > Date.now() + 30_000) {
      await db.update(announcements).set({ status: "scheduled", updatedAt: new Date() }).where(eq(announcements.id, a.id));
      const targets = await announcementTargets(db, a.eventId, a.targetSpaceIds);
      if (crewRoomId) {
        await loop.post(
          a.communityId,
          crewRoomId,
          `Approved by ${by}${ownWords ? " (in their words)" : ""}. “${v.title}” goes out at ${formatWhen(a.scheduledAt, tz)} to ${describeTargets(targets)}.`,
        );
      }
      log(`announcement ${a.id}: approved by ${by}, scheduled for ${a.scheduledAt.toISOString()}`);
      return targets.length;
    }
    return postNow({ ...a, title: v.title, text }, v.version, by);
  }

  /** Post an announcement to every target space, save it as knowledge, and tell the crew. */
  async function postNow(a: AnnouncementRow, version: number, by: string): Promise<number> {
    const crewRoomId = await loop.crewRoomFor(a.eventId);
    if (await isPaused(db, a.communityId)) {
      await db.update(announcements).set({ status: "scheduled", scheduledAt: a.scheduledAt ?? new Date(), updatedAt: new Date() }).where(eq(announcements.id, a.id));
      log(`announcement ${a.id}: approved during the pause; it goes out when the pause lifts`);
      return 0;
    }
    // Claim it, so two runs never post it twice.
    const [claimed] = await db
      .update(announcements)
      .set({ status: "sent", sentAt: new Date(), liveVersion: version, updatedAt: new Date() })
      .where(and(eq(announcements.id, a.id), inArray(announcements.status, ["requested", "waiting", "scheduled"])))
      .returning();
    if (!claimed) return 0;
    const text = claimed.text ?? a.text ?? "";
    const targets = await announcementTargets(db, a.eventId, a.targetSpaceIds);
    const ok: TargetSpace[] = [];
    const failed: TargetSpace[] = [];
    for (const t of targets) {
      const eventId = await loop.post(a.communityId, t.roomId, text);
      await db
        .insert(announcementPosts)
        .values({
          announcementId: a.id,
          spaceId: t.spaceId,
          roomId: t.roomId,
          spaceName: t.name,
          platform: t.platform,
          eventId,
          version,
          status: eventId ? "posted" : "failed",
          error: eventId ? null : "the post did not go through",
        })
        .onConflictDoNothing();
      (eventId ? ok : failed).push(t);
    }
    const entryId = await saveKnowledge(claimed, text, by);
    log(`announcement ${a.id} posted by ${by}'s OK: ${ok.length} space(s), ${failed.length} failed`);
    if (crewRoomId) {
      const miss = failed.length ? ` It did not go through in ${failed.map(spaceLabel).join(", ")}.` : "";
      await loop.post(
        a.communityId,
        crewRoomId,
        `Posted “${claimed.title}” to ${describeTargets(ok)}.${miss}${entryId ? " It's in the knowledge too, so I answer with it from now on." : ""}`,
      );
    }
    return ok.length;
  }

  async function saveKnowledge(a: AnnouncementRow, text: string, by: string): Promise<string | null> {
    try {
      if (a.entryId) {
        await editEntry(db, { entryId: a.entryId, heading: a.title, body: text, by });
        return a.entryId;
      }
      const event = await eventOf(a.eventId);
      const kb = await loadLiveKnowledge(db, config.community);
      const entryId = await saveCrewEntry(db, {
        communityId: a.communityId,
        eventId: a.eventId,
        key: `announcements/${a.id}`,
        sourceRef: a.id,
        sourceTitle: `${event?.name ?? kb?.community.name ?? "Community"} announcements`,
        heading: a.title,
        body: text,
        by,
      });
      await db.update(announcements).set({ entryId }).where(eq(announcements.id, a.id));
      return entryId;
    } catch (err) {
      log(`announcement ${a.id}: saving it as knowledge failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * A later version: edit every post in place through Switch. Where a
   * platform cannot edit (or the first post failed), post the new version as
   * an update instead.
   */
  async function editEverywhere(a: AnnouncementRow, v: VersionRow, text: string, by: string): Promise<number> {
    const crewRoomId = await loop.crewRoomFor(a.eventId);
    if (await isPaused(db, a.communityId)) {
      // Kept approved; the sweep applies it once the pause lifts.
      await db.update(announcementVersions).set({ status: "approved_held" }).where(eq(announcementVersions.id, v.id));
      log(`announcement ${a.id}: edit approved during the pause; applied when it lifts`);
      return 0;
    }
    const posts = await db.select().from(announcementPosts).where(eq(announcementPosts.announcementId, a.id));
    const edited: string[] = [];
    const reposted: string[] = [];
    const failed: string[] = [];
    for (const p of posts) {
      const label = spaceLabel({ name: p.spaceName, platform: p.platform });
      let done = false;
      if (p.eventId) {
        try {
          done = await agent.editMessage(p.roomId, p.eventId, text);
        } catch (err) {
          log(`announcement ${a.id}: edit in ${p.spaceName} failed: ${(err as Error).message}`);
        }
      }
      if (done) {
        await db.update(announcementPosts).set({ status: "edited", version: v.version, error: null, updatedAt: new Date() }).where(eq(announcementPosts.id, p.id));
        edited.push(label);
        continue;
      }
      const eventId = await loop.post(a.communityId, p.roomId, p.eventId ? `Update: ${text}` : text);
      await db
        .update(announcementPosts)
        .set({
          status: eventId ? "reposted" : "failed",
          eventId: eventId ?? p.eventId,
          version: eventId ? v.version : p.version,
          error: eventId ? null : "neither the edit nor a new post went through",
          updatedAt: new Date(),
        })
        .where(eq(announcementPosts.id, p.id));
      (eventId ? reposted : failed).push(label);
    }
    const [updated] = await db
      .update(announcements)
      .set({ title: v.title, text, liveVersion: v.version, updatedAt: new Date() })
      .where(eq(announcements.id, a.id))
      .returning();
    if (updated) await saveKnowledge(updated, text, by);
    log(`announcement ${a.id}: version ${v.version} by ${by}'s OK: ${edited.length} edited, ${reposted.length} reposted, ${failed.length} failed`);
    if (crewRoomId) {
      const parts = [
        edited.length ? `Edited “${v.title}” in place in ${plural(edited.length, "space", "spaces")} (${edited.join(", ")}).` : null,
        reposted.length ? `In ${reposted.join(", ")} the post could not be edited, so I posted the new version as an update.` : null,
        failed.length ? `It did not go through in ${failed.join(", ")}.` : null,
        "The knowledge has the new version too.",
      ];
      await loop.post(a.communityId, crewRoomId, parts.filter(Boolean).join(" "));
    }
    return edited.length + reposted.length;
  }

  /** The card expired without an OK. */
  async function expired(card: CardRow): Promise<void> {
    const v = await versionFor(card);
    const a = card.announcementId ? await load(card.announcementId) : null;
    if (!v || !a) return;
    await db.update(announcementVersions).set({ status: "expired" }).where(eq(announcementVersions.id, v.id));
    if (a.liveVersion === 0 && a.status !== "scheduled") {
      const missed = !!a.scheduledAt && a.scheduledAt.getTime() <= Date.now() + 60_000;
      await db.update(announcements).set({ status: missed ? "missed" : "expired", updatedAt: new Date() }).where(eq(announcements.id, a.id));
    }
    await loop.post(
      a.communityId,
      card.crewRoomId,
      a.liveVersion > 0
        ? `Nobody approved the change to “${a.title}” in time, so the announcement stays as it was.`
        : `Nobody approved “${v.title}” in time, so it was not posted.${a.scheduledAt ? " Its time has passed." : ""}`,
    );
    log(`announcement ${a.id}: version ${v.version} expired without an OK`);
  }

  // ── Crew reminders ─────────────────────────────────────────────────────

  async function remind(input: {
    communityId: string;
    eventId: string | null;
    crewRoomId: string;
    memberIds: string[];
    text: string;
    dueAt: Date;
    by: string;
    sourceMessageId: string;
  }): Promise<boolean> {
    const rows = await db
      .insert(crewReminders)
      .values({
        communityId: input.communityId,
        eventId: input.eventId,
        crewRoomId: input.crewRoomId,
        crewMemberIds: input.memberIds,
        text: input.text,
        dueAt: input.dueAt,
        requestedBy: input.by,
        sourceMessageId: input.sourceMessageId,
      })
      .onConflictDoNothing({ target: crewReminders.sourceMessageId })
      .returning({ id: crewReminders.id });
    if (rows[0]) log(`reminder ${rows[0].id} set by ${input.by} for ${input.dueAt.toISOString()}`);
    return !!rows[0];
  }

  // ── The clock: scheduled posts, held edits, reminders ──────────────────

  let ticking = false;

  async function tick(): Promise<void> {
    if (ticking) return;
    ticking = true;
    try {
      await openPending();
      const now = Date.now();

      const due = await db
        .select()
        .from(announcements)
        .where(and(eq(announcements.status, "scheduled"), lte(announcements.scheduledAt, new Date(now))));
      for (const a of due) {
        const late = now - (a.scheduledAt?.getTime() ?? now);
        if (late > LATE_LIMIT_MS) {
          await db.update(announcements).set({ status: "missed", updatedAt: new Date() }).where(eq(announcements.id, a.id));
          const crewRoomId = await loop.crewRoomFor(a.eventId);
          if (crewRoomId) await loop.post(a.communityId, crewRoomId, `“${a.title}” was due ${Math.round(late / 60000)} min ago and I could not post it then, so I did not send it this late.`);
          const crew = await loadCrew(db, a.communityId, a.eventId);
          await pushToUsers(db, await switchUsersForCrew(db, approvers(crew).owners.map((o) => o.id)), {
            kind: "expire",
            title: "Announcement not posted",
            body: `“${clip(a.title, 140)}” was due ${Math.round(late / 60000)} min ago.`,
            url: "/m",
            tag: `announce-${a.id}`,
            renotify: true,
          });
          log(`announcement ${a.id}: missed (${Math.round(late / 60000)} min late)`);
          continue;
        }
        if (await isPaused(db, a.communityId)) continue;
        await postNow(a, Math.max(1, await approvedVersion(a.id)), a.requestedBy);
      }

      // Edits approved during the pause.
      const held = await db
        .select({ v: announcementVersions, a: announcements })
        .from(announcementVersions)
        .innerJoin(announcements, eq(announcements.id, announcementVersions.announcementId))
        .where(eq(announcementVersions.status, "approved_held"));
      for (const { v, a } of held) {
        if (await isPaused(db, a.communityId)) continue;
        await db.update(announcementVersions).set({ status: "approved" }).where(eq(announcementVersions.id, v.id));
        await editEverywhere(a, v, v.text ?? v.draft, v.approvedBy ?? "the crew");
      }

      const reminders = await db
        .select()
        .from(crewReminders)
        .where(and(eq(crewReminders.status, "pending"), lte(crewReminders.dueAt, new Date(now))));
      for (const r of reminders) {
        const late = now - r.dueAt.getTime();
        if (await isPaused(db, r.communityId)) {
          if (late > LATE_LIMIT_MS) await db.update(crewReminders).set({ status: "missed" }).where(eq(crewReminders.id, r.id));
          continue;
        }
        const [claimed] = await db
          .update(crewReminders)
          .set({ status: late > LATE_LIMIT_MS ? "missed" : "sent", sentAt: new Date() })
          .where(and(eq(crewReminders.id, r.id), eq(crewReminders.status, "pending")))
          .returning();
        if (!claimed || claimed.status === "missed") continue;
        const crew = await loadCrew(db, r.communityId, r.eventId);
        const who = r.crewMemberIds.length ? crew.filter((c) => r.crewMemberIds.includes(c.id)) : crew;
        const { platform } = await deps.room(r.crewRoomId);
        await loop.post(r.communityId, r.crewRoomId, `${who.map((c) => mention(c, platform)).join(" ") || "Crew"}, reminder: ${r.text} (set by ${r.requestedBy})`);
        await pushToUsers(db, await switchUsersForCrew(db, who.map((c) => c.id)), reminderNotice({ id: r.id, text: r.text, by: r.requestedBy }));
        log(`reminder ${r.id} sent to ${who.map((c) => c.name).join(", ")}`);
      }
    } catch (err) {
      log(`launch tick failed: ${(err as Error).message}`);
    } finally {
      ticking = false;
    }
  }

  async function approvedVersion(announcementId: string): Promise<number> {
    const [v] = await db
      .select({ version: announcementVersions.version })
      .from(announcementVersions)
      .where(and(eq(announcementVersions.announcementId, announcementId), eq(announcementVersions.status, "approved")))
      .orderBy(desc(announcementVersions.version))
      .limit(1);
    return v?.version ?? 1;
  }

  // ── Team rooms from a Switch template ──────────────────────────────────

  /**
   * One private channel per team on the crew room's platform, with the
   * members, Ferri and a kickoff, made by `create_room_from_yaml`. Each new
   * room is attached to the event as Auto, so Ferri answers there.
   */
  async function makeTeamRooms(input: {
    communityId: string;
    eventId: string | null;
    crewRoomId: string;
    teams: { name: string; members: string[] }[];
    by: string;
  }): Promise<string> {
    const detail = await agent.op<RoomDetail>("get_room_detail", { room_id: input.crewRoomId }).catch(() => null);
    const bridge = detail?.bridge_display_name;
    if (!bridge) return "The crew room is not on a messaging app, so I cannot make channels from here.";
    const event = await eventOf(input.eventId);
    const existing = await db
      .select({ team: teamRooms.team })
      .from(teamRooms)
      .where(and(eq(teamRooms.communityId, input.communityId), eq(teamRooms.status, "created")));
    const have = new Set(existing.map((e) => e.team.toLowerCase()));
    const fresh = input.teams
      .map((t) => ({ name: t.name.trim(), members: t.members.map((m) => m.trim().replace(/^@/, "")).filter(Boolean) }))
      .filter((t) => t.name && !have.has(t.name.toLowerCase()));
    if (!fresh.length) return "Those team rooms already exist.";
    const made: string[] = [];
    const failed: string[] = [];
    for (const t of fresh) {
      const roomName = teamRoomName(t.name);
      const yaml = teamRoomsTemplate({ bridge, agentName: config.agentName, eventName: event?.name ?? "the event", teams: [{ ...t, roomName }] });
      try {
        const out = await agent.op<unknown>("create_room_from_yaml", { yaml });
        const roomId = findRoomId(out, roomName);
        await db.insert(teamRooms).values({
          communityId: input.communityId,
          eventId: input.eventId,
          team: t.name,
          members: t.members,
          roomName,
          switchRoomId: roomId,
          status: "created",
          requestedBy: input.by,
        });
        if (roomId && input.eventId) {
          const { platform } = await deps.room(roomId).catch(() => ({ platform: null }) as RoomInfo);
          const spaceId = await recordSpace(db, input.communityId, { roomId, name: `${bridge}: ${roomName}`, platform });
          await attachSpace(db, { eventId: input.eventId, spaceId, mode: "auto", role: "members", by: input.by });
        }
        made.push(`${t.name} (#${roomName}${t.members.length ? `, ${t.members.join(", ")}` : ""})`);
        log(`team room ${roomName} made for ${t.name}${roomId ? ` (${roomId})` : ""}`);
      } catch (err) {
        const msg = (err as Error).message;
        await db
          .insert(teamRooms)
          .values({ communityId: input.communityId, eventId: input.eventId, team: t.name, members: t.members, roomName, status: "failed", error: msg.slice(0, 500), requestedBy: input.by })
          .onConflictDoNothing();
        failed.push(`${t.name} (${clip(msg.replace(/^.*?failed: /, ""), 160)})`);
        log(`team room for ${t.name} failed: ${msg}`);
      }
    }
    return [
      made.length ? `Made ${plural(made.length, "team room", "team rooms")} on ${bridge}: ${made.join("; ")}. I'm in each one and answer there.` : null,
      failed.length ? `Could not make ${failed.join("; ")}.` : null,
    ]
      .filter(Boolean)
      .join(" ");
  }

  return { request, revise, remind, makeTeamRooms, tick, openPending, hooks: { outcome, expired } };
}

export type Launch = ReturnType<typeof createLaunch>;
