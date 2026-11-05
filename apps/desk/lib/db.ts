import "server-only";
import { createDb, findCommunityRow, type Db } from "./ferri";

// One pool for the whole server process (Next reloads modules in dev, so keep it on globalThis).
const g = globalThis as unknown as { __ferriDesk?: { db: Db } };

export function db(): Db {
  g.__ferriDesk ??= { db: createDb().db };
  return g.__ferriDesk.db;
}

/** The community this install serves (FERRI_COMMUNITY, or the oldest one). */
export async function community() {
  const row = await findCommunityRow(db(), process.env.FERRI_COMMUNITY || undefined);
  if (!row) throw new Error("No community yet. Run `pnpm kb seed` in the Ferri repo.");
  return row;
}
