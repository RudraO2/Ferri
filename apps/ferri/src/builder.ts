import { and, desc, eq, inArray, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
import { builderJobs, events, siteEvents, type Db } from "@ferri/db";
import {
  builderName,
  createAnnouncementRequest,
  createBuilderJob,
  firstHttpsUrl,
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

  /** The Builder's id and state, from Switch's agent management (Ferri may manage its owner's agents). */
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
      log(`builder: list_managed_agents failed: ${(err as Error).message}`);
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
      await agent.inviteAgentToRoom(roomId, name).catch((err: Error) => {
        if (!/already/i.test(err.message)) throw err;
      });
      const [ev] = job.eventId ? await db.select({ name: events.name }).from(events).where(eq(events.id, job.eventId)).limit(1) : [];
      const text = handoffMessage({
        job: claimed,
        eventName: ev?.name ?? null,
        documents: await roomDocuments(roomId),
        agentName: config.agentName,
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
    const handed = await hand(job);
    const ref = jobRef(job);
    if (!handed) {
      const used = await spent();
      return used
        ? `I've queued job ${ref} (${job.title}). The Builder has used ${used}, so I'll hand it over then.`
        : `I've queued job ${ref} (${job.title}), but the Builder's machine is offline. I'll hand it over as soon as it's back.`;
    }
    return `Handed to the Builder as job ${ref}: ${job.title}. It works right here, and it asks on a card before anything goes public.`;
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

  return { builder, budget, start, onAgentMessage, tick, name };
}

export type Builder = ReturnType<typeof createBuilder>;
