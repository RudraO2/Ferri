import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { builderJobs, builderPaths } from "@/lib/ferri";
import { currentUser } from "@/lib/session";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

/** A file the Builder made for a job, from its folder on this machine (signed-in crew only). */
export async function GET(req: Request) {
  if (!(await currentUser())) return new Response("Sign in first.", { status: 401 });
  const url = new URL(req.url);
  const [job] = await db().select().from(builderJobs).where(eq(builderJobs.id, url.searchParams.get("job") ?? "")).limit(1);
  if (!job?.folder) return new Response("No such job.", { status: 404 });
  const root = path.resolve(builderPaths().dir, "jobs", job.folder);
  const file = path.resolve(root, url.searchParams.get("name") ?? "");
  // Never outside the job's folder.
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response("No such file.", { status: 404 });
  return new Response(fs.readFileSync(file), {
    headers: {
      "content-type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
      // The Builder's page is shown as it is, but cannot run scripts or reach Desk.
      "content-security-policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; font-src data:",
      "x-content-type-options": "nosniff",
    },
  });
}
