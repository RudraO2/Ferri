import { eq } from "drizzle-orm";
import type { Db } from "./client.js";
import { agentState } from "./schema.js";

export async function getState<T>(db: Db, key: string): Promise<T | undefined> {
  const rows = await db.select({ value: agentState.value }).from(agentState).where(eq(agentState.key, key)).limit(1);
  return rows[0]?.value as T | undefined;
}

export async function setState(db: Db, key: string, value: unknown): Promise<void> {
  await db
    .insert(agentState)
    .values({ key, value })
    .onConflictDoUpdate({ target: agentState.key, set: { value, updatedAt: new Date() } });
}
