import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, desc, eq, sql } from "drizzle-orm";
import { builderJobs, type Db, type SwitchMedia } from "@ferri/db";

// ── Ferri Builder (spec 11): a Claude Code agent that Switch runs ─────────

export type BuilderJob = typeof builderJobs.$inferSelect;
export type BuilderJobKind = "site" | "checklist" | "poster" | "other";

/** Where the Builder lives on this machine: its own folder, Claude home and the controller's env file. */
export function builderPaths(env: Record<string, string | undefined> = process.env) {
  const base = env.FERRI_BUILDER_HOME ?? path.join(os.homedir(), ".ferri");
  return {
    dir: env.FERRI_BUILDER_DIR ?? path.join(base, "builder"),
    claudeHome: path.join(base, "builder-claude-home"),
    envFile: path.join(base, "builder.env"),
  };
}

/** The Builder's registry name in Switch (`@builder`). */
export const builderName = (env: Record<string, string | undefined> = process.env) => env.FERRI_BUILDER_NAME ?? "builder";

export const jobRef = (job: Pick<BuilderJob, "number">) => `B${job.number}`;

/** `B3-event-site`: the job's folder under the Builder's `jobs/`. */
export function jobFolder(number: number, title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .slice(0, 5)
    .join("-");
  return `B${number}${slug ? `-${slug}` : ""}`;
}

/** "Job B3 done: ..." or "Job B3 stuck: ..." from the Builder (its CLAUDE.md asks for exactly this). */
export function parseBuilderReport(body: string): { ref: number; outcome: "done" | "stuck"; text: string } | null {
  const clean = body.replace(/^(?:\s*@[\w.-]+[,:]?\s*)+/, "").trim();
  const m = /^\**\s*job\s+b(\d+)\s+(done|stuck|finished|blocked)\s*\**\s*[:.\-–—]\s*([\s\S]*)$/i.exec(clean);
  if (!m) return null;
  const word = m[2]!.toLowerCase();
  return { ref: Number(m[1]), outcome: word === "done" || word === "finished" ? "done" : "stuck", text: m[3]!.trim() };
}

/**
 * The hand-off Ferri sends with `send_targeted_message`. Short on purpose: the
 * facts live in the room's Switch documents (Ferri's knowledge and the event
 * plan, attached to the crew room), which the Builder reads with
 * `load_internal_documents`, so the brief stays under a platform's post limit.
 */
export function handoffMessage(input: {
  job: Pick<BuilderJob, "number" | "title" | "brief" | "kind" | "requestedBy">;
  eventName: string | null;
  documents: string[];
  agentName: string;
}): string {
  const ref = jobRef(input.job);
  const folder = `jobs/${jobFolder(input.job.number, input.job.title)}/`;
  // Files attached to the request travel as an "Attached:" line, kept whole (the brief itself is clipped).
  const [ask, attached] = input.job.brief.split(ATTACHED_MARK);
  const lines = [
    `Job ${ref}: ${input.job.title}${input.eventName ? ` for ${input.eventName}` : ""}.`,
    `${input.job.requestedBy} asked: "${ask!.replace(/\s+/g, " ").trim().slice(0, 1200)}"`,
    attached ? `They attached ${attached.trim()}. Fetch each with download_attachment (its media id, from this room) and use it as they asked.` : "",
    "",
    input.documents.length
      ? `The facts are in this room's documents (${input.documents.map((d) => `"${d}"`).join(" and ")}); read them with load_internal_documents and use only what they say.`
      : "Use only facts from this room; leave a clear placeholder for anything missing.",
    `Work in ${folder}. When it is ready, post it here with send_attachment, then tell ${input.agentName} "Job ${ref} done:" with a line on what you made, or "Job ${ref} stuck:" with what you need.`,
    KIND_HINT[(input.job.kind as BuilderJobKind) ?? "other"] ?? "",
    "Nothing goes public (deploy, push, post, email) without a yes on a card first.",
  ];
  return lines.filter((l, i) => l || i === 3).join("\n");
}

const ATTACHED_MARK = "\nAttached: ";

