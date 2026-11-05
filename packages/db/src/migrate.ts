import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./client.js";

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");

/** Apply every pending migration. Safe to run on every start. */
export async function runMigrations(url?: string): Promise<void> {
  const { db, close } = createDb(url);
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runMigrations();
  console.log("migrations applied");
}
