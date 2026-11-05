import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { and, eq, isNull, notInArray } from "drizzle-orm";
import { communities, crewMembers, events, knowledgeEntries, knowledgeRevisions, type Db } from "@ferri/db";
import { parseKnowledgeMarkdown, slugify } from "./markdown.js";
import { TOPICS } from "./triage.js";

const STAGES = ["plan", "build", "launch", "live", "wrap"] as const;
type Stage = (typeof STAGES)[number];

export interface SeedReport {
  communityId: string;
  communitySlug: string;
  events: string[];
  crew: number;
  created: number;
  updated: number;
  restored: number;
  archived: number;
  unchanged: number;
}

interface DesiredEntry {
  key: string;
  eventId: string | null;
  sourceRef: string;
  sourceTitle: string;
  heading: string;
  body: string;
  tags: string[];
  position: number;
}

function readYaml(file: string): Record<string, unknown> {
  const parsed = YAML.parse(fs.readFileSync(file, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object") throw new Error(`${file}: expected a YAML mapping`);
  return parsed as Record<string, unknown>;
}

function str(v: unknown, what: string): string {
  if (typeof v !== "string" || !v.trim()) throw new Error(`missing ${what}`);
  return v.trim();
}

function optDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new Error(`bad date: ${String(v)}`);
  return d;
}

function markdownFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...markdownFiles(full));
    else if (entry.name.toLowerCase().endsWith(".md")) out.push(full);
  }
  return out.sort();
}

const posix = (p: string) => p.split(path.sep).join("/");

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Replace the crew of one event (or of the community when eventId is null)
 * with the `crew:` list of a YAML file. Returns how many members it holds.
 */
async function syncCrew(
  tx: Tx,
  communityId: string,
  eventId: string | null,
  scope: string,
  list: unknown,
  file: string,
): Promise<number> {
  const items = Array.isArray(list) ? list : [];
  const keys: string[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") throw new Error(`${file}: each crew entry must be a mapping`);
    const c = raw as Record<string, unknown>;
    const name = str(c.name, `${file} crew name`);
    const topics = Array.isArray(c.topics) ? c.topics.map(String) : [];
    for (const t of topics) {
      if (!(TOPICS as readonly string[]).includes(t)) throw new Error(`${file}: unknown topic "${t}" (use ${TOPICS.join(", ")})`);
    }
    const handles: Record<string, string> = {};
    if (c.handles && typeof c.handles === "object") {
      for (const [platform, handle] of Object.entries(c.handles as Record<string, unknown>)) {
        handles[platform.toLowerCase()] = String(handle).replace(/^@/, "");
      }
    }
    const values = {
      communityId,
      eventId,
      key: `${scope}/${slugify(name)}`,
      name,
      handles,
      topics,
      lead: c.lead === true,
      onDuty: c.on_duty === true,
    };
    keys.push(values.key);
    await tx
      .insert(crewMembers)
      .values(values)
      .onConflictDoUpdate({ target: [crewMembers.communityId, crewMembers.key], set: { ...values, updatedAt: new Date() } });
  }
  const scopeWhere = and(
    eq(crewMembers.communityId, communityId),
    eventId ? eq(crewMembers.eventId, eventId) : isNull(crewMembers.eventId),
  );
  await tx.delete(crewMembers).where(keys.length ? and(scopeWhere, notInArray(crewMembers.key, keys)) : scopeWhere);
  return keys.length;
}

