import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { builderJobs, cards, events, guestMails, guestSends, guests, type Db } from "@ferri/db";
import { parseAddress, replyAddress, resend, textToHtml, type ReceivedEmail, type Resend } from "@ferri/email";
import {
  CARD_QUESTION_ID,
  CARD_SESSION,
  CARD_SKIP_OPTION,
  GUEST_STATUS_LABEL,
  SEND_KIND_LABEL,
  approvers,
  builderPaths,
  countsLine,
  draftGuestEmail,
  voiceBlock,
  firstName,
  formatWhen,
  guestCounts,
  guestMailsToday,
  isPaused,
  loadCrew,
  loadLiveKnowledge,
  localNow,
  mention,
  nextOnWaitlist,
  parseWhen,
  personalText,
  readGuestReply,
  rsvpUrl,
  siteToStatus,
  switchExpiry,
  upsertGuest,
  type CrewIntent,
  type CrewMember,
  type Guest,
  type GuestSend,
  type GuestStatus,
  type SendKind,
} from "@ferri/knowledge";
import { pushToUsers, switchUsersForCrew } from "@ferri/push";
import type { SwitchAgent } from "@ferri/switch";
import { config } from "./config.ts";
import type { AnnounceHooks, Loop, RoomInfo } from "./loop.ts";

type CardRow = typeof cards.$inferSelect;
type EventRow = typeof events.$inferSelect;

export const GUESTS_SEND_OPTION = "send";
export const SPOT_OFFER_OPTION = "offer";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const OFFER_HOURS = 24;

export interface GuestsDeps {
  db: Db;
  agent: SwitchAgent;
  loop: Loop;
  room: (roomId: string) => Promise<RoomInfo>;
  log: (msg: string) => void;
  /** For tests: a stand-in for Resend. */
  mail?: Resend | null;
}

/** What the listings kit's `guests.mjs list` prints. */
interface LumaList {
  event: string;
  guests: { id: string; name: string; email: string; lumaStatus: string; status: GuestStatus; registeredAt: string | null; checkedInAt: string | null }[];
}

/**
 * RSVP (spec 17). One guest list per event in Ferri, synced from the event
 * site the Builder shipped (its guest route) and from Luma (the host's Guests
 * tab in the Builder's browser, read with the listings kit, no model call).
 * Every email to guests (a reminder, a free-your-spot nudge, a spot offer)
 * waits on a card; guests answer on Desk's public RSVP page or by replying;
 * a freed spot is offered to the next person on the waitlist after a card.
 */