/** A job brief with the files a crew member attached to the request (name and Switch media id). */
export function briefWithFiles(brief: string, files: SwitchMedia[]): string {
  if (!files.length) return brief;
  return `${brief}${ATTACHED_MARK}${files.map((f) => `${f.filename} (${f.mxc})`).join(", ")}`;
}

const KIND_HINT: Record<BuilderJobKind, string> = {
  site: "If this is the event's site with registration, sign-in or credits, or it should go live, call your ship-event-site skill with the Skill tool (even if you used it before; it may have changed) and follow it. A single page that stays here is one self-contained index.html: inline CSS, no scripts, mobile first, with what, when, where, the schedule, how to register and who to ask.",
  checklist: "Make it checklist.md with - [ ] items grouped as the week before, the day before, on the day and after, each with an owner where the plan names one.",
  poster:
    "Start by calling your make-posters skill with the Skill tool, even if you used it before (it may have changed), and follow it: background art plus the exact text, every size, posted here in one message. Write design.json fresh from this room's documents; reuse an earlier job's art or photo only when asked, never its text. Point the QR code at the event's site when there is one. Do not post them anywhere else; I ask the crew on a card before anything is shared outside.",
  other: "",
};

// ── Jobs ──────────────────────────────────────────────────────────────────

/** A new job with the next number (B1, B2, ...). A replayed crew message adds nothing. */
export async function createBuilderJob(
  db: Db,
  input: Omit<typeof builderJobs.$inferInsert, "number" | "id">,
): Promise<BuilderJob | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const [{ next }] = (await db
      .select({ next: sql<number>`coalesce(max(${builderJobs.number}), 0)::int + 1` })
      .from(builderJobs)
      .where(eq(builderJobs.communityId, input.communityId))) as [{ next: number }];
    const [job] = await db
      .insert(builderJobs)
      .values({ ...input, number: next, folder: jobFolder(next, input.title) })
      .onConflictDoNothing()
      .returning();
    if (job) return job;
    if (input.sourceMessageId) {
      const [seen] = await db.select().from(builderJobs).where(eq(builderJobs.sourceMessageId, input.sourceMessageId)).limit(1);
      if (seen) return null;
    }
  }
  throw new Error("could not number a new builder job");
}

export async function listBuilderJobs(db: Db, communityId: string, limit = 50): Promise<BuilderJob[]> {
  return db.select().from(builderJobs).where(eq(builderJobs.communityId, communityId)).orderBy(desc(builderJobs.number)).limit(limit);
}

export async function findBuilderJob(db: Db, communityId: string, number: number): Promise<BuilderJob | null> {
  const [job] = await db
    .select()
    .from(builderJobs)
    .where(and(eq(builderJobs.communityId, communityId), eq(builderJobs.number, number)))
    .limit(1);
  return job ?? null;
}

/** The files the Builder left in a job's folder (on this machine), newest first. */
export function jobFiles(job: Pick<BuilderJob, "folder">, dir = builderPaths().dir): { name: string; bytes: number; path: string }[] {
  if (!job.folder) return [];
  const folder = path.join(dir, "jobs", job.folder);
  if (!fs.existsSync(folder)) return [];
  const out: { name: string; bytes: number; path: string; at: number }[] = [];
  const walk = (d: string, rel: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const full = path.join(d, e.name);
      // A whole app (the event site from the kit): only its content is worth showing.
      if (e.isDirectory() && fs.existsSync(path.join(full, "package.json"))) {
        const content = path.join(full, "content", "event.json");
        if (fs.existsSync(content)) {
          const st = fs.statSync(content);
          out.push({ name: `${rel}${e.name}/content/event.json`, bytes: st.size, path: content, at: st.mtimeMs });
        }
        continue;
      }
      if (e.isDirectory()) walk(full, `${rel}${e.name}/`);
      else {
        const st = fs.statSync(full);
        out.push({ name: `${rel}${e.name}`, bytes: st.size, path: full, at: st.mtimeMs });
      }
    }
  };
  walk(folder, "");
  return out.sort((a, b) => b.at - a.at).slice(0, 50).map(({ name, bytes, path: p }) => ({ name, bytes, path: p }));
}

