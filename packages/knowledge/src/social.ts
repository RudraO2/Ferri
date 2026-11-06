import { z } from "zod";
import { structuredCall, voiceSystem, voiceUser, type ModelChoice, type Usage } from "./model.ts";
import { renderInstructions, renderKnowledge } from "./render.ts";
import type { LiveKnowledge } from "./store.ts";

// ── Social posting (spec 18): LinkedIn, X and Instagram through Buffer ────

/** The networks Ferri writes for, by Buffer's service name. */
export const SOCIAL_SERVICES = ["linkedin", "twitter", "instagram"] as const;
export type SocialService = (typeof SOCIAL_SERVICES)[number];

export const SOCIAL_NAMES: Record<string, string> = { linkedin: "LinkedIn", twitter: "X", instagram: "Instagram" };
export const socialName = (s: string) => SOCIAL_NAMES[s] ?? s;

/** The services a crew member named ("X", "twitter", "insta", "LinkedIn"); [] means every connected one. */
export function servicesFrom(names: string[]): SocialService[] {
  const out = new Set<SocialService>();
  for (const raw of names) {
    const n = raw.trim().toLowerCase();
    if (!n || /^(all|every|everything|social|socials|all of them)$/.test(n)) return [];
    if (/linked/.test(n)) out.add("linkedin");
    else if (/^(x|twitter|tweet|x\.com)$/.test(n) || /twitter/.test(n)) out.add("twitter");
    else if (/insta|^ig$/.test(n)) out.add("instagram");
  }
  return [...out];
}

export const SocialDraftSchema = z.strictObject({
  /** 3 to 8 words for the crew's lists. */
  title: z.string(),
  linkedin: z.string(),
  twitter: z.string(),
  instagram: z.string(),
});
export type SocialDraft = z.infer<typeof SocialDraftSchema>;

const SOCIAL_SYSTEM = `You write social media posts for a community that runs events: one post each for LinkedIn, X and Instagram, all saying the same thing in the way each network reads best. The organizing crew asked for it and approves every post before it goes out.

Rules:
- Use only facts written in the knowledge entries and in the crew's request. Never invent a date, time, place, price, prize, name or link. If the request leaves out the date or venue and the knowledge has them, you may use them.
- linkedin: 2 to 5 short paragraphs, warm and clear, first person plural ("we"). End with the link when there is one. At most 3 hashtags, at the very end.
- twitter (X): one or two sentences, at most 240 characters before the link; put the link at the end when there is one. At most 2 hashtags.
- instagram: a caption of 2 to 4 short sentences that works with the image. Links are not clickable there, so write no URL; you may say "registration is open" or name the website in words. At most 5 hashtags, at the end.
- Plain text. No markdown, no @mentions of people, no emoji walls (at most 2 emoji per post).
- Follow the community and event instructions on tone and language.
- title: 3 to 8 words naming the post for the crew ("Build Night registration open").`;

const X_MAX = 280;
const urlLen = 23;
const xLen = (t: string) => t.replace(/https?:\/\/\S+/g, "x".repeat(urlLen)).length;

/** Keep a post within its network's rules, whatever the model wrote. */
export function fitSocialText(service: string, text: string, link: string | null): string {
  let t = text.replace(/\r/g, "").replace(/@(everyone|channel|here)\b/gi, "").trim();
  if (service === "instagram") t = t.replace(/https?:\/\/\S+/g, "").replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
  if ((service === "twitter" || service === "linkedin") && link && !t.includes(link)) t = `${t}${service === "linkedin" ? "\n\n" : " "}${link}`;
  if (service === "twitter" && xLen(t) > X_MAX) {
    const tail = link && t.includes(link) ? ` ${link}` : "";
    const body = tail ? t.replace(link!, "").trim() : t;
    const room = X_MAX - (tail ? urlLen + 1 : 0) - 1;
    const cut = body.slice(0, room);
    t = `${cut.slice(0, Math.max(cut.lastIndexOf(" "), room - 20)).trim()}…${tail}`;
  }
  return t;
}

export async function draftSocialPosts(input: {
  choice: ModelChoice;
  kb: LiveKnowledge;
  /** What the crew asked the posts to say. */
  what: string;
  /** The link to share (the event site or a listing), when there is one. */
  link: string | null;
  /** The post carries an image (a poster): write with it in mind. */
  withImage: boolean;
  sender: string;
  /** Spec 21: the crew's tone and language (`voiceBlock`). */
  voice?: string;
}): Promise<{ draft: SocialDraft | null; usage: Usage; latencyMs: number }> {
  const user = [
    renderInstructions(input.kb),
    renderKnowledge(input.kb.entries).text,
    `The crew's request (from ${input.sender}):\n${input.what}`,
    input.link ? `Link to share: ${input.link}` : "There is no link to share.",
    input.withImage ? "The posts go out with the event poster as the image." : "The posts have no image.",
    "Write the three posts.",
  ].join("\n\n");
  const out = await structuredCall({
    choice: input.choice,
    system: [{ type: "text", text: SOCIAL_SYSTEM, cache_control: { type: "ephemeral" } }, ...voiceSystem(input.voice)],
    user: user + voiceUser(input.voice),
    schema: SocialDraftSchema,
    maxTokens: 3000,
  });
  const d = out.data;
  if (!d || !(d.linkedin.trim() || d.twitter.trim() || d.instagram.trim())) return { draft: null, usage: out.usage, latencyMs: out.latencyMs };
  const draft: SocialDraft = {
    title: d.title.trim().slice(0, 100) || "Social post",
    linkedin: fitSocialText("linkedin", d.linkedin, input.link),
    twitter: fitSocialText("twitter", d.twitter, input.link),
    instagram: fitSocialText("instagram", d.instagram, input.link),
  };
  return { draft, usage: out.usage, latencyMs: out.latencyMs };
}

/** "Sat 1 May 2027, 10:00 AM" style, in the community's timezone. */
function when(d: Date | null, tz: string): string {
  if (!d) return "as soon as it is approved";
  return d.toLocaleString("en-IN", { timeZone: tz, weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** The card's prompt: every network's text, where the image is, and when it goes out. */
export function socialCardPrompt(input: {
  posts: { service: string; channelName: string; text: string }[];
  imageUrl: string | null;
  dueAt: Date | null;
  timeZone: string;
  skipped: string[];
}): string {
  const parts = input.posts.map((p) => `${socialName(p.service)} (${p.channelName}):\n${p.text}`);
  return [
    ...parts,
    input.imageUrl ? `Image: ${input.imageUrl}` : "No image.",
    input.skipped.length ? `Not included: ${input.skipped.join("; ")}.` : "",
    `Goes out ${when(input.dueAt, input.timeZone)}.`,
    `Pick Post it, Save as Buffer drafts (nothing is posted; you finish them in Buffer), or Don't post. Or write your own text in quotes after the card code to post that on every network instead.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