function sameTags(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

/**
 * Load a seed directory (community.yaml, knowledge/, events/<slug>/) into the
 * database. Idempotent: unchanged sections are left alone, a changed section
 * gets a new version and a revision row, a removed section is archived.
 */
export async function seedFromDirectory(db: Db, dir: string, editedBy = "seed"): Promise<SeedReport> {
  const root = path.resolve(dir);
  const c = readYaml(path.join(root, "community.yaml"));
  const slug = str(c.slug, "community slug");

  return db.transaction(async (tx) => {
    const communityValues = {
      slug,
      name: str(c.name, "community name"),
      timezone: typeof c.timezone === "string" ? c.timezone : "Asia/Kolkata",
      instructions: typeof c.instructions === "string" ? c.instructions.trim() : "",
    };
    const [community] = await tx
      .insert(communities)
      .values(communityValues)
      .onConflictDoUpdate({ target: communities.slug, set: { ...communityValues, updatedAt: new Date() } })
      .returning();
    const communityId = community!.id;
    let crew = await syncCrew(tx, communityId, null, "community", c.crew, "community.yaml");

    const desired: DesiredEntry[] = [];
    const addFiles = (files: string[], eventId: string | null) => {
      for (const file of files) {
        const rel = posix(path.relative(root, file));
        const parsed = parseKnowledgeMarkdown(path.basename(file), fs.readFileSync(file, "utf8"));
        for (const s of parsed.sections) {
          desired.push({
            key: `${rel}#${s.slug}`,
            eventId,
            sourceRef: rel,
            sourceTitle: parsed.title,
            heading: s.heading,
            body: s.body,
            tags: parsed.tags,
            position: s.position,
          });
        }
      }
    };

    addFiles(markdownFiles(path.join(root, "knowledge")), null);

    const eventSlugs: string[] = [];
    const eventsDir = path.join(root, "events");
    const eventDirs = fs.existsSync(eventsDir)
      ? fs.readdirSync(eventsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
      : [];
    for (const name of eventDirs) {
      const file = path.join(eventsDir, name, "event.yaml");
      if (!fs.existsSync(file)) continue;
      const e = readYaml(file);
      const stage = (typeof e.stage === "string" ? e.stage : "plan") as Stage;
      if (!STAGES.includes(stage)) throw new Error(`${file}: stage must be one of ${STAGES.join(", ")}`);
      const values = {
        communityId,
        slug: typeof e.slug === "string" ? e.slug : name,
        name: str(e.name, `${file} name`),
        stage,
        startsAt: optDate(e.starts_at),
        endsAt: optDate(e.ends_at),
        venue: typeof e.venue === "string" ? e.venue : null,
        instructions: typeof e.instructions === "string" ? e.instructions.trim() : "",
        crewRoomId: typeof e.crew_room_id === "string" && e.crew_room_id ? e.crew_room_id : null,
      };
      const [event] = await tx
        .insert(events)
        .values(values)
        .onConflictDoUpdate({ target: [events.communityId, events.slug], set: { ...values, updatedAt: new Date() } })
        .returning();
      eventSlugs.push(values.slug);
      crew += await syncCrew(tx, communityId, event!.id, values.slug, e.crew, file);
      addFiles(markdownFiles(path.join(eventsDir, name, "knowledge")), event!.id);
    }

    const existing = await tx
      .select()
      .from(knowledgeEntries)
      .where(and(eq(knowledgeEntries.communityId, communityId), eq(knowledgeEntries.sourceKind, "markdown")));
    const byKey = new Map(existing.map((e) => [e.key, e]));

    const report: SeedReport = {
      communityId,
      communitySlug: slug,
      events: eventSlugs,
      crew,
      created: 0,
      updated: 0,
      restored: 0,
      archived: 0,
      unchanged: 0,
    };
    const now = new Date();
    const seen = new Set<string>();

    for (const d of desired) {
      seen.add(d.key);
      const old = byKey.get(d.key);
      if (!old) {
        const [row] = await tx
          .insert(knowledgeEntries)
          .values({ communityId, sourceKind: "markdown", createdBy: editedBy, ...d })
          .returning({ id: knowledgeEntries.id });
        await tx.insert(knowledgeRevisions).values({
          entryId: row!.id,
          version: 1,
          heading: d.heading,
          body: d.body,
          sourceKind: "markdown",
          editedBy,
          change: "created",
        });
        report.created++;
        continue;
      }

      const textChanged = old.heading !== d.heading || old.body !== d.body;
      const wasArchived = old.archivedAt !== null;
      const metaChanged =
        old.eventId !== d.eventId ||
        old.sourceTitle !== d.sourceTitle ||
        old.sourceRef !== d.sourceRef ||
        old.position !== d.position ||
        !sameTags(old.tags, d.tags);

      if (textChanged || wasArchived) {
        const version = old.version + 1;
        await tx
          .update(knowledgeEntries)
          .set({ ...d, version, archivedAt: null, updatedAt: now })
          .where(eq(knowledgeEntries.id, old.id));
        await tx.insert(knowledgeRevisions).values({
          entryId: old.id,
          version,
          heading: d.heading,
          body: d.body,
          sourceKind: "markdown",
          editedBy,
          change: wasArchived ? "restored" : "updated",
        });
        if (wasArchived) report.restored++;
        else report.updated++;
      } else if (metaChanged) {
        await tx.update(knowledgeEntries).set({ ...d, updatedAt: now }).where(eq(knowledgeEntries.id, old.id));
        report.updated++;
      } else {
        report.unchanged++;
      }
    }

    for (const old of existing) {
      if (seen.has(old.key) || old.archivedAt) continue;
      const version = old.version + 1;
      await tx
        .update(knowledgeEntries)
        .set({ archivedAt: now, version, updatedAt: now })
        .where(eq(knowledgeEntries.id, old.id));
      await tx.insert(knowledgeRevisions).values({
        entryId: old.id,
        version,
        heading: old.heading,
        body: old.body,
        sourceKind: "markdown",
        editedBy,
        change: "archived",
      });
      report.archived++;
    }

    return report;
  });
}
