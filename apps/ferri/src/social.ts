import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, like } from "drizzle-orm";
import { agentState, builderJobs, cards, events, socialPosts, type Db } from "@ferri/db";
import {
  CARD_QUESTION_ID,
  CARD_SESSION,
  CARD_SKIP_OPTION,
  approvers,
  builderPaths,
  draftSocialPosts,
  fitSocialText,
  loadCrew,
  loadLiveKnowledge,
  mention,
  servicesFrom,
  shareImage,
  socialCardPrompt,
  socialName,
  switchExpiry,
  voiceBlock,
} from "@ferri/knowledge";
import { BufferError, MEDIA_HOST_OFF, MediaHost, bufferFromEnv, mediaHostFromEnv, type BufferChannel } from "@ferri/social";
import type { SwitchAgent } from "@ferri/switch";
import { config } from "./config.ts";
import type { CrewAsk } from "./crew-ask.ts";
import type { AnnounceHooks, Loop, RoomInfo } from "./loop.ts";
import type { Prompts } from "./prompts.ts";

type CardRow = typeof cards.$inferSelect;
type PostRow = typeof socialPosts.$inferSelect;

export interface SocialDeps {
  db: Db;
  agent: SwitchAgent;
  loop: Loop;
  prompts: Prompts;
  room: (roomId: string) => Promise<RoomInfo>;
  log: (msg: string) => void;
}

/** Card options. A written answer is the crew's own text for every network. */
export const SOCIAL_POST = "post";
export const SOCIAL_DRAFTS = "drafts";

/** What Desk asks for (stored in agent_state as `social_request:<id>`), for Ferri's tick. */
export interface SocialRequest {
  communityId: string;
  eventId: string | null;
  what: string;
  networks: string[];
  image: "poster" | "none";
  when: string;
  by: string;
}