export function createGuests(deps: GuestsDeps) {
  const { db, agent, loop, log } = deps;
  const mail = deps.mail !== undefined ? deps.mail : config.resendApiKey ? resend({ apiKey: config.resendApiKey }) : null;
  const mailbox = parseAddress(config.guestEmailFrom)?.email ?? "events@rudratechie.xyz";
  const lastSync = new Map<string, number>();

  async function eventRow(eventId: string): Promise<EventRow | null> {
    const [ev] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
    return ev ?? null;
  }

  async function say(eventId: string | null, communityId: string, text: string): Promise<void> {
    const roomId = await loop.crewRoomFor(eventId);
    if (roomId) await loop.post(communityId, roomId, text);
  }

  async function setSync(ev: EventRow, source: string, r: { ok: boolean; count: number; error?: string | null }): Promise<void> {
    await db
      .update(events)
      .set({ guestSync: sql`coalesce(${events.guestSync}, '{}'::jsonb) || ${JSON.stringify({ [source]: { at: new Date().toISOString(), ...r } })}::jsonb` })
      .where(eq(events.id, ev.id));
  }

  // ── Sync: Luma (the Builder's browser) and the event site ─────────────────

  /** Run the listings kit's guest script in the Builder's folder. */
  function kit(args: string[], timeoutMs = 120_000): Promise<{ code: number; out: string; err: string }> {
    const dir = builderPaths().dir;
    const script = path.join(dir, "kits", "listings", "scripts", "guests.mjs");
    return new Promise((resolve) => {
      if (!fs.existsSync(script)) return resolve({ code: 2, out: "", err: "The listings kit has no guests.mjs (run pnpm builder:setup)." });
      execFile(process.execPath, [script, ...args], { cwd: dir, timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
        const code = error ? (typeof (error as { code?: unknown }).code === "number" ? ((error as { code: number }).code) : 1) : 0;
        resolve({ code, out: stdout, err: stderr || (error ? error.message : "") });
      });
    });
  }

  async function syncLuma(ev: EventRow): Promise<{ ok: boolean; count: number; error?: string | null; changes: string[] }> {
    if (!ev.lumaEventId) return { ok: false, count: 0, error: "no Luma listing", changes: [] };
    const r = await kit(["list", "--event", ev.lumaEventId]);
    if (r.code !== 0) {
      const error = r.code === 5 ? "The Builder's browser is not logged in to Luma (or not running)." : clip(r.err.trim() || `exit ${r.code}`, 300);
      return { ok: false, count: 0, error, changes: [] };
    }
    const list = JSON.parse(r.out.trim().split("\n").pop() ?? "{}") as LumaList;
    const changes: string[] = [];
    for (const g of list.guests ?? []) {
      if (!g.email) continue;
      const u = await upsertGuest(db, {
        communityId: ev.communityId,
        eventId: ev.id,
        email: g.email,
        name: g.name,
        source: "luma",
        status: g.status,
        sourceStatus: g.lumaStatus,
        lumaId: g.id,
        registeredAt: g.registeredAt ? new Date(g.registeredAt) : null,
        checkedInAt: g.checkedInAt ? new Date(g.checkedInAt) : null,
      });
      if (u.created) changes.push(`${u.guest.name} (${GUEST_STATUS_LABEL[u.guest.status]})`);
      else if (u.from) changes.push(`${u.guest.name}: ${GUEST_STATUS_LABEL[u.from]} → ${GUEST_STATUS_LABEL[u.guest.status]}`);
    }
    return { ok: true, count: list.guests?.length ?? 0, changes };
  }

  /** The event's live site: the newest site job's address (or FERRI_SITE_URL for tests). */
  async function siteUrlFor(eventId: string): Promise<string | null> {
    if (config.siteUrlOverride) return config.siteUrlOverride;
    const [site] = await db
      .select({ url: builderJobs.url })
      .from(builderJobs)
      .where(and(eq(builderJobs.eventId, eventId), eq(builderJobs.kind, "site"), isNotNull(builderJobs.url)))
      .orderBy(desc(builderJobs.number))
      .limit(1);
    return site?.url ?? null;
  }

  async function siteCall<T>(eventId: string, method: "GET" | "POST", body?: unknown): Promise<{ ok: boolean; status: number; data: T | null; url: string | null }> {
    const url = await siteUrlFor(eventId);
    if (!url || !config.siteHookSecret) return { ok: false, status: 0, data: null, url };
    try {
      const r = await fetch(`${url.replace(/\/+$/, "")}/api/ferri/guests`, {
        method,
        headers: { authorization: `Bearer ${config.siteHookSecret}`, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15_000),
      });
      const text = await r.text();
      let data: T | null = null;
      try {
        data = text ? (JSON.parse(text) as T) : null;
      } catch {
        data = null;
      }
      return { ok: r.ok, status: r.status, data, url };
    } catch (err) {
      log(`guests: the site at ${url} did not answer: ${(err as Error).message}`);
      return { ok: false, status: 0, data: null, url };
    }
  }

  async function syncSite(ev: EventRow): Promise<{ ok: boolean; count: number; error?: string | null; changes: string[] }> {
    const r = await siteCall<{ guests: { id: string; name: string; email: string; team: string | null; status: string; createdAt: string }[]; capacity?: number | null }>(ev.id, "GET");
    if (!r.url) return { ok: false, count: 0, error: "no event site", changes: [] };
    if (!r.ok || !r.data) {
      const error =
        r.status === 404
          ? "The live site has no guest route yet; it comes with the next deploy of the kit."
          : r.status === 401
            ? "The site refused Ferri's key (FERRI_SITE_HOOK_SECRET)."
            : `The site answered ${r.status || "nothing"}.`;
      return { ok: false, count: 0, error, changes: [] };
    }
    const changes: string[] = [];
    for (const g of r.data.guests) {
      const u = await upsertGuest(db, {
        communityId: ev.communityId,
        eventId: ev.id,
        email: g.email,
        name: g.name,
        source: "site",
        status: siteToStatus(g.status),
        sourceStatus: g.status,
        siteId: g.id,
        team: g.team,
        registeredAt: g.createdAt ? new Date(g.createdAt) : null,
      });
      if (u.created) changes.push(`${u.guest.name} (${GUEST_STATUS_LABEL[u.guest.status]})`);
      else if (u.from) changes.push(`${u.guest.name}: ${GUEST_STATUS_LABEL[u.from]} → ${GUEST_STATUS_LABEL[u.guest.status]}`);
    }
    if (r.data.capacity && !ev.capacity) await db.update(events).set({ capacity: r.data.capacity }).where(eq(events.id, ev.id));
    return { ok: true, count: r.data.guests.length, changes };
  }

  /** Sync every source of one event. Returns a line for the crew. */
  async function syncEvent(ev: EventRow): Promise<string> {
    lastSync.set(ev.id, Date.now());
    const lines: string[] = [];
    if (ev.lumaEventId) {
      const r = await syncLuma(ev);
      await setSync(ev, "luma", r);
      lines.push(r.ok ? `Luma: ${plural(r.count, "guest", "guests")}${r.changes.length ? ` (${r.changes.slice(0, 6).join("; ")})` : ""}` : `Luma: ${r.error}`);
      if (r.changes.length) log(`guests: Luma sync for ${ev.name}: ${r.changes.join("; ")}`);
    }
    if (await siteUrlFor(ev.id)) {
      const r = await syncSite(ev);
      await setSync(ev, "site", r);
      lines.push(r.ok ? `the site: ${plural(r.count, "registration", "registrations")}${r.changes.length ? ` (${r.changes.slice(0, 6).join("; ")})` : ""}` : `the site: ${r.error}`);
      if (r.changes.length) log(`guests: site sync for ${ev.name}: ${r.changes.join("; ")}`);
    }
    const counts = await guestCounts(db, ev.id);
    return `${ev.name}: ${countsLine(counts, ev.capacity)}.${lines.length ? ` Synced ${lines.join("; ")}.` : " No Luma listing or site to sync from yet."}`;
  }

  /** What the shipped site reported about one person (its hook, through Desk's /api/site). */
  async function siteEvent(e: { communityId: string; type: string; payload: Record<string, unknown>; eventId: string | null }): Promise<void> {
    if (!e.eventId || !["registration", "cancelled", "status"].includes(e.type)) return;
    const p = e.payload;
    const email = typeof p.email === "string" ? p.email : null;
    if (!email) return;
    const status = e.type === "cancelled" ? "cancelled" : typeof p.status === "string" ? p.status : "going";
    const u = await upsertGuest(db, {
      communityId: e.communityId,
      eventId: e.eventId,
      email,
      name: typeof p.name === "string" ? p.name : email,
      source: "site",
      status: siteToStatus(status),
      sourceStatus: status,
      siteId: typeof p.id === "string" ? p.id : null,
    });
    if (u.from) log(`guests: the site moved ${u.guest.name}: ${u.from} → ${u.guest.status}`);
  }

  // ── Guests' own answers (the RSVP page, a reply) ──────────────────────────

  async function rsvpTick(): Promise<void> {
    const due = await db.select().from(guests).where(and(isNotNull(guests.rsvpAnswer), isNull(guests.rsvpHandledAt))).limit(10);
    for (const g of due) {
      const [claimed] = await db
        .update(guests)
        .set({ rsvpHandledAt: new Date() })
        .where(and(eq(guests.id, g.id), isNull(guests.rsvpHandledAt)))
        .returning();
      if (!claimed) continue;
      await applyAnswer(claimed, claimed.rsvpAnswer ?? "", "their RSVP link");
    }
  }

  /** "yes", "no" or "take" from a guest: statuses, the sources, the waitlist, the crew. */
  async function applyAnswer(g: Guest, answer: string, via: string): Promise<void> {
    const ev = await eventRow(g.eventId);
    if (!ev) return;
    const now = new Date();
    const first = firstName(g.name);
    if (answer === "yes") {
      if (g.status === "going" || g.status === "pending") {
        await db.update(guests).set({ confirmedAt: now, updatedAt: now }).where(eq(guests.id, g.id));
        log(`guests: ${g.name} confirmed for ${ev.name} (${via})`);
        return;
      }
      if (g.status === "not_going") {
        const c = await guestCounts(db, ev.id);
        const room = !ev.capacity || c.going < ev.capacity;
        await db.update(guests).set({ status: room ? "going" : "waitlist", confirmedAt: now, freedAt: null, updatedAt: now }).where(eq(guests.id, g.id));
        if (g.siteId) await siteCall(ev.id, "POST", { id: g.siteId, status: room ? "going" : "waitlist" });
        await say(ev.id, ev.communityId, `${g.name} can come to ${ev.name} after all (${via}). ${room ? "There was room, so they're going again." : "It's full, so they're on the waitlist."}${g.lumaId ? " Luma still shows them as Not Going; set them back in Luma's Guests tab if they registered there." : ""}`);
        return;
      }
      return;
    }
    if (answer === "take") {
      if (g.status !== "waitlist" || !g.offerExpiresAt || g.offerExpiresAt < now) {
        log(`guests: ${g.name} tried to take a spot without an open offer`);
        return;
      }
      await db.update(guests).set({ status: "going", confirmedAt: now, offerExpiresAt: null, updatedAt: now }).where(eq(guests.id, g.id));
      if (g.siteId) await siteCall(ev.id, "POST", { id: g.siteId, status: "going" });
      if (g.lumaId && ev.lumaEventId) {
        const r = await kit(["status", "--event", ev.lumaEventId, "--email", g.email, "--to", "going"]);
        if (r.code !== 0) log(`guests: admitting ${g.email} on Luma failed: ${r.err.trim()}`);
      }
      await say(ev.id, ev.communityId, `${g.name} took the free spot for ${ev.name} (${via}). ${countsLine(await guestCounts(db, ev.id), ev.capacity)}.`);
      return;
    }
    if (answer === "no") {
      const wasGoing = g.status === "going" || g.status === "pending";
      await db
        .update(guests)
        .set({ status: "not_going", freedAt: wasGoing ? now : g.freedAt, spotHandledAt: wasGoing ? null : g.spotHandledAt, offerExpiresAt: null, updatedAt: now })
        .where(eq(guests.id, g.id));
      // The guest's own decision: their registration follows on the site and, quietly, on Luma.
      if (g.siteId) await siteCall(ev.id, "POST", { id: g.siteId, status: "cancelled" });
      if (g.lumaId && ev.lumaEventId) {
        const r = await kit(["status", "--event", ev.lumaEventId, "--email", g.email, "--to", "not_going", "--quiet"]);
        if (r.code !== 0) log(`guests: setting ${g.email} to Not Going on Luma failed: ${r.err.trim()}`);
        else await db.update(guests).set({ lumaStatus: "declined" }).where(eq(guests.id, g.id));
      }
      await say(
        ev.id,
        ev.communityId,
        wasGoing
          ? `${g.name} can't make it to ${ev.name} any more (${via}), so their spot is free.`
          : g.status === "waitlist"
            ? `${first} left the waitlist for ${ev.name} (${via}).`
            : `${g.name} says they can't make it (${via}).`,
      );
    }
  }

  // ── The waitlist: a free spot goes to the next person, after a card ────────

  async function spotTick(): Promise<void> {
    const live = await db.select().from(events).where(inArray(events.stage, ["plan", "build", "launch", "live"]));
    for (const ev of live) {
      if (await isPaused(db, ev.communityId)) continue;
      const [open] = await db.select({ id: cards.id }).from(cards).where(and(eq(cards.eventId, ev.id), eq(cards.kind, "spot"), eq(cards.status, "open"))).limit(1);
      if (open) continue;
      const skip = ev.guestSync?.spots;
      if (skip && !skip.ok && new Date(skip.at) > new Date()) continue;
      const c = await guestCounts(db, ev.id);
      const [{ offers }] = (await db
        .select({ offers: sql<number>`count(*)::int` })
        .from(guests)
        .where(and(eq(guests.eventId, ev.id), eq(guests.status, "waitlist"), gt(guests.offerExpiresAt, new Date())))) as [{ offers: number }];
      const freed = await db
        .select()
        .from(guests)
        .where(and(eq(guests.eventId, ev.id), isNotNull(guests.freedAt), isNull(guests.spotHandledAt)))
        .orderBy(asc(guests.freedAt));
      const free = ev.capacity ? ev.capacity - c.going - offers : freed.length;
      if (free <= 0) {
        if (freed.length) await db.update(guests).set({ spotHandledAt: new Date() }).where(inArray(guests.id, freed.map((f) => f.id)));
        continue;
      }
      const next = await nextOnWaitlist(db, ev.id);
      if (!next) {
        if (freed.length) {
          await db.update(guests).set({ spotHandledAt: new Date() }).where(inArray(guests.id, freed.map((f) => f.id)));
          log(`guests: ${freed.map((f) => f.name).join(", ")} freed a spot for ${ev.name}; nobody is waiting`);
        }
        continue;
      }
      await openSpotCard(ev, next, freed[0] ?? null, c.going);
      if (freed.length) await db.update(guests).set({ spotHandledAt: new Date() }).where(inArray(guests.id, freed.map((f) => f.id)));
    }
  }

  async function openSpotCard(ev: EventRow, next: Guest, freed: Guest | null, going: number): Promise<void> {
    const crewRoomId = await loop.crewRoomFor(ev.id);
    if (!crewRoomId) return;
    const crew = await loadCrew(db, ev.communityId, ev.id);
    const route = approvers(crew);
    const times = await loop.ladderFor(ev.communityId, ev);
    const id = randomUUID();
    const how = next.lumaId && ev.lumaEventId ? "Luma admits them and emails them itself." : `I email them the offer from ${mailbox}; they have ${OFFER_HOURS} hours to say yes on their RSVP link.`;
    const question = clip(`${freed ? `${firstName(freed.name)} can't come. ` : ""}Offer the spot to ${next.name}?`, 300);
    const detail = `${freed ? `${freed.name} freed their spot. ` : ""}${going}${ev.capacity ? ` of ${ev.capacity}` : ""} going now. ${next.name} (${next.email}) is first on the waitlist${next.registeredAt ? `, since ${formatWhen(next.registeredAt, "Asia/Kolkata")}` : ""}. ${how}`;
    await db.insert(cards).values({
      id,
      communityId: ev.communityId,
      eventId: ev.id,
      crewRoomId,
      switchSessionId: CARD_SESSION,
      kind: "spot",
      topic: "waitlist",
      question,
      ownerIds: route.owners.map((o) => o.id),
      draftText: detail,
      guestId: next.id,
      ...times,
    });
    try {
      await agent.openQuestionsCard(CARD_SESSION, {
        request_id: id,
        turn_id: id,
        title: `Waitlist · ${ev.name} · ${question}`,
        detail: "A spot is free. Nothing is sent until someone on the crew says so.",
        questions: [
          {
            id: CARD_QUESTION_ID,
            title: `Offer the spot to ${next.name}?`,
            prompt: detail,
            options: [
              { id: SPOT_OFFER_OPTION, label: `Offer it to ${firstName(next.name)}`, description: null },
              { id: CARD_SKIP_OPTION, label: "Don't offer it", description: null },
            ],
            multi_select: false,
            allow_custom_answer: false,
          },
        ],
        room_id: crewRoomId,
        thread_id: null,
        expires_at: switchExpiry(times.expiresAt).toISOString(),
      });
    } catch (err) {
      await db.update(cards).set({ status: "closed", updatedAt: new Date() }).where(eq(cards.id, id));
      log(`guests: opening the spot card failed: ${(err as Error).message}`);
      return;
    }
    const { platform } = await deps.room(crewRoomId);
    await loop.post(ev.communityId, crewRoomId, `${route.owners.map((o) => mention(o, platform)).join(" ") || "Crew"}, a spot is free for ${ev.name}${freed ? ` (${freed.name} can't come)` : ""}. Offer it to ${next.name}, first on the waitlist? It's on the card above.`);
    const [row] = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
    if (row) loop.pocketNotify("open", row, route.owners.map((o) => o.id), { roomName: ev.name });
    log(`guests: spot card ${id} for ${next.name} (${ev.name})`);
  }

  async function spotOutcome(card: CardRow, answer: { written: string | null; selected: string[] }, by: string): Promise<void> {
    const offer = answer.selected.includes(SPOT_OFFER_OPTION);
    const claimed = await loop.claim(card.id, { status: offer ? "answered" : "dismissed", answeredAt: new Date(), answeredBy: by, answeredVia: "card" });
    if (!claimed) return;
    loop.pocketSettled(claimed, offer ? "answered" : "dismissed", by);
    const ev = card.eventId ? await eventRow(card.eventId) : null;
    const [g] = card.guestId ? await db.select().from(guests).where(eq(guests.id, card.guestId)).limit(1) : [];
    if (!ev || !g) return;
    if (!offer) {
      // Not now: no new spot card for this event for six hours.
      await db
        .update(events)
        .set({ guestSync: sql`coalesce(${events.guestSync}, '{}'::jsonb) || ${JSON.stringify({ spots: { at: new Date(Date.now() + 6 * 3600_000).toISOString(), ok: false, count: 0, error: `not offered (${by})` } })}::jsonb` })
        .where(eq(events.id, ev.id));
      await say(ev.id, ev.communityId, `Okay ${by}, I won't offer the spot to ${g.name} now. I'll ask again in a few hours if it's still free.`);
      return;
    }
    if (g.status !== "waitlist") {
      await say(ev.id, ev.communityId, `${g.name} is ${GUEST_STATUS_LABEL[g.status]} now, so there's nothing to offer them.`);
      return;
    }
    if (g.lumaId && ev.lumaEventId) {
      const r = await kit(["status", "--event", ev.lumaEventId, "--email", g.email, "--to", "going"]);
      if (r.code !== 0) {
        await say(ev.id, ev.communityId, `I couldn't admit ${g.name} on Luma: ${clip(r.err.trim() || `exit ${r.code}`, 200)}`);
        return;
      }
      await db.update(guests).set({ status: "going", lumaStatus: "approved", offeredAt: new Date(), confirmedAt: null, updatedAt: new Date() }).where(eq(guests.id, g.id));
      await say(ev.id, ev.communityId, `${g.name} is in, approved by ${by}: Luma admitted them from the waitlist and emailed them. ${countsLine(await guestCounts(db, ev.id), ev.capacity)}.`);
      log(`guests: ${g.email} admitted on Luma (${ev.name}), approved by ${by}`);
      return;
    }
    // The site or a list: Ferri emails the offer; the guest's yes on their RSVP link takes it.
    const expires = new Date(Date.now() + OFFER_HOURS * 3600_000);
    await db.update(guests).set({ offeredAt: new Date(), offerExpiresAt: expires, updatedAt: new Date() }).where(eq(guests.id, g.id));
    const [send] = await db
      .insert(guestSends)
      .values({
        communityId: ev.communityId,
        eventId: ev.id,
        kind: "offer",
        audience: "listed",
        guestIds: [g.id],
        ask: `A spot opened up for ${g.name}. They have ${OFFER_HOURS} hours to say yes.`,
        status: "drafting",
        requestedBy: by,
        origin: "chat",
        cardId: card.id,
      })
      .returning();
    if (send) await draftSend(send, { approved: true });
    await say(ev.id, ev.communityId, `Offering the spot to ${g.name}, approved by ${by}. They have ${OFFER_HOURS} hours to take it on their RSVP link.`);
  }

  async function spotExpired(card: CardRow): Promise<void> {
    if (!card.eventId) return;
    await say(card.eventId, card.communityId, `Nobody answered the waitlist card “${card.question}”, so nobody was offered the spot. I'll ask again while it's free.`);
  }

  /** Offers nobody took in time: the next person gets a new card (the spot counts as free again). */
  async function offerTick(): Promise<void> {
    const lapsed = await db
      .select()
      .from(guests)
      .where(and(eq(guests.status, "waitlist"), isNotNull(guests.offerExpiresAt), lte(guests.offerExpiresAt, new Date())))
      .limit(10);
    for (const g of lapsed) {
      await db.update(guests).set({ offerExpiresAt: null, updatedAt: new Date() }).where(eq(guests.id, g.id));
      await say(g.eventId, g.communityId, `${g.name} didn't take the offered spot in ${OFFER_HOURS} hours, so it goes to the next person on the waitlist.`);
    }
  }

  // ── Sends: one card each, then one personal email per guest ───────────────

  async function audienceOf(s: GuestSend): Promise<Guest[]> {
    if (s.audience === "listed") return s.guestIds.length ? db.select().from(guests).where(inArray(guests.id, s.guestIds)) : [];
    return db
      .select()
      .from(guests)
      .where(and(eq(guests.eventId, s.eventId), eq(guests.status, s.audience === "waitlist" ? "waitlist" : "going")))
      .orderBy(asc(guests.registeredAt));
  }

  /** Draft a send and open its card (or, for an offer the spot card approved, send it). */
  async function draftSend(s: GuestSend, opts: { approved?: boolean; roomId?: string | null } = {}): Promise<boolean> {
    const ev = await eventRow(s.eventId);
    if (!ev) return false;
    const kb = await loadLiveKnowledge(db, config.community, { eventId: ev.id });
    if (!kb) return false;
    let subject: string | null = null;
    let text: string | null = null;
    let missing: string[] = [];
    // Spec 21: the event's tone and language, and its daily cap.
    const settings = await loop.settings({ communityId: ev.communityId, eventId: ev.id });
    try {
      const { draft } = await draftGuestEmail({ choice: config.modelMain, kb, eventId: ev.id, kind: s.kind as SendKind, ask: s.ask ?? "", now: localNow(kb.community.timezone), voice: voiceBlock(settings) });
      if (draft) {
        subject = draft.subject;
        text = draft.text;
        missing = draft.missing;
      }
    } catch (err) {
      log(`guests: drafting the ${s.kind} for ${ev.name} failed: ${(err as Error).message}`);
    }
    if (!subject || !text) {
      await db.update(guestSends).set({ status: "requested", updatedAt: new Date() }).where(eq(guestSends.id, s.id));
      return false;
    }
    const people = await audienceOf(s);
    if (opts.approved) {
      await db.update(guestSends).set({ subject, text, total: people.length, status: "sending", updatedAt: new Date() }).where(eq(guestSends.id, s.id));
      return true;
    }
    if (!people.length) {
      await db.update(guestSends).set({ subject, text, total: 0, status: "failed", error: "nobody to send it to", updatedAt: new Date() }).where(eq(guestSends.id, s.id));
      await say(ev.id, ev.communityId, `There's nobody ${s.audience === "waitlist" ? "on the waitlist" : "going"} for ${ev.name} yet, so I didn't draft the ${SEND_KIND_LABEL[s.kind]}. Sync the guest list first ("@${config.agentName} sync the guest list").`);
      return true;
    }
    const crewRoomId = opts.roomId ?? (await loop.crewRoomFor(ev.id));
    if (!crewRoomId) return false;
    const crew = await loadCrew(db, ev.communityId, ev.id);
    const asker = s.requestedById ? crew.find((c) => c.id === s.requestedById) : undefined;
    const owners = asker ? [asker] : approvers(crew).owners;
    const times = await loop.ladderFor(ev.communityId, ev);
    const id = randomUUID();
    const sample = personalText({ kind: s.kind as SendKind, text, name: people[0]!.name, url: rsvpUrl(config.publicUrl, people[0]!.code), eventName: ev.name });
    const left = Math.max(0, settings.guestDailyCap - (await guestMailsToday(db)));
    const when = s.scheduledAt ? `at ${formatWhen(s.scheduledAt, kb.community.timezone)}` : "as soon as it's approved";
    const capNote = people.length > left ? ` I send at most ${settings.guestDailyCap} guest emails a day, so ${people.length - left} of them go out over the next day.` : "";
    const title = `${SEND_KIND_LABEL[s.kind]!.replace(/^./, (c) => c.toUpperCase())} · ${ev.name} · to ${plural(people.length, "guest", "guests")} ${s.audience === "waitlist" ? "on the waitlist" : "going"}`;
    await db.insert(cards).values({
      id,
      communityId: ev.communityId,
      eventId: ev.id,
      crewRoomId,
      switchSessionId: CARD_SESSION,
      kind: "guests",
      topic: s.kind,
      question: clip(`${ev.name}: ${subject}`, 300),
      ownerIds: owners.map((o) => o.id),
      draftText: text,
      guestSendId: s.id,
      ...times,
    });
    try {
      await agent.openQuestionsCard(CARD_SESSION, {
        request_id: id,
        turn_id: id,
        title: clip(`${title}: “${subject}”`, 500),
        detail: "One OK sends one personal email to each guest. Nothing is sent before that.",
        questions: [
          {
            id: CARD_QUESTION_ID,
            title: "Send it?",
            prompt:
              `From: ${ev.name} <${mailbox}>, ${when}, to ${plural(people.length, "guest", "guests")}.${capNote}\n` +
              `Subject: ${subject}\n\nWhat ${firstName(people[0]!.name)} gets:\n\n${sample.slice(0, 3000)}\n\n` +
              (missing.length ? `Not in the knowledge, so left out: ${missing.join("; ")}.\n\n` : "") +
              "Pick Send it or Don't send, or write your own version of the body in quotes after the card code (use {first} for each guest's first name).",
            options: [
              { id: GUESTS_SEND_OPTION, label: "Send it", description: null },
              { id: CARD_SKIP_OPTION, label: "Don't send", description: null },
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
      await db.update(guestSends).set({ status: "failed", error: `card: ${(err as Error).message}`, updatedAt: new Date() }).where(eq(guestSends.id, s.id));
      log(`guests: opening the card for the ${s.kind} failed: ${(err as Error).message}`);
      return false;
    }
    await db.update(guestSends).set({ subject, text, total: people.length, status: "waiting", cardId: id, updatedAt: new Date() }).where(eq(guestSends.id, s.id));
    const { platform } = await deps.room(crewRoomId);
    const who = owners.map((o) => mention(o, platform)).join(" ") || "Crew";
    await loop.post(ev.communityId, crewRoomId, `${who}, the ${SEND_KIND_LABEL[s.kind]} for ${ev.name} (${plural(people.length, "guest", "guests")}, ${when}) needs your OK: “${subject}”. It's on the card above.`);
    const [row] = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
    if (row) loop.pocketNotify("open", row, owners.map((o) => o.id), { roomName: ev.name });
    log(`guests: card ${id} for the ${s.kind} to ${people.length} guests of ${ev.name}`);
    return true;
  }

  async function sendOutcome(card: CardRow, answer: { written: string | null; selected: string[] }, by: string): Promise<void> {
    const [s] = card.guestSendId ? await db.select().from(guestSends).where(eq(guestSends.id, card.guestSendId)).limit(1) : [];
    if (!s) return;
    const send = !!answer.written || answer.selected.includes(GUESTS_SEND_OPTION);
    const claimed = await loop.claim(card.id, { status: send ? "answered" : "dismissed", answeredAt: new Date(), answeredBy: by, answeredVia: "card", answerText: answer.written });
    if (!claimed) return;
    loop.pocketSettled(claimed, send ? "answered" : "dismissed", by);
    const ev = await eventRow(s.eventId);
    if (!send) {
      await db.update(guestSends).set({ status: "dismissed", updatedAt: new Date() }).where(eq(guestSends.id, s.id));
      await say(s.eventId, s.communityId, `Okay ${by}, I won't send the ${SEND_KIND_LABEL[s.kind]} for ${ev?.name ?? "the event"}.`);
      return;
    }
    const later = s.scheduledAt && s.scheduledAt > new Date();
    await db
      .update(guestSends)
      .set({ status: later ? "scheduled" : "sending", text: answer.written?.trim() || s.text, updatedAt: new Date() })
      .where(eq(guestSends.id, s.id));
    const tz = (await loadLiveKnowledge(db, config.community))?.community.timezone ?? "Asia/Kolkata";
    await say(s.eventId, s.communityId, later ? `Approved by ${by}: the ${SEND_KIND_LABEL[s.kind]} goes out at ${formatWhen(s.scheduledAt!, tz)}.` : `Approved by ${by}: sending the ${SEND_KIND_LABEL[s.kind]} to ${plural(s.total, "guest", "guests")} now.`);
  }

  async function sendExpired(card: CardRow): Promise<void> {
    if (!card.guestSendId) return;
    await db.update(guestSends).set({ status: "expired", updatedAt: new Date() }).where(eq(guestSends.id, card.guestSendId));
    if (card.eventId) await say(card.eventId, card.communityId, `Nobody approved “${card.question}” in time, so it was not sent.`);
  }

  /** Send what is approved, one personal email per guest, inside the daily cap. */
  async function sendingTick(): Promise<void> {
    await db.update(guestSends).set({ status: "sending", updatedAt: new Date() }).where(and(eq(guestSends.status, "scheduled"), lte(guestSends.scheduledAt, new Date())));
    const sending = await db.select().from(guestSends).where(eq(guestSends.status, "sending")).orderBy(asc(guestSends.createdAt)).limit(3);
    for (const s of sending) {
      if (!mail) {
        await db.update(guestSends).set({ status: "failed", error: "email is not set up (no RESEND_API_KEY)", updatedAt: new Date() }).where(eq(guestSends.id, s.id));
        continue;
      }
      if (await isPaused(db, s.communityId)) continue;
      const ev = await eventRow(s.eventId);
      if (!ev || !s.subject || !s.text) continue;
      // The audience is fixed when sending starts: one queued copy per guest.
      const people = await audienceOf(s);
      for (const g of people) await db.insert(guestMails).values({ sendId: s.id, guestId: g.id, email: g.email }).onConflictDoNothing();
      const queued = await db
        .select({ m: guestMails, g: guests })
        .from(guestMails)
        .innerJoin(guests, eq(guests.id, guestMails.guestId))
        .where(and(eq(guestMails.sendId, s.id), eq(guestMails.status, "queued")))
        .limit(20);
      // Spec 21: the event's `guestDailyCap` (FERRI_GUEST_EMAIL_DAILY_CAP is the base).
      const cap = (await loop.settings({ communityId: s.communityId, eventId: s.eventId })).guestDailyCap;
      const left = cap - (await guestMailsToday(db));
      if (queued.length && left <= 0) {
        if (!s.error?.startsWith("daily cap")) {
          await db.update(guestSends).set({ error: `daily cap: the rest goes out as the 24-hour limit frees up`, updatedAt: new Date() }).where(eq(guestSends.id, s.id));
          await say(s.eventId, s.communityId, `I've sent ${cap} guest emails in the last 24 hours, the most I send in a day, so the rest of the ${SEND_KIND_LABEL[s.kind]} goes out as that frees up.`);
        }
        continue;
      }
      let sent = 0;
      let failed = 0;
      for (const { m, g } of queued.slice(0, Math.max(0, left))) {
        if (config.guestEmailAllow.length && !config.guestEmailAllow.includes(g.email.split("@")[1] ?? "")) {
          await db.update(guestMails).set({ status: "failed", error: "skipped: outside FERRI_GUEST_EMAIL_ALLOW" }).where(eq(guestMails.id, m.id));
          failed++;
          continue;
        }
        const text = personalText({ kind: s.kind as SendKind, text: s.text, name: g.name, url: rsvpUrl(config.publicUrl, g.code), eventName: ev.name });
        try {
          const r = await mail.send({
            from: `${ev.name.replace(/[<>"]/g, "")} <${mailbox}>`,
            to: g.email,
            subject: s.subject,
            text,
            html: textToHtml(text),
            replyTo: replyAddress(mailbox, g.code),
            tags: [
              { name: "kind", value: `guests-${s.kind}` },
              { name: "guest", value: g.code },
            ],
            idempotencyKey: `ferri-guest-${m.id}`,
          });
          await db.update(guestMails).set({ status: "sent", resendId: r.id, sentAt: new Date() }).where(eq(guestMails.id, m.id));
          sent++;
        } catch (err) {
          await db.update(guestMails).set({ status: "failed", error: (err as Error).message.slice(0, 300) }).where(eq(guestMails.id, m.id));
          failed++;
        }
      }
      const [tot] = (await db
        .select({ sent: sql<number>`count(*) filter (where ${guestMails.status} in ('sent','delivered','bounced','complained'))::int`, failed: sql<number>`count(*) filter (where ${guestMails.status} = 'failed')::int`, queued: sql<number>`count(*) filter (where ${guestMails.status} = 'queued')::int`, all: sql<number>`count(*)::int` })
        .from(guestMails)
        .where(eq(guestMails.sendId, s.id))) as [{ sent: number; failed: number; queued: number; all: number }];
      const done = tot.queued === 0;
      await db
        .update(guestSends)
        .set({ sent: tot.sent, failed: tot.failed, total: tot.all, status: done ? "sent" : "sending", sentAt: done ? new Date() : s.sentAt, updatedAt: new Date() })
        .where(eq(guestSends.id, s.id));
      if (sent || failed) log(`guests: ${s.kind} for ${ev.name}: ${sent} sent, ${failed} failed, ${tot.queued} left`);
      if (done && s.kind !== "offer") {
        const [{ skipped }] = (await db
          .select({ skipped: sql<number>`count(*)::int` })
          .from(guestMails)
          .where(and(eq(guestMails.sendId, s.id), sql`${guestMails.error} like 'skipped:%'`))) as [{ skipped: number }];
        const failedReal = tot.failed - skipped;
        await say(
          s.eventId,
          s.communityId,
          `Sent the ${SEND_KIND_LABEL[s.kind]} for ${ev.name} to ${plural(tot.sent, "guest", "guests")}${failedReal ? ` (${failedReal} failed; see Desk)` : ""}${skipped ? `; ${skipped} skipped, outside the test domains (FERRI_GUEST_EMAIL_ALLOW)` : ""}. Replies come back to me.`,
        );
      }
    }
  }

  async function draftTick(): Promise<void> {
    const requested = await db.select().from(guestSends).where(eq(guestSends.status, "requested")).orderBy(asc(guestSends.createdAt)).limit(2);
    for (const s of requested) {
      const [claimed] = await db.update(guestSends).set({ status: "drafting", updatedAt: new Date() }).where(and(eq(guestSends.id, s.id), eq(guestSends.status, "requested"))).returning();
      if (claimed) await draftSend(claimed);
    }
  }

  /** Ferri's own proposals: the day-before reminder, and a nudge when people are waiting. Each once per event. */
  async function proposeTick(): Promise<void> {
    const now = Date.now();
    const live = await db.select().from(events).where(and(inArray(events.stage, ["launch", "live"]), isNotNull(events.startsAt)));
    for (const ev of live) {
      const start = ev.startsAt!.getTime();
      if (now > start) continue;
      const c = await guestCounts(db, ev.id);
      const propose = async (kind: SendKind, ask: string) => {
        const [row] = await db
          .insert(guestSends)
          .values({ communityId: ev.communityId, eventId: ev.id, kind, audience: "going", ask, status: "requested", requestedBy: "Ferri", origin: "ferri", autoKey: `${kind}:${ev.id}` })
          .onConflictDoNothing()
          .returning();
        if (row) log(`guests: proposing the ${SEND_KIND_LABEL[kind]} for ${ev.name}`);
      };
      // Spec 21: the event's reminder hours and nudge days (0 turns either off).
      const s = await loop.settings({ communityId: ev.communityId, eventId: ev.id });
      if (c.going && s.guestReminderHours > 0 && now >= start - s.guestReminderHours * 3600_000) await propose("reminder", "The day-before reminder: when and where, when the doors open, and what to bring.");
      if (c.going && c.waitlist && s.guestNudgeDays > 0 && now >= start - s.guestNudgeDays * 86400_000 && now < start - 6 * 3600_000) {
        await propose("nudge", `The event is full and ${plural(c.waitlist, "person is", "people are")} on the waitlist: ask everyone to confirm they're still coming, or free their spot.`);
      }
    }
  }

  // ── Email in: replies from guests, delivery events ────────────────────────

  /** An email to the guests' mailbox (events+<code>@...). True when it was for guests. */
  async function onEmail(email: ReceivedEmail, to: string[]): Promise<boolean> {
    const local = mailbox.split("@")[0]!;
    const domain = mailbox.split("@")[1]!;
    const code = to
      .map((a) => parseAddress(a)?.email ?? "")
      .map((e) => new RegExp(`^${local}\\+([a-z0-9]+)@${domain.replace(/\./g, "\\.")}$`, "i").exec(e)?.[1]?.toLowerCase())
      .find(Boolean);
    if (!code) return false;
    const [g] = await db.select().from(guests).where(eq(guests.code, code)).limit(1);
    if (!g) return true;
    const ev = await eventRow(g.eventId);
    const [last] = await db
      .select({ s: guestSends })
      .from(guestMails)
      .innerJoin(guestSends, eq(guestSends.id, guestMails.sendId))
      .where(eq(guestMails.guestId, g.id))
      .orderBy(desc(guestMails.sentAt))
      .limit(1);
    const theirs = (email.text ?? (email.html ?? "").replace(/<[^>]+>/g, " ")).trim();
    const { reading } = await readGuestReply({ choice: config.modelFast, eventName: ev?.name ?? "the event", ours: last?.s.text ?? null, theirs, name: g.name }).catch(() => ({ reading: null }));
    log(`guests: reply from ${g.name} <${g.email}>: ${reading?.want ?? "?"}`);
    if (reading?.want === "not_coming") await applyAnswer(g, "no", "a reply to our email");
    else if (reading?.want === "coming") await applyAnswer(g, "yes", "a reply to our email");
    if (ev && reading && reading.want !== "not_coming") {
      await say(ev.id, ev.communityId, `${g.name} replied about ${ev.name}: ${reading.summary}${reading.want === "question" ? ` Answer them at ${g.email}.` : ""}`);
    }
    return true;
  }

  /** Resend's delivery events for guest mail. True when the email was one of ours to a guest. */
  async function onDelivery(resendId: string, status: "delivered" | "bounced" | "complained"): Promise<boolean> {
    const [m] = await db.update(guestMails).set({ status }).where(eq(guestMails.resendId, resendId)).returning();
    if (!m) return false;
    if (status !== "delivered") log(`guests: email to ${m.email} ${status}`);
    return true;
  }

  // ── What the crew asks ─────────────────────────────────────────────────

  async function intent(input: { communityId: string; eventId: string | null; member: CrewMember; messageId: string; roomId: string | null; guests: NonNullable<CrewIntent["guests"]> }): Promise<string | null> {
    const g = input.guests;
    const [ev] = input.eventId ? await db.select().from(events).where(eq(events.id, input.eventId)).limit(1) : [];
    if (!ev) return "This room isn't attached to an event, so I don't know whose guests you mean.";
    if (g.action === "status") {
      const c = await guestCounts(db, ev.id);
      const waiting = await db.select().from(guests).where(and(eq(guests.eventId, ev.id), eq(guests.status, "waitlist"))).orderBy(asc(guests.registeredAt)).limit(5);
      const sync = Object.entries(ev.guestSync ?? {})
        .filter(([k]) => k !== "spots")
        .map(([k, v]) => `${k === "site" ? "the site" : k === "luma" ? "Luma" : k} ${v.ok ? formatWhen(new Date(v.at), "Asia/Kolkata") : `failed (${v.error})`}`);
      return `${ev.name}: ${countsLine(c, ev.capacity)}.${waiting.length ? ` Waitlist: ${waiting.map((w) => w.name).join(", ")}${c.waitlist > waiting.length ? ", ..." : ""}.` : ""}${sync.length ? ` Last sync: ${sync.join(", ")}.` : ""}`;
    }
    if (g.action === "sync") return syncEvent(ev);
    if (!mail) return "Email isn't set up yet (no RESEND_API_KEY), so I can't email the guests.";
    const when = parseWhen(g.when || null);
    const [s] = await db
      .insert(guestSends)
      .values({
        communityId: ev.communityId,
        eventId: ev.id,
        kind: g.action === "nudge" ? "nudge" : "reminder",
        audience: g.audience === "waitlist" ? "waitlist" : "going",
        ask: g.what,
        status: "drafting",
        scheduledAt: when,
        requestedBy: input.member.name,
        requestedById: input.member.id,
        origin: "chat",
        sourceMessageId: input.messageId,
      })
      .onConflictDoNothing()
      .returning();
    if (!s) return null;
    const ok = await draftSend(s, { roomId: input.roomId });
    return ok ? null : "I couldn't draft that email. Try again in a moment.";
  }

  const sendHooks: AnnounceHooks = { outcome: sendOutcome, expired: sendExpired };
  const spotHooks: AnnounceHooks = { outcome: spotOutcome, expired: spotExpired };

  // ── The tick ───────────────────────────────────────────────────────────

  let ticking = false;
  async function tick(): Promise<void> {
    if (ticking) return;
    ticking = true;
    try {
      // Syncs Desk asked for, then each live event every guestSyncMs.
      const asked = await db.select().from(events).where(isNotNull(events.guestSyncRequestedAt));
      for (const ev of asked) {
        await db.update(events).set({ guestSyncRequestedAt: null }).where(eq(events.id, ev.id));
        const line = await syncEvent(ev);
        log(`guests: sync from Desk: ${line}`);
      }
      const live = await db
        .select()
        .from(events)
        .where(and(inArray(events.stage, ["plan", "build", "launch", "live"]), or(isNotNull(events.lumaEventId), sql`exists (select 1 from builder_jobs b where b.event_id = ${events.id} and b.kind = 'site' and b.url is not null)`, sql`${config.siteUrlOverride ?? ""} <> ''`)));
      for (const ev of live) {
        if (Date.now() - (lastSync.get(ev.id) ?? 0) < config.guestSyncMs) continue;
        await syncEvent(ev).catch((err) => log(`guests: sync of ${ev.name} failed: ${(err as Error).message}`));
      }
      await rsvpTick();
      await offerTick();
      await spotTick();
      await proposeTick();
      await draftTick();
      await sendingTick();
    } catch (err) {
      log(`guests tick failed: ${(err as Error).message}`);
    } finally {
      ticking = false;
    }
  }

  /** A push to the leads about guests (a reply with a question), next to the crew-room line. */
  async function pushLeads(communityId: string, eventId: string, title: string, body: string): Promise<void> {
    const leads = (await loadCrew(db, communityId, eventId)).filter((c) => c.lead);
    await pushToUsers(db, await switchUsersForCrew(db, leads.map((c) => c.id)), { kind: "email", title, body: clip(body, 180), url: "/m", tag: `guests-${eventId}`, renotify: true, cardId: null });
  }

  return { tick, intent, sendHooks, spotHooks, onEmail, onDelivery, siteEvent, syncEvent, pushLeads, mailbox };
}

export type Guests = ReturnType<typeof createGuests>;
