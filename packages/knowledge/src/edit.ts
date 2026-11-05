import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { knowledgeEntries, knowledgeRevisions, type Db } from "@ferri/db";

/**
 * Knowledge edits made by an organizer (Desk). Every change is a new version
 * with a revision row. A seeded entry that is edited becomes a Desk entry, so
 * seeding again never overwrites it.
 */
export async function editEntry(
  db: Db,
  input: { entryId: string; heading: string; body: string; by: string },
): Promise<{ changed: boolean; version: number }> {
  const heading = input.heading.trim();
  const body = input.body.trim();
  if (!heading || !body) throw new Error("A knowledge entry needs a heading and a body.");
  return db.transaction(async (tx) => {
    const [old] = await tx.select().from(knowledgeEntries).where(eq(knowledgeEntries.id, input.entryId)).limit(1);
    if (!old) throw new Error("Entry not found.");
    if (old.heading === heading && old.body === body) return { changed: false, version: old.version };
    const version = old.version + 1;
    const sourceKind = old.sourceKind === "markdown" ? "desk" : old.sourceKind;
    await tx
      .update(knowledgeEntries)
      .set({ heading, body, version, sourceKind, updatedAt: new Date() })
      .where(eq(knowledgeEntries.id, old.id));
    await tx.insert(knowledgeRevisions).values({
      entryId: old.id,
      version,
      heading,
      body,
      sourceKind,
      editedBy: input.by,
      change: "updated",
    });
    return { changed: true, version };
  });
}

export async function createEntry(
  db: Db,
  input: { communityId: string; eventId: string | null; sourceTitle: string; heading: string; body: string; by: string },
): Promise<string> {
  const heading = input.heading.trim();
  const body = input.body.trim();
  const sourceTitle = input.sourceTitle.trim() || "Notes from the crew";
  if (!heading || !body) throw new Error("A knowledge entry needs a heading and a body.");
  return db.transaction(async (tx) => {
    const key = `desk/${randomUUID()}`;
    const [row] = await tx
      .insert(knowledgeEntries)
      .values({
        communityId: input.communityId,
        eventId: input.eventId,
        key,
        sourceKind: "desk",
        sourceRef: key,
        sourceTitle,
        heading,
        body,
        createdBy: input.by,
      })
      .returning({ id: knowledgeEntries.id });
    await tx.insert(knowledgeRevisions).values({
      entryId: row!.id,
      version: 1,
      heading,
      body,
      sourceKind: "desk",
      editedBy: input.by,
      change: "created",
    });
    return row!.id;
  });
}

/** Archive (archived = true) or restore an entry; either way a new version and a revision. */
export async function setEntryArchived(db: Db, input: { entryId: string; archived: boolean; by: string }): Promise<void> {
  await db.transaction(async (tx) => {
    const [old] = await tx.select().from(knowledgeEntries).where(eq(knowledgeEntries.id, input.entryId)).limit(1);
    if (!old) throw new Error("Entry not found.");
    if ((old.archivedAt !== null) === input.archived) return;
    const version = old.version + 1;
    // A seeded entry archived in Desk must not come back on the next seed.
    const sourceKind = old.sourceKind === "markdown" ? "desk" : old.sourceKind;
    await tx
      .update(knowledgeEntries)
      .set({ archivedAt: input.archived ? new Date() : null, version, sourceKind, updatedAt: new Date() })
      .where(eq(knowledgeEntries.id, old.id));
    await tx.insert(knowledgeRevisions).values({
      entryId: old.id,
      version,
      heading: old.heading,
      body: old.body,
      sourceKind,
      editedBy: input.by,
      change: input.archived ? "archived" : "restored",
    });
  });
}

export async function entryRevisions(db: Db, entryId: string) {
  return db.select().from(knowledgeRevisions).where(eq(knowledgeRevisions.entryId, entryId)).orderBy(desc(knowledgeRevisions.version));
}
