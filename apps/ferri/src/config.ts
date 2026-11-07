import path from "node:path";
import { fileURLToPath } from "node:url";
import { modelsFromEnv } from "@ferri/knowledge";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "../../..");

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env and run \`pnpm setup:switch\`.`);
  }
  return value;
}

const models = modelsFromEnv();

export const config = {
  switchUrl: process.env.SWITCH_URL ?? "http://localhost:8000",
  agentId: required("FERRI_AGENT_ID"),
  agentKey: required("FERRI_AGENT_KEY"),
  /** Ferri's Switch handle, as in `@ferri`. */
  agentName: process.env.FERRI_AGENT_NAME ?? "ferri",
  /** Answers (Sonnet in production, Haiku in tests). */
  modelMain: models.main,
  /** Per-message triage. */
  modelFast: models.fast,
  /** Which community this install serves; the oldest one when unset. */
  community: process.env.FERRI_COMMUNITY || undefined,
  /** Spec 01's cursor file, imported into Postgres once. */
  legacyStateDir: path.join(repoRoot, ".ferri-state"),
  skillsDir: path.join(repoRoot, "skills"),
  /** Messages older than this when they arrive (catch-up after downtime) get no reply. */
  maxReplyAgeMs: 10 * 60 * 1000,
  /**
   * For a question nobody addressed to Ferri: how long to wait so a person can
   * answer first. Ferri then checks the room again before stepping in.
   */
  roomGraceMs: Number(process.env.FERRI_ROOM_GRACE_SECONDS ?? 20) * 1000,
  /**
   * Crew chatter: how long Ferri waits after a possible decision before it
   * checks it, so a correction in the next messages is part of what it offers.
   */
  decisionGraceMs: Number(process.env.FERRI_DECISION_GRACE_SECONDS ?? 20) * 1000,
  /** Sibling Switch checkout's .env, for the admin password fallback. */
  switchEnvFile: path.join(repoRoot, "..", "switch", ".env"),
  /** Test override for the ladder's T (nudge at T, escalate at 2T). Unset: 10 min live, 2 h before. */
  nudgeSeconds: optionalNumber(process.env.FERRI_NUDGE_SECONDS),
  /** Test override for how long a card stays open. Unset: 24 h or the event's end. */
  cardTtlSeconds: optionalNumber(process.env.FERRI_CARD_TTL_SECONDS),
  /** Shield (spec 07): the Switch Trust endpoint inside this service. Off without a key. */
  shieldApiKey: process.env.SHIELD_API_KEY?.trim() || undefined,
  shieldPort: Number(process.env.SHIELD_PORT ?? 3200),
  /** Docker Desktop's host.docker.internal reaches the host's loopback, so 127.0.0.1 is enough. */
  shieldHost: process.env.SHIELD_HOST ?? "127.0.0.1",
  shieldPolicyId: process.env.SHIELD_POLICY_ID ?? "ferri-shield",
  /** Email (spec 15): Resend. Off without a key. */
  resendApiKey: process.env.RESEND_API_KEY?.trim() || undefined,
  /** The outreach mailbox; the display name is the community's name unless given here ("Lantern Labs <partners@...>"). Unset: outreach email is off. */
  emailFrom: process.env.FERRI_EMAIL_FROM?.trim() || undefined,
  /** Outreach emails per 24 hours (Resend's free plan sends 100 a day in all). */
  emailDailyCap: Number(process.env.FERRI_EMAIL_DAILY_CAP ?? 20),
  /** RSVP (spec 17): the guests' mailbox (the display name is the event's name; unset: guest email is off), and guest emails per 24 hours. */
  guestEmailFrom: process.env.FERRI_GUEST_EMAIL_FROM?.trim() || undefined,
  guestDailyCap: Number(process.env.FERRI_GUEST_EMAIL_DAILY_CAP ?? 80),
  /** Tests and rehearsals: email only guests at these domains (comma-separated); others are skipped and noted. */
  guestEmailAllow: (process.env.FERRI_GUEST_EMAIL_ALLOW ?? "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean),
  /** Desk's public address (the tunnel): guests' RSVP links. */
  publicUrl: process.env.FERRI_PUBLIC_URL?.trim() || "http://localhost:3100",
  /** The event site's shared secret (its hook to Desk, and its guest route for Ferri). */
  siteHookSecret: process.env.FERRI_SITE_HOOK_SECRET?.trim() || undefined,
  /** Tests: read the site's guests from here instead of the address the Builder reported. */
  siteUrlOverride: process.env.FERRI_SITE_URL?.trim() || undefined,
  /** How often each live event's guests are synced from Luma and the site. */
  guestSyncMs: Number(process.env.FERRI_GUEST_SYNC_SECONDS ?? 600) * 1000,
  outcomePollMs: 2000,
  ladderTickMs: 5000,
  /** How often Ferri asks Switch which rooms it is in (new ones land in Discovered, Off). */
  discoveryMs: 60_000,
  /** How often Ferri checks whether the knowledge changed (in Ferri or in Desk) to refresh the mirror. */
  mirrorWatchMs: 5_000,
};

function optionalNumber(v: string | undefined): number | undefined {
  if (v === undefined || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
