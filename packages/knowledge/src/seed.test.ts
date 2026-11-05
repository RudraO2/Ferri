import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { communities, createDb, events, knowledgeEntries, knowledgeRevisions, runMigrations } from "@ferri/db";
import { editEntry } from "./edit.ts";
import { seedFromDirectory } from "./seed.ts";
import { loadLiveKnowledge, searchKnowledge } from "./store.ts";

// Runs against the local Ferri Postgres (`pnpm db:up`); skipped when it is not running.
const url = process.env.DATABASE_URL ?? "postgres://ferri:ferri@localhost:5433/ferri";
const reachable = await (async () => {
  const probe = createDb(url);
  try {
    await probe.sql`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await probe.close();
  }
})();

describe.skipIf(!reachable)("seedFromDirectory (Postgres)", () => {
  const slug = `seed-test-${Date.now()}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ferri-seed-"));
  const { db, close } = createDb(url);
  const write = (rel: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  };

  beforeAll(async () => {
    await runMigrations(url);
    write("community.yaml", `slug: ${slug}\nname: Seed Test\ninstructions: be nice\n`);
    write("knowledge/about.md", "# About\n\n## Contact\nmail us\n## Hours\n9 to 5\n");
    write("events/night/event.yaml", "name: Test Night\nstage: live\nstarts_at: 2026-11-21T10:00:00+05:30\n");
    write("events/night/knowledge/faq.md", "---\ntitle: Night FAQ\n---\n## Food\nLunch is at 1:30 PM.\n");
    write("events/old/event.yaml", "name: Old Night\nstage: wrap\n");
    write("events/old/knowledge/faq.md", "## Food\nPizza.\n");
  });

  afterAll(async () => {
    await db.delete(communities).where(eq(communities.slug, slug));
    await close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("creates everything, then changes nothing on a second run", async () => {
    const first = await seedFromDirectory(db, dir);
    expect(first).toMatchObject({ created: 4, updated: 0, archived: 0, unchanged: 0, events: ["night", "old"] });
    const second = await seedFromDirectory(db, dir);
    expect(second).toMatchObject({ created: 0, updated: 0, archived: 0, restored: 0, unchanged: 4 });
  });

  it("serves community knowledge plus live events only, in file order", async () => {
    const kb = (await loadLiveKnowledge(db, slug))!;
    expect(kb.events.map((e) => e.slug)).toEqual(["night"]);
    expect(kb.entries.map((e) => e.key)).toEqual([
      "knowledge/about.md#contact",
      "knowledge/about.md#hours",
      "events/night/knowledge/faq.md#food",
    ]);
    const hits = await searchKnowledge(db, kb, ["lunch"]);
    expect(hits.map((h) => h.heading)).toEqual(["Food"]);
  });

  it("bumps only the edited entry, archives a removed one, and restores it", async () => {
    write("events/night/knowledge/faq.md", "---\ntitle: Night FAQ\n---\n## Food\nLunch is at 2:00 PM.\n");
    write("knowledge/about.md", "# About\n\n## Contact\nmail us\n");
    const r = await seedFromDirectory(db, dir);
    expect(r).toMatchObject({ created: 0, updated: 1, archived: 1, unchanged: 2 });

    const [food] = await db.select().from(knowledgeEntries).where(eq(knowledgeEntries.key, "events/night/knowledge/faq.md#food"));
    expect(food).toMatchObject({ version: 2, body: "Lunch is at 2:00 PM." });
    const revs = await db.select().from(knowledgeRevisions).where(eq(knowledgeRevisions.entryId, food!.id));
    expect(revs.map((x) => [x.version, x.change]).sort()).toEqual([
      [1, "created"],
      [2, "updated"],
    ]);

    write("knowledge/about.md", "# About\n\n## Contact\nmail us\n## Hours\n9 to 5\n");
    expect(await seedFromDirectory(db, dir)).toMatchObject({ restored: 1, archived: 0 });
  });

  it("never overwrites what an organizer changed in Desk", async () => {
    const [hours] = await db.select().from(knowledgeEntries).where(eq(knowledgeEntries.key, "knowledge/about.md#hours"));
    const edit = await editEntry(db, { entryId: hours!.id, heading: "Hours", body: "10 to 6 on weekdays", by: "Priya" });
    expect(edit).toEqual({ changed: true, version: hours!.version + 1 });

    const [ev] = await db.update(events).set({ name: "Renamed in Desk", deskEditedAt: new Date() }).where(eq(events.slug, "night")).returning();
    const r = await seedFromDirectory(db, dir);
    expect(r.kept).toBe(1);
    expect(r.keptFromDesk).toContain("night settings");

    const [after] = await db.select().from(knowledgeEntries).where(eq(knowledgeEntries.id, hours!.id));
    expect(after).toMatchObject({ body: "10 to 6 on weekdays", sourceKind: "desk" });
    const [evAfter] = await db.select().from(events).where(eq(events.id, ev!.id));
    expect(evAfter!.name).toBe("Renamed in Desk");
    expect(r.spaceRequests).toEqual([]);
  });
});
