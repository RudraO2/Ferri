import fs from "node:fs";
import path from "node:path";
import { and, desc, eq, inArray, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
import { builderJobs, eventSpaces, events, siteEvents, spaces, type Db } from "@ferri/db";
import {
  builderName,
  builderPolicy,
  helpRooms,
  builderPaths,
  createAnnouncementRequest,
  listingAnnouncement,
  createBuilderJob,
  draftAnnouncement,
  voiceBlock,
  firstHttpsUrl,
  loadLiveKnowledge,
  mediaFromMessage,
  mergeMedia,
  posterShareBrief,
  shareImage,
  loadCrew,
  siteEventLine,
  findBuilderJob,
  findCommunity,
  handoffMessage,
  jobRef,
  parseBuilderReport,
  type BuilderJob,
  type BuilderJobKind,
} from "@ferri/knowledge";
import { pushToUsers, switchUsersForCrew } from "@ferri/push";
import { setRule } from "@ferri/shield";
import type { GatewayClient, MessageEvent, SwitchAgent } from "@ferri/switch";
import { config } from "./config.ts";
import type { Loop } from "./loop.ts";

export interface BuilderDeps {
  db: Db;
  agent: SwitchAgent;
  loop: Loop;
  gateway: GatewayClient | null;
  log: (msg: string) => void;
}

/** Ferri Builder as Switch's agent management reports it. */
export interface BuilderAgent {
  agentId: string;
  name: string;
  model: string | null;
  machine: { id: string; name: string; state: string } | null;
  /** "running", "stopped", "failed", ... from the machine's last status. */
  process: string | null;
}

export interface BuilderBudget {
  id: string;
  agent_id: string | null;
  metric: string;
  model: string;
  amount_limit: number;
  period_hours: number;
  spent: number;
  resets_at: string;
  exhausted: boolean;
}

interface ManagedAgent {
  agent_id: string;
  name: string;
  model: string | null;
  machine: { id: string; name: string; state: string } | null;
  actual: { process: string | null } | null;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Ferri Builder (spec 11): a Claude Code session that Switch runs on the
 * organizer's machine (a managed agent on a Switch agent controller). Ferri
 * hands it jobs in the crew room (`invite_agent_to_room`, then
 * `send_targeted_message`), records them in `builder_jobs`, and closes them
 * when the Builder reports "Job B<n> done:" or "stuck:". Switch itself shows
 * the Builder's activity cards and turns its permission prompts into approval
 * cards in the room.
 */
export function createBuilder(deps: BuilderDeps) {
  const { db, agent, loop, log } = deps;
  const name = builderName();
  let cached: { at: number; agent: BuilderAgent | null } = { at: 0, agent: null };
  /** Outreach (spec 15): a find-partners job's prospects go into contacts. */
  let prospectsHook: ((job: BuilderJob) => Promise<void>) | null = null;
  /** Care (spec 16): the hand-off text of a help job, and what its report means for the case. */
  let helpHooks: {
    handoff(job: BuilderJob): Promise<string | null>;
    report(job: BuilderJob, outcome: "done" | "stuck", text: string): Promise<void>;
  } | null = null;
  let policySig = "";
  /** RSVP (spec 17): what the shipped site says about one guest goes into the guest list. */
  let siteGuestHook: ((e: { communityId: string; type: string; payload: Record<string, unknown>; eventId: string | null }) => Promise<void>) | null = null;

  /**
   * The Builder's addressing policy: its owner and Ferri everywhere, and anyone
   * in a crew room or in a room where it is helping someone (spec 16). Written
   * whole each time (Switch has no read route), only when it changes.
   */
  async function syncPolicy(extraRoom?: string): Promise<void> {
    if (!deps.gateway) return;
    const b = await builder();
    if (!b) return;
    const crewRows = await db
      .selectDistinct({ room: spaces.switchRoomId })
      .from(eventSpaces)
      .innerJoin(spaces, eq(spaces.id, eventSpaces.spaceId))
      .where(eq(eventSpaces.role, "crew"));
    const help = await helpRooms(db);
    const policy = builderPolicy(crewRows.map((r) => r.room), extraRoom ? [...help, extraRoom] : help);
    const sig = JSON.stringify(policy);
    if (sig === policySig) return;
    await deps.gateway.call("PUT", `/gateway/agents/${b.agentId}/addressing-policy`, { policy });
    policySig = sig;
    const open = policy.rules[1] as { rooms?: string[] } | undefined;
    log(`builder: addressing policy now admits people in ${open?.rooms?.length ?? 0} room(s)`);
  }

  /** The Builder's id and state, from Switch's agent management (Ferri may manage its owner's agents). */
  let saidOff = false;
  async function builder(fresh = false): Promise<BuilderAgent | null> {
    if (!fresh && Date.now() - cached.at < 30_000) return cached.agent;
    try {
      const list = await agent.op<ManagedAgent[]>("list_managed_agents");
      const a = list.find((x) => x.name === name);
      cached = {
        at: Date.now(),
        agent: a ? { agentId: a.agent_id, name: a.name, model: a.model, machine: a.machine, process: a.actual?.process ?? null } : null,
      };
    } catch (err) {
      const message = (err as Error).message;
      // Not set up (Ferri may not manage agents yet): say so once, not every 30 seconds.
      const notSetUp = /not allowed to manage agents|HTTP 403/.test(message);
      if (!notSetUp) log(`builder: list_managed_agents failed: ${message}`);
      else if (!saidOff) log("builder: off (run `pnpm builder:setup` on the machine that will run it; docs/builder.md)");
      saidOff = saidOff || notSetUp;
      cached = { at: Date.now(), agent: cached.agent };
    }
    return cached.agent;
  }

  const ready = (b: BuilderAgent | null) => !!b && b.machine?.state === "online" && b.process === "running";

  /** The Builder's budgets in Switch with what it spent this period (admin Gateway session). */
  async function budget(agentId?: string): Promise<BuilderBudget[]> {
    if (!deps.gateway) return [];
    try {
      const id = agentId ?? (await builder())?.agentId;
      if (!id) return [];
      const tenant = await deps.gateway.call<{ id: string }>("GET", "/gateway/tenants/current");
      const all = await deps.gateway.call<BuilderBudget[]>("GET", `/gateway/tenants/${tenant.id}/budgets`);
      return all.filter((b) => b.agent_id === id || b.agent_id === null);
    } catch (err) {
      log(`builder: budget read failed: ${(err as Error).message}`);
      return [];
    }
  }

  /** "its 60 turns a day (back at 5:30 AM)" when a budget covering the Builder is spent, else null. */
  async function spent(): Promise<string | null> {
    const hit = (await budget()).filter((b) => b.exhausted).sort((a, b) => b.resets_at.localeCompare(a.resets_at))[0];
    if (!hit) return null;
    const at = new Date(hit.resets_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: process.env.TZ ?? "Asia/Kolkata" });
    return `its ${hit.amount_limit.toLocaleString("en-IN")} ${hit.metric.replace(/_/g, " ")} per ${hit.period_hours} h (back at ${at})`;
  }

  /** Names of the Switch documents attached to a room (Ferri's knowledge, the plan), for the brief. */
  async function roomDocuments(roomId: string): Promise<string[]> {
    if (!deps.gateway) return [];
    try {
      const out = await deps.gateway.call<unknown>("GET", `/gateway/rooms/${encodeURIComponent(roomId)}/documents`);
      const list = (Array.isArray(out) ? out : ((out as { documents?: unknown[] }).documents ?? [])) as { name?: string }[];
      return list.map((d) => d.name ?? "").filter(Boolean);
    } catch {
      return [];
    }
  }

  /** Hand a queued job to the Builder. False when it has to wait (machine offline, budget spent). */
  async function hand(job: BuilderJob): Promise<boolean> {
    const b = await builder(true);
    if (!ready(b)) return false;
    if (await spent()) return false;
    const roomId = job.roomId ?? (await loop.crewRoomFor(job.eventId));
    if (!roomId) {
      await db.update(builderJobs).set({ status: "failed", report: "No crew room to work in.", updatedAt: new Date() }).where(eq(builderJobs.id, job.id));
      return true;
    }
    // Claim it, so two ticks never hand the same job twice.
    const [claimed] = await db
      .update(builderJobs)
      .set({ status: "handed", roomId, handedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(builderJobs.id, job.id), eq(builderJobs.status, "queued")))
      .returning();
    if (!claimed) return true;
    try {
      // A help job (spec 16) works in a member's room: the people there may talk to the Builder while it helps.
      if (claimed.kind === "help") await syncPolicy(roomId);
      await agent.inviteAgentToRoom(roomId, name).catch((err: Error) => {
        if (!/already/i.test(err.message)) throw err;
      });
      const [ev] = job.eventId ? await db.select({ name: events.name }).from(events).where(eq(events.id, job.eventId)).limit(1) : [];
      const help = claimed.kind === "help" ? await helpHooks?.handoff(claimed) : null;
      const text =
        help ??
        handoffMessage({
          job: claimed,
          eventName: ev?.name ?? null,
          documents: await roomDocuments(roomId),
          agentName: config.agentName,
          cover: claimed.kind === "listing" ? await posterCover(claimed.eventId) : null,
        });
      const sent = await agent.sendTargetedMessage(roomId, text, [name]);
      const reach = sent.target_statuses?.[name];
      await db.update(builderJobs).set({ handoffEventId: sent.event_id, updatedAt: new Date() }).where(eq(builderJobs.id, job.id));
      if (reach === "not_permitted") {
        await db.update(builderJobs).set({ status: "failed", report: "The Builder's addressing policy does not admit Ferri." }).where(eq(builderJobs.id, job.id));
      }
      log(`builder: handed ${jobRef(claimed)} "${claimed.title}" (${reach ?? "?"})`);
    } catch (err) {
      log(`builder: hand-off of ${jobRef(claimed)} failed: ${(err as Error).message}`);
      await db.update(builderJobs).set({ status: "queued", handedAt: null, updatedAt: new Date() }).where(eq(builderJobs.id, job.id));
      return false;
    }
    return true;
  }

  /**
   * A crew member asked for something to be made. Their request is their
   * decision, so the job starts at once. Returns Ferri's one-line reply, or
   * null for a replayed message.
   */
  async function start(input: {
    communityId: string;
    eventId: string | null;
    kind: BuilderJobKind;
    title: string;
    brief: string;
    requestedBy: string;
    requestedById: string | null;
    origin: "chat" | "desk";
    sourceMessageId: string | null;
    roomId: string | null;
  }): Promise<string | null> {
    const r = await startJob(input);
    if (!r) return null;
    const { job, handed } = r;
    const ref = jobRef(job);
    if (!handed) {
      const used = await spent();
      return used
        ? `I've queued job ${ref} (${job.title}). The Builder has used ${used}, so I'll hand it over then.`
        : `I've queued job ${ref} (${job.title}), but the Builder's machine is offline. I'll hand it over as soon as it's back.`;
    }
    return `Handed to the Builder as job ${ref}: ${job.title}. It works right here, and it asks on a card before anything goes public.`;
  }

  /** Create a job and hand it over now if the Builder can take it. Null for a replayed message. */
  async function startJob(input: Parameters<typeof start>[0]): Promise<{ job: BuilderJob; handed: boolean } | null> {
    const job = await createBuilderJob(db, {
      communityId: input.communityId,
      eventId: input.eventId,
      kind: input.kind,
      title: clip(input.title.trim() || "Job", 80),
      brief: input.brief.trim(),
      requestedBy: input.requestedBy,
      requestedById: input.requestedById,
      origin: input.origin,
      sourceMessageId: input.sourceMessageId,
      roomId: input.roomId,
      status: "queued",
    });
    if (!job) return null;
    return { job, handed: await hand(job) };
  }

  /**
   * A message from an agent. True when it was the Builder's (Ferri never treats
   * an agent's message as a member question or crew chatter).
   */
  async function onAgentMessage(ev: MessageEvent): Promise<boolean> {
    const p = ev.payload;
    const b = await builder();
    const fromBuilder = (b && p.sender === b.agentId) || p.sender_name?.toLowerCase() === name;
    if (!fromBuilder) return false;
    const space = await findCommunity(db, config.community);
    // Files it posts for a job it is working on (posters, cards): kept on the job by their Switch media id.
    const media = mediaFromMessage(p.attachments, ev.room_id, p.message_id ?? null);
    if (media.length) await keepMedia(ev.room_id, media);
    const report = parseBuilderReport(p.body);
    if (report && space) {
      const job = await findBuilderJob(db, space.id, report.ref);
      if (!job) {
        log(`builder: report for unknown job B${report.ref}`);
        return true;
      }
      const url = report.outcome === "done" ? firstHttpsUrl(report.text) : null;
      const [updated] = await db
        .update(builderJobs)
        .set({ status: report.outcome, report: report.text, url: url ?? job.url, finishedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(builderJobs.id, job.id), inArray(builderJobs.status, ["handed", "working", "stuck", "done"])))
        .returning();
      if (!updated) return true;
      log(`builder: ${jobRef(job)} ${report.outcome}: ${clip(report.text, 160)}`);
      // A site the crew allowed to go live: Shield trusts its domain, and the crew gets the announcement on a card.
      if (url && job.kind === "site" && url !== job.url) await siteLive(updated, url);
      // A listing the crew allowed: Shield trusts the platform, and the crew gets the "is on Luma" card.
      if (url && job.kind === "listing" && url !== job.url) await listingLive(updated, url);
      if (report.outcome === "done" && job.kind === "outreach" && job.status !== "done") await prospectsHook?.(updated).catch((err: Error) => log(`builder: ${jobRef(job)} prospects failed: ${err.message}`));
      // Care: the Builder helped a member (or needs the crew); the case follows.
      if (job.kind === "help") await helpHooks?.report(updated, report.outcome, report.text).catch((err: Error) => log(`builder: ${jobRef(job)} case update failed: ${err.message}`));
      // Posters and cards: the crew decides on a card whether they go outside.
      if (report.outcome === "done" && job.kind === "poster" && job.status !== "done") await posterReady(updated);
      if (job.requestedById) {
        await pushToUsers(db, await switchUsersForCrew(db, [job.requestedById]), {
          kind: "builder",
          title: report.outcome === "done" ? `Builder finished ${jobRef(job)}` : `Builder needs you on ${jobRef(job)}`,
          body: clip(`${job.title}: ${report.text}`, 180),
          url: "/m",
          tag: `builder-${job.id}`,
          renotify: true,
          cardId: null,
        });
      }
      return true;
    }
    // Switch refused the hand-off because a budget is spent: back in the queue until it resets.
    if (/has reached its budget/i.test(p.body)) {
      const [last] = await db
        .select()
        .from(builderJobs)
        .where(and(eq(builderJobs.roomId, ev.room_id), eq(builderJobs.status, "handed")))
        .orderBy(desc(builderJobs.number))
        .limit(1);
      if (last) {
        await db.update(builderJobs).set({ status: "queued", handedAt: null, updatedAt: new Date() }).where(eq(builderJobs.id, last.id));
        log(`builder: ${jobRef(last)} back in the queue (budget spent)`);
      }
      return true;
    }
    // Any other message from the Builder where a job was handed: it is at work.
    const [handed] = await db
      .select()
      .from(builderJobs)
      .where(and(eq(builderJobs.roomId, ev.room_id), eq(builderJobs.status, "handed")))
      .orderBy(desc(builderJobs.number))
      .limit(1);
    if (handed) {
      await db.update(builderJobs).set({ status: "working", updatedAt: new Date() }).where(eq(builderJobs.id, handed.id));
    }
    return true;
  }

  /**
   * The Builder put a site live (the crew allowed the deploy on a card). Shield
   * allows its domain, and Ferri opens the "site is live" announcement card:
   * one OK posts it to every space of the event and saves the link as knowledge.
   */
  async function siteLive(job: BuilderJob, url: string): Promise<void> {
    try {
      const domain = await setRule(db, { communityId: job.communityId, kind: "allow", domain: new URL(url).hostname, note: `event site (${jobRef(job)})`, by: "Ferri Builder" });
      log(`builder: ${jobRef(job)} is live at ${url}; Shield allows ${domain}`);
    } catch (err) {
      log(`builder: could not allow ${url} in Shield: ${(err as Error).message}`);
    }
    if (!job.eventId) return;
    const [ev] = await db.select({ name: events.name }).from(events).where(eq(events.id, job.eventId)).limit(1);
    await createAnnouncementRequest(db, {
      communityId: job.communityId,
      eventId: job.eventId,
      title: `${ev?.name ?? "The event"} site is live`,
      text: `The ${ev?.name ?? "event"} site is live: ${url}\nRegister there, see the schedule, and once you're registered, claim the sponsor credits from your registration page.`,
      scheduledAt: null,
      targetSpaceIds: null,
      by: job.requestedBy,
      origin: "builder",
    });
    log(`builder: ${jobRef(job)} "site is live" announcement requested`);
  }

  /**
   * The event is listed on a platform (the crew allowed the submit on a card).
   * Shield allows the platform's domain, and Ferri opens the announcement card:
   * one OK tells every space and saves the link as knowledge.
   */
  async function listingLive(job: BuilderJob, url: string): Promise<void> {
    try {
      const domain = await setRule(db, { communityId: job.communityId, kind: "allow", domain: new URL(url).hostname, note: `event listing (${jobRef(job)})`, by: "Ferri Builder" });
      log(`builder: ${jobRef(job)} listed at ${url}; Shield allows ${domain}`);
    } catch (err) {
      log(`builder: could not allow ${url} in Shield: ${(err as Error).message}`);
    }
    if (!job.eventId) return;
    // The guest sync (spec 17) reads this listing's Guests tab: keep its Luma event id.
    const evt = lumaEventIdFor(job);
    if (evt) await db.update(events).set({ lumaEventId: evt }).where(eq(events.id, job.eventId));
    const [ev] = await db.select({ name: events.name }).from(events).where(eq(events.id, job.eventId)).limit(1);
    const post = listingAnnouncement({ eventName: ev?.name ?? "The event", url, site: await siteUrl(job.eventId) });
    await createAnnouncementRequest(db, {
      communityId: job.communityId,
      eventId: job.eventId,
      title: post.title,
      text: post.text,
      scheduledAt: null,
      targetSpaceIds: null,
      by: job.requestedBy,
      origin: "builder",
      reason: `the Builder listed the event (${jobRef(job)})`,
    });
    log(`builder: ${jobRef(job)} "${post.title}" announcement requested`);
  }

  /** `evt-...` of a Luma listing job, from its result.json (manage URL) on this machine. */
  function lumaEventIdFor(job: BuilderJob): string | null {
    if (!job.folder) return null;
    const file = path.join(builderPaths().dir, "jobs", job.folder, "result.json");
    try {
      const r = JSON.parse(fs.readFileSync(file, "utf8")) as { platform?: string; id?: string; manageUrl?: string };
      if (r.platform && r.platform !== "luma") return null;
      return /evt-[A-Za-z0-9]+/.exec(`${r.id ?? ""} ${r.manageUrl ?? ""}`)?.[0] ?? null;
    } catch {
      return null;
    }
  }

  /** The event's latest poster square card on this machine, as a path from the Builder's folder (a listing's cover). */
  async function posterCover(eventId: string | null): Promise<string | null> {
    if (!eventId) return null;
    const posters = await db
      .select()
      .from(builderJobs)
      .where(and(eq(builderJobs.eventId, eventId), eq(builderJobs.kind, "poster"), eq(builderJobs.status, "done")))
      .orderBy(desc(builderJobs.number))
      .limit(5);
    for (const p of posters) {
      const image = shareImage(p.media ?? []);
      if (!image || !p.folder) continue;
      const rel = `jobs/${p.folder}/out/${image.filename}`;
      if (fs.existsSync(path.join(builderPaths().dir, rel))) return rel;
    }
    return null;
  }

  /** The Builder posted files in a room: they belong to the job it is working on there. */
  async function keepMedia(roomId: string, media: ReturnType<typeof mediaFromMessage>): Promise<void> {
    const [job] = await db
      .select()
      .from(builderJobs)
      .where(and(eq(builderJobs.roomId, roomId), inArray(builderJobs.status, ["handed", "working"])))
      .orderBy(desc(builderJobs.number))
      .limit(1);
    if (!job) return;
    await db
      .update(builderJobs)
      .set({ media: mergeMedia(job.media ?? [], media), updatedAt: new Date() })
      .where(eq(builderJobs.id, job.id));
    log(`builder: ${jobRef(job)} posted ${media.map((m) => m.filename).join(", ")}`);
  }

  /**
   * A poster job is done: Ferri drafts a short post and opens the announcement
   * card with the square card attached. One OK posts the image and the text to
   * every space of the event; "Don't post" keeps it inside the crew room.
   */
  async function posterReady(job: BuilderJob): Promise<void> {
    const eventId = job.eventId;
    if (!eventId) return;
    // Switch delivers only messages addressed to Ferri, so the Builder's file post is read back from the room.
    const posted = await postedMedia(job);
    if (posted.length) {
      job = { ...job, media: mergeMedia(job.media ?? [], posted) };
      await db.update(builderJobs).set({ media: job.media, updatedAt: new Date() }).where(eq(builderJobs.id, job.id));
      log(`builder: ${jobRef(job)} posted ${posted.map((m) => m.filename).join(", ")}`);
    }
    const image = shareImage(job.media ?? []);
    if (!image) {
      log(`builder: ${jobRef(job)} is done, but it posted no image to share`);
      return;
    }
    const [ev] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
    const kb = await loadLiveKnowledge(db, config.community, { eventId: eventId });
    const site = job.url ?? (await siteUrl(eventId));
    const brief = posterShareBrief({ eventName: ev?.name ?? "event", url: site });
    let text = `${ev?.name ?? "The event"}: the poster is out.${site ? ` Register at ${site}` : ""}`;
    let title = `${ev?.name ?? "Event"} poster`;
    if (kb) {
      try {
        const voice = voiceBlock(await loop.settings({ communityId: job.communityId, eventId }));
        const { draft } = await draftAnnouncement({ choice: config.modelMain, kb, what: brief, sender: "Ferri Builder", voice });
        if (draft) {
          text = draft.text;
          title = draft.title;
        }
      } catch (err) {
        log(`builder: drafting the poster post failed: ${(err as Error).message}; using a plain line`);
      }
    }
    await createAnnouncementRequest(db, {
      communityId: job.communityId,
      eventId: eventId,
      title,
      text,
      scheduledAt: null,
      targetSpaceIds: null,
      by: job.requestedBy,
      origin: "builder",
      reason: `the Builder made the poster (${jobRef(job)})`,
      media: [image],
    });
    log(`builder: ${jobRef(job)} poster share card requested with ${image.filename}`);
  }

  /** Files the Builder posted in the job's room since the hand-off (`read_context` gives their media ids). */
  async function postedMedia(job: BuilderJob): Promise<ReturnType<typeof mediaFromMessage>> {
    if (!job.roomId) return [];
    interface Entry {
      id: string;
      sender: string;
      sender_name: string;
      attachments?: { filename?: string; mimetype?: string; size?: number; mxc?: string }[];
    }
    try {
      const b = await builder();
      const since = new Date((job.handedAt ?? job.createdAt).getTime() - 5_000).toISOString();
      const out = await agent.op<{ threads: { root: Entry; replies: Entry[] }[] }>("read_context", { room_id: job.roomId, since, limit: 100 });
      const mine = (e: Entry) => (b && e.sender.includes(b.agentId)) || e.sender_name?.toLowerCase() === name;
      return out.threads
        .flatMap((t) => [t.root, ...t.replies])
        .filter((e) => mine(e) && e.attachments?.length)
        .flatMap((e) => mediaFromMessage(e.attachments, job.roomId!, e.id));
    } catch (err) {
      log(`builder: reading ${jobRef(job)}'s files from the room failed: ${(err as Error).message}`);
      return [];
    }
  }

  /** The event's live site from an earlier site job, for the poster's post. */
  async function siteUrl(eventId: string): Promise<string | null> {
    const [site] = await db
      .select({ url: builderJobs.url })
      .from(builderJobs)
      .where(and(eq(builderJobs.eventId, eventId), eq(builderJobs.kind, "site"), isNotNull(builderJobs.url)))
      .orderBy(desc(builderJobs.number))
      .limit(1);
    return site?.url ?? null;
  }

  /** What the shipped site reported (registrations, credit pools): told to the crew in their room. */
  async function siteTick(): Promise<void> {
    const open = await db.select().from(siteEvents).where(isNull(siteEvents.handledAt)).orderBy(siteEvents.createdAt).limit(20);
    for (const e of open) {
      const [claimed] = await db
        .update(siteEvents)
        .set({ handledAt: new Date() })
        .where(and(eq(siteEvents.id, e.id), isNull(siteEvents.handledAt)))
        .returning();
      if (!claimed) continue;
      const [job] = e.jobId ? await db.select().from(builderJobs).where(eq(builderJobs.id, e.jobId)).limit(1) : [];
      // The same registration count twice (a double submit): the crew heard it already.
      if (e.type === "registration") {
        const [seen] = await db
          .select({ id: siteEvents.id })
          .from(siteEvents)
          .where(
            and(
              eq(siteEvents.site, e.site),
              eq(siteEvents.type, "registration"),
              ne(siteEvents.id, e.id),
              isNotNull(siteEvents.handledAt),
              sql`(${siteEvents.payload}->>'count')::int >= ${Number(e.payload.count ?? 0)}`,
              lt(siteEvents.createdAt, e.createdAt),
            ),
          )
          .limit(1);
        if (seen) continue;
      }
      await siteGuestHook?.({ communityId: e.communityId, type: e.type, payload: e.payload, eventId: job?.eventId ?? null }).catch((err: Error) => log(`site ${e.site}: guest update failed: ${err.message}`));
      const line = siteEventLine(e.type, e.payload);
      if (!line) continue;
      const roomId = await loop.crewRoomFor(job?.eventId ?? null);
      if (!roomId) {
        log(`site ${e.site}: ${e.type}, but no crew room to tell`);
        continue;
      }
      await loop.post(e.communityId, roomId, line);
      log(`site ${e.site}: ${e.type} told to the crew`);
      if (e.type === "pool_low") {
        const leads = (await loadCrew(db, e.communityId, job?.eventId ?? null)).filter((c) => c.lead);
        await pushToUsers(db, await switchUsersForCrew(db, leads.map((c) => c.id)), {
          kind: "builder",
          title: "Sponsor credits running low",
          body: clip(line, 180),
          url: "/m",
          tag: `site-pool-${String(e.payload.sponsor ?? "")}`,
          renotify: true,
          cardId: null,
        });
      }
    }
  }

  /** Jobs Desk queued (or that waited for the machine), and Desk cancellations. */
  async function tick(): Promise<void> {
    try {
      const queued = await db.select().from(builderJobs).where(eq(builderJobs.status, "queued")).orderBy(builderJobs.number).limit(5);
      for (const job of queued) if (!(await hand(job))) break;
      // Cancelled in Desk while the Builder had it: tell it to stop, once.
      const cancelled = await db
        .select()
        .from(builderJobs)
        .where(and(eq(builderJobs.status, "cancelled"), isNull(builderJobs.finishedAt)));
      for (const job of cancelled) {
        await db.update(builderJobs).set({ finishedAt: new Date(), updatedAt: new Date() }).where(eq(builderJobs.id, job.id));
        if (job.roomId && job.handedAt) {
          await agent
            .sendTargetedMessage(job.roomId, `Job ${jobRef(job)} is cancelled by ${job.report ?? "the crew"}. Please stop working on it and don't post it.`, [name])
            .catch((err: Error) => log(`builder: cancel of ${jobRef(job)} failed: ${err.message}`));
        }
      }
      await siteTick();
    } catch (err) {
      log(`builder tick failed: ${(err as Error).message}`);
    }
  }

  return {
    builder,
    budget,
    start,
    startJob,
    spent,
    onAgentMessage,
    tick,
    name,
    setProspectsHook: (h: (job: BuilderJob) => Promise<void>) => {
      prospectsHook = h;
    },
    setHelpHooks: (h: NonNullable<typeof helpHooks>) => {
      helpHooks = h;
    },
    setSiteGuestHook: (h: NonNullable<typeof siteGuestHook>) => {
      siteGuestHook = h;
    },
    syncPolicy,
    ready: async () => ready(await builder()),
  };
}

export type Builder = ReturnType<typeof createBuilder>;