/** A post time from the intent: now up to two years ahead (announcements stop at 60 days; social drafts may be far off). */
function whenFor(iso: string): Date | null {
  if (!iso.trim()) return null;
  const d = new Date(iso.trim());
  const t = d.getTime() - Date.now();
  return Number.isNaN(t) || t < -2 * 60_000 || t > 730 * 86400_000 ? null : d;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
/** A post that no longer needs its image on the media host. */
const DONE = new Set(["sent", "failed", "dismissed", "expired", "deleted"]);

/**
 * Social posting (spec 18): LinkedIn, X and Instagram through Buffer. One
 * `social` card per post with every network's text and the image; one OK
 * posts it (or saves Buffer drafts). Images go to Ferri's media host (a
 * Cloudflare Worker with KV) because Buffer fetches them by URL when the post
 * goes out, and Ferri deletes them once every post that uses them is done.
 */
export function createSocial(deps: SocialDeps) {
  const { db, agent, loop, log } = deps;
  const buffer = bufferFromEnv();
  const media = mediaHostFromEnv();
  let channelCache: { at: number; list: BufferChannel[] } | null = null;

  async function channels(): Promise<BufferChannel[]> {
    if (!buffer) return [];
    if (channelCache && Date.now() - channelCache.at < 5 * 60_000) return channelCache.list;
    const all = (await buffer.allChannels()).filter((c) => !c.isDisconnected && !c.isLocked);
    channelCache = { at: Date.now(), list: all };
    return all;
  }

  async function eventRow(eventId: string | null) {
    if (!eventId) return null;
    const [e] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
    return e ?? null;
  }

  /** The event's poster square card, from the Builder's folder. */
  async function posterImage(eventId: string | null): Promise<{ bytes: Uint8Array; mimetype: string; ext: string } | null> {
    if (!eventId) return null;
    const jobs = await db
      .select()
      .from(builderJobs)
      .where(and(eq(builderJobs.eventId, eventId), eq(builderJobs.kind, "poster"), eq(builderJobs.status, "done")))
      .orderBy(desc(builderJobs.number))
      .limit(5);
    for (const j of jobs) {
      const img = shareImage(j.media ?? []);
      if (!img || !j.folder) continue;
      const file = path.join(builderPaths().dir, "jobs", j.folder, "out", img.filename);
      if (!fs.existsSync(file)) continue;
      const ext = path.extname(img.filename).slice(1).toLowerCase() || "jpg";
      return { bytes: new Uint8Array(fs.readFileSync(file)), mimetype: img.mimetype || "image/jpeg", ext };
    }
    return null;
  }

  async function siteLink(eventId: string | null): Promise<string | null> {
    if (!eventId) return null;
    const [j] = await db
      .select({ url: builderJobs.url })
      .from(builderJobs)
      .where(and(eq(builderJobs.eventId, eventId), eq(builderJobs.kind, "site"), isNotNull(builderJobs.url)))
      .orderBy(desc(builderJobs.number))
      .limit(1);
    return j?.url ?? null;
  }

  /** Draft the posts and open the card. Returns what to tell the crew member. */
  async function propose(input: {
    communityId: string;
    eventId: string | null;
    what: string;
    networks: string[];
    image: "poster" | "none";
    when: string;
    by: string;
    origin: "chat" | "desk";
    sourceMessageId: string | null;
  }): Promise<string> {
    if (!buffer) return "Social posting is off: there is no BUFFER_API_KEY in Ferri's .env.";
    const crewRoomId = await loop.crewRoomFor(input.eventId);
    if (!crewRoomId) return "This event has no crew room, so there is nowhere to put the approval card.";
    if (input.sourceMessageId) {
      const [seen] = await db.select({ id: socialPosts.id }).from(socialPosts).where(eq(socialPosts.sourceMessageId, input.sourceMessageId)).limit(1);
      if (seen) return "";
    }
    let chans: BufferChannel[];
    try {
      chans = await channels();
    } catch (err) {
      return `I could not reach Buffer: ${(err as Error).message}`;
    }
    const wanted = servicesFrom(input.networks);
    const picked = chans.filter((c) => ["linkedin", "twitter", "instagram"].includes(c.service) && (!wanted.length || wanted.includes(c.service as never)));
    if (!picked.length) return `Buffer has no connected ${wanted.length ? list(wanted.map(socialName)) : "LinkedIn, X or Instagram"} channel. Connect one in Buffer first.`;

    const skipped: string[] = [];
    let image: { key: string; url: string } | null = null;
    if (input.image === "poster") {
      const poster = await posterImage(input.eventId);
      if (!poster) skipped.push("the poster (no finished poster job for this event)");
      else if (!media) skipped.push(`the poster (${MEDIA_HOST_OFF})`);
      else {
        const key = MediaHost.newKey(poster.ext);
        try {
          image = { key, url: await media.put(key, poster.bytes, poster.mimetype, 60) };
          log(`social: poster uploaded to the media host (${poster.bytes.byteLength} bytes)`);
        } catch (err) {
          skipped.push(`the poster (${(err as Error).message})`);
        }
      }
    }
    const targets = picked.filter((c) => {
      if (c.service === "instagram" && !image) {
        skipped.push(`Instagram (${c.name}): Instagram needs an image`);
        return false;
      }
      return true;
    });
    if (!targets.length) return `Nothing to post: ${skipped.join("; ")}.`;

    const kb = await loadLiveKnowledge(db, config.community, { eventId: input.eventId });
    if (!kb) return "No knowledge loaded.";
    const voice = voiceBlock(await deps.prompts.settings({ communityId: input.communityId, eventId: input.eventId, spaceId: null }));
    const link = await siteLink(input.eventId);
    const { draft } = await draftSocialPosts({ choice: config.modelMain, kb, what: input.what, link, withImage: !!image, sender: input.by, voice });
    if (!draft) {
      if (image && media) await media.delete(image.key).catch(() => {});
      return "I could not draft those posts. Try saying it again in other words.";
    }
    const dueAt = whenFor(input.when);
    if (input.when.trim() && !dueAt) {
      if (image && media) await media.delete(image.key).catch(() => {});
      return `I could not tell when to post it (${input.when}). Say a date and time from now up to two years ahead.`;
    }
    const tz = kb.community.timezone;
    const ev = await eventRow(input.eventId);
    const cardId = randomUUID();
    const rows = targets.map((c) => ({
      communityId: input.communityId,
      eventId: input.eventId,
      cardId,
      service: c.service,
      channelId: c.id,
      channelName: c.displayName || c.name,
      text: draft[c.service as "linkedin" | "twitter" | "instagram"],
      imageKey: image?.key ?? null,
      imageUrl: image?.url ?? null,
      dueAt,
      status: "waiting",
      ask: input.what,
      requestedBy: input.by,
      origin: input.origin,
      sourceMessageId: input.sourceMessageId,
    }));
    await db.insert(socialPosts).values(rows);

    const crew = await loadCrew(db, input.communityId, input.eventId);
    const route = approvers(crew);
    const times = await loop.ladderFor(input.communityId, ev ? { id: ev.id, stage: ev.stage, endsAt: ev.endsAt } : null);
    const where = list(targets.map((c) => socialName(c.service)));
    await db.insert(cards).values({
      id: cardId,
      communityId: input.communityId,
      eventId: input.eventId,
      crewRoomId,
      switchSessionId: CARD_SESSION,
      kind: "social",
      topic: "social",
      question: draft.title,
      ownerIds: route.owners.map((o) => o.id),
      payload: { imageKey: image?.key ?? null, imageUrl: image?.url ?? null, link, dueAt: dueAt?.toISOString() ?? null },
      ...times,
    });
    try {
      await agent.openQuestionsCard(CARD_SESSION, {
        request_id: cardId,
        turn_id: cardId,
        title: `Social post · ${where} · “${draft.title}”`,
        detail: "Nothing is posted until someone on the crew says so. These are the crew's real accounts.",
        questions: [
          {
            id: CARD_QUESTION_ID,
            title: `Post this on ${where}?`,
            prompt: socialCardPrompt({ posts: rows, imageUrl: image?.url ?? null, dueAt, timeZone: tz, skipped }),
            options: [
              { id: SOCIAL_POST, label: dueAt ? "Schedule it" : "Post it", description: null },
              { id: SOCIAL_DRAFTS, label: "Save as Buffer drafts", description: null },
              { id: CARD_SKIP_OPTION, label: "Don't post", description: null },
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
      await db.update(cards).set({ status: "closed", updatedAt: new Date() }).where(eq(cards.id, cardId));
      await db.update(socialPosts).set({ status: "failed", error: "the card could not be opened", updatedAt: new Date() }).where(eq(socialPosts.cardId, cardId));
      if (image && media) await media.delete(image.key).catch(() => {});
      return `Opening the card failed: ${(err as Error).message}`;
    }
    const { platform } = await deps.room(crewRoomId);
    const who = route.owners.map((o) => mention(o, platform)).join(" ") || "Crew";
    await loop.post(input.communityId, crewRoomId, `${who}, a social post needs your OK: “${draft.title}” on ${where}. It's on the card in this room.`);
    const [opened] = await db.select().from(cards).where(eq(cards.id, cardId)).limit(1);
    if (opened) loop.pocketNotify("open", opened, route.owners.map((o) => o.id), { roomName: where });
    log(`social: card ${cardId} for ${targets.length} channel(s) "${draft.title}"${image ? " with the poster" : ""}`);
    return "";
  }

  async function intent(ask: CrewAsk): Promise<string | null> {
    const s = ask.intent.social;
    if (s.action === "status") {
      const rows = await db.select().from(socialPosts).where(eq(socialPosts.communityId, ask.communityId)).orderBy(desc(socialPosts.createdAt)).limit(12);
      if (!rows.length) return "Nothing has gone to social media through me yet.";
      return `Recent social posts:\n${rows.map((r) => `- ${socialName(r.service)} (${r.channelName}): ${r.status}${r.dueAt ? `, ${r.dueAt.toISOString().slice(0, 16).replace("T", " ")} UTC` : ""} · “${r.text.slice(0, 70)}${r.text.length > 70 ? "…" : ""}”`).join("\n")}`;
    }
    const reply = await propose({
      communityId: ask.communityId,
      eventId: ask.eventId,
      what: s.what || ask.body,
      networks: s.networks,
      image: s.image,
      when: s.when,
      by: ask.member.name,
      origin: "chat",
      sourceMessageId: ask.messageId,
    });
    return reply || null;
  }

  async function postsOf(cardId: string): Promise<PostRow[]> {
    return db.select().from(socialPosts).where(eq(socialPosts.cardId, cardId));
  }

  /** Send the approved posts to Buffer: posted now, scheduled, or saved as drafts. */
  async function send(card: CardRow, how: "post" | "drafts", by: string, written: string | null): Promise<void> {
    if (!buffer) return;
    const rows = (await postsOf(card.id)).filter((r) => r.status === "waiting");
    const link = (card.payload?.link as string | null) ?? null;
    const done: string[] = [];
    const failed: string[] = [];
    for (const r of rows) {
      const text = written ? fitSocialText(r.service, written, link) : r.text;
      try {
        const when = how === "drafts" ? { mode: "draft" as const, dueAt: r.dueAt } : r.dueAt ? { mode: "at" as const, dueAt: r.dueAt } : { mode: "now" as const };
        const p = await buffer.createPost({ channelId: r.channelId, service: r.service, text, imageUrl: r.imageUrl, imageAlt: card.question, when });
        const status = how === "drafts" ? "draft" : p.status === "sent" ? "sent" : "scheduled";
        await db.update(socialPosts).set({ text, status, bufferPostId: p.id, sentAt: status === "sent" ? new Date() : null, error: null, updatedAt: new Date() }).where(eq(socialPosts.id, r.id));
        done.push(socialName(r.service));
      } catch (err) {
        const msg = err instanceof BufferError ? err.message : (err as Error).message;
        await db.update(socialPosts).set({ text, status: "failed", error: msg.slice(0, 500), updatedAt: new Date() }).where(eq(socialPosts.id, r.id));
        failed.push(`${socialName(r.service)} (${msg.slice(0, 120)})`);
      }
    }
    const what =
      how === "drafts"
        ? `Saved ${plural(done.length, "draft", "drafts")} in Buffer for ${list(done)}, approved by ${by}. Nothing is posted; finish or delete them in Buffer (or Desk › Social).`
        : rows[0]?.dueAt
          ? `Scheduled on ${list(done)} through Buffer, approved by ${by}.`
          : `Posted on ${list(done)} through Buffer, approved by ${by}.`;
    await loop.post(card.communityId, card.crewRoomId, `${done.length ? what : ""}${failed.length ? `${done.length ? " " : ""}Could not post on ${failed.join("; ")}.` : ""}`);
    log(`social: card ${card.id} ${how} by ${by}: ${done.length} ok, ${failed.length} failed`);
  }

  async function settle(card: CardRow, status: "dismissed" | "expired"): Promise<void> {
    await db.update(socialPosts).set({ status, updatedAt: new Date() }).where(and(eq(socialPosts.cardId, card.id), eq(socialPosts.status, "waiting")));
    await cleanImages();
  }

  const hooks: AnnounceHooks = {
    async outcome(card, answer, by) {
      const skip = answer.selected.includes(CARD_SKIP_OPTION) && !answer.written;
      const claimed = await loop.claim(card.id, { status: skip ? "dismissed" : "answered", answeredAt: new Date(), answeredBy: by, answeredVia: "card", answerText: answer.written });
      if (!claimed) return;
      loop.pocketSettled(claimed, skip ? "dismissed" : "answered", by);
      if (skip) {
        await settle(claimed, "dismissed");
        await loop.post(card.communityId, card.crewRoomId, `Okay ${by}, I won't post “${card.question}” on social media.`);
        return;
      }
      await send(claimed, answer.selected.includes(SOCIAL_DRAFTS) ? "drafts" : "post", by, answer.written);
      await cleanImages();
    },
    async expired(card) {
      await settle(card, "expired");
      await loop.post(card.communityId, card.crewRoomId, `Nobody approved the social post “${card.question}” in time, so nothing was posted.`);
    },
  };

  /** Images nobody needs any more come off the media host; scheduled posts that went out are marked sent. */
  async function cleanImages(): Promise<void> {
    if (!media) return;
    const rows = await db.select().from(socialPosts).where(isNotNull(socialPosts.imageKey));
    const byKey = new Map<string, PostRow[]>();
    for (const r of rows) byKey.set(r.imageKey!, [...(byKey.get(r.imageKey!) ?? []), r]);
    for (const [key, posts] of byKey) {
      if (!posts.every((p) => DONE.has(p.status))) continue;
      try {
        await media.delete(key);
        await db.update(socialPosts).set({ imageKey: null, updatedAt: new Date() }).where(eq(socialPosts.imageKey, key));
        log(`social: image removed from the media host (${posts.length} post(s) done)`);
      } catch (err) {
        log(`social: removing an image failed: ${(err as Error).message}`);
      }
    }
  }

  /** Follow posts in Buffer: scheduled ones that went out, drafts or posts deleted in Buffer, deletes asked in Desk. */
  async function follow(): Promise<void> {
    if (!buffer) return;
    const live = await db.select().from(socialPosts).where(and(isNotNull(socialPosts.bufferPostId), inArray(socialPosts.status, ["draft", "scheduled"])));
    for (const r of live) {
      try {
        if (r.deleteRequestedAt) {
          await buffer.deletePost(r.bufferPostId!).catch((err) => {
            if (!(err instanceof BufferError && /not found/i.test(err.message))) throw err;
          });
          await db.update(socialPosts).set({ status: "deleted", updatedAt: new Date() }).where(eq(socialPosts.id, r.id));
          log(`social: ${socialName(r.service)} ${r.status} deleted in Buffer (asked in Desk)`);
          continue;
        }
        const p = await buffer.getPost(r.bufferPostId!);
        if (p.status === "sent") await db.update(socialPosts).set({ status: "sent", sentAt: new Date(), updatedAt: new Date() }).where(eq(socialPosts.id, r.id));
      } catch (err) {
        if (err instanceof BufferError && err.code === "NOT_FOUND") {
          await db.update(socialPosts).set({ status: "deleted", updatedAt: new Date() }).where(eq(socialPosts.id, r.id));
        } else log(`social: following ${r.bufferPostId} failed: ${(err as Error).message}`);
      }
    }
  }

  let ticking = false;
  let lastFollow = 0;
  async function tick(): Promise<void> {
    if (ticking || !buffer) return;
    ticking = true;
    try {
      // Posts Desk asked for.
      const reqs = await db.select().from(agentState).where(like(agentState.key, "social_request:%"));
      for (const r of reqs) {
        const gone = await db.delete(agentState).where(eq(agentState.key, r.key)).returning();
        if (!gone.length) continue;
        const q = r.value as SocialRequest;
        const reply = await propose({ ...q, origin: "desk", sourceMessageId: r.key });
        if (reply) {
          const roomId = await loop.crewRoomFor(q.eventId);
          if (roomId) await loop.post(q.communityId, roomId, `Desk asked for a social post (${q.by}): ${reply}`);
        }
      }
      const askedDelete = await db.select({ id: socialPosts.id }).from(socialPosts).where(and(isNotNull(socialPosts.deleteRequestedAt), inArray(socialPosts.status, ["draft", "scheduled"]))).limit(1);
      if (askedDelete.length || Date.now() - lastFollow > 120_000) {
        lastFollow = Date.now();
        await follow();
        await cleanImages();
      }
    } catch (err) {
      log(`social tick failed: ${(err as Error).message}`);
    } finally {
      ticking = false;
    }
  }

  return { intent, tick, hooks, propose, channels, enabled: !!buffer, mediaEnabled: !!media };
}

export type Social = ReturnType<typeof createSocial>;
