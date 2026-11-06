import "server-only";
import { desc, eq } from "drizzle-orm";
import { bufferFromEnv, serviceName, type BufferChannel } from "@ferri/social";
import { community, db } from "./db";
import { socialPosts } from "./ferri";

export { serviceName };

/** Buffer's connected channels, live (null when there is no key; an error message when Buffer refuses). */
export async function bufferChannels(): Promise<{ channels: (BufferChannel & { organizationName: string })[] | null; error: string | null }> {
  const b = bufferFromEnv();
  if (!b) return { channels: null, error: null };
  try {
    return { channels: await b.allChannels(), error: null };
  } catch (err) {
    return { channels: [], error: (err as Error).message };
  }
}

export async function recentSocialPosts(limit = 60) {
  const c = await community();
  return db().select().from(socialPosts).where(eq(socialPosts.communityId, c.id)).orderBy(desc(socialPosts.createdAt)).limit(limit);
}

export type SocialPost = Awaited<ReturnType<typeof recentSocialPosts>>[number];

export const SOCIAL_STATUS_LABEL: Record<string, string> = {
  waiting: "waiting for an OK",
  dismissed: "not posted",
  expired: "not approved in time",
  draft: "draft in Buffer",
  scheduled: "scheduled in Buffer",
  sent: "posted",
  failed: "failed",
  deleted: "deleted",
};
