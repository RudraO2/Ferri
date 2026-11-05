import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

export const DEFAULT_DATABASE_URL = "postgres://ferri:ferri@localhost:5433/ferri";

export function createDb(url = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL) {
  // Supabase's pooler (port 6543) runs in transaction mode and needs prepare: false.
  const sqlClient = postgres(url, { max: 10, prepare: !url.includes(":6543"), onnotice: () => {} });
  const db = drizzle(sqlClient, { schema });
  return { db, sql: sqlClient, close: () => sqlClient.end({ timeout: 5 }) };
}

export type Db = ReturnType<typeof createDb>["db"];
