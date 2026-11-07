import "server-only";
import { readdirSync } from "node:fs";
import path from "node:path";

/**
 * The character art present in public/brand/src (file names without ".png"), read
 * per request so new art shows up without a rebuild. Components draw a placeholder
 * for anything missing instead of requesting a file that is not there.
 */
export function brandFiles(): string[] {
  try {
    return readdirSync(path.join(process.cwd(), "public", "brand", "src"))
      .filter((f) => /\.(png|webp|gif)$/i.test(f))
      .map((f) => f.replace(/\.(png|webp|gif)$/i, ""));
  } catch {
    return [];
  }
}