/** The first https link in a Builder report, without trailing punctuation: the live address. */
export function firstHttpsUrl(text: string): string | null {
  const m = /https:\/\/[^\s<>"'`)\]]+/i.exec(text);
  if (!m) return null;
  const url = m[0].replace(/[.,;:!?]+$/, "");
  try {
    const u = new URL(url);
    return /^(localhost|127\.|0\.0\.0\.0)/.test(u.hostname) ? null : url;
  } catch {
    return null;
  }
}

/**
 * What Ferri says in the crew room about an event the shipped site reported,
 * or null when it is not worth a message (every registration but the first
 * and each tenth).
 */
export function siteEventLine(type: string, p: Record<string, unknown>): string | null {
  const n = Number(p.count ?? 0);
  const name = typeof p.name === "string" && p.name.trim() ? p.name.trim() : null;
  if (type === "registration") {
    if (n === 1) return `First registration on the site${name ? `: ${name}` : ""}.`;
    if (n > 0 && n % 10 === 0) return `${n} people have registered on the site${name ? ` (latest: ${name})` : ""}.`;
    return null;
  }
  const sponsor = typeof p.sponsor === "string" && p.sponsor.trim() ? p.sponsor.trim() : "A sponsor's";
  const left = Number(p.left ?? 0);
  if (type === "pool_low") {
    return left > 0
      ? `${sponsor} credits are running low on the site: ${left} code${left === 1 ? "" : "s"} left. Paste more in the site's admin view.`
      : `${sponsor} credits are all claimed on the site. Paste more codes in the site's admin view.`;
  }
  if (type === "pool_refilled") return `${sponsor} credits are topped up on the site: ${left} code${left === 1 ? "" : "s"} left.`;
  return null;
}

// ── Files the Builder posts (spec 13) ─────────────────────────────────────

/** The attachments of a Switch message as media Ferri can keep and post again. */
export function mediaFromMessage(
  attachments: { filename?: string; mimetype?: string; size?: number; mxc?: string }[] | undefined,
  roomId: string,
  eventId: string | null,
): SwitchMedia[] {
  return (attachments ?? [])
    // Switch's media ids are `switch-media://...` (older servers: `mxc://...`).
    .filter((a) => typeof a.mxc === "string" && /^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(a.mxc))
    .map((a) => ({
      mxc: a.mxc!,
      filename: a.filename?.trim() || a.mxc!.split("/").pop() || "file",
      mimetype: a.mimetype ?? "application/octet-stream",
      size: typeof a.size === "number" ? a.size : null,
      roomId,
      eventId,
    }));
}

/** Add new media to what a job already has (the same file twice is kept once). */
export function mergeMedia(have: SwitchMedia[], add: SwitchMedia[]): SwitchMedia[] {
  const seen = new Set(have.map((m) => m.mxc));
  return [...have, ...add.filter((m) => !seen.has(m.mxc) && seen.add(m.mxc))];
}

/**
 * The image to share outside from a poster job: the square social card (it
 * fits every chat platform), else the 4:5 card, else the first image. The
 * JPEG before the PNG: a 1 MB PNG makes Switch's Telegram upload time out
 * (the photo lands, then a "couldn't be relayed" note follows it).
 */
export function shareImage(media: SwitchMedia[]): SwitchMedia | null {
  const images = media.filter((m) => m.mimetype.startsWith("image/") || /\.(png|jpe?g)$/i.test(m.filename));
  const named = (re: RegExp) => images.find((m) => re.test(m.filename) && /\.jpe?g$/i.test(m.filename)) ?? images.find((m) => re.test(m.filename));
  return named(/square/i) ?? named(/portrait/i) ?? images[0] ?? null;
}

/**
 * What Ferri asks its drafter for when a poster job is done: share it, with the
 * link. No date, time or venue: the poster shows them exactly, and a caption
 * that words them differently (the event's start vs "doors 9:00 AM") confuses.
 */
export function posterShareBrief(input: { eventName: string; url: string | null }): string {
  return (
    `Share the new ${input.eventName} poster (the image goes with this post). ` +
    (input.url ? `Invite everyone to register at ${input.url}.` : "Invite everyone to come.") +
    " One or two short lines. Do not repeat the date, time or venue: the poster shows them."
  );
}
