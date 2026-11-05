import { domainToUnicode } from "node:url";

/**
 * Shield's checks (spec 07). Pure and fast: no network, no model, so a
 * verdict is always far inside Switch Trust's 2 second budget. The HTTP side
 * (Ferri) adds the optional reputation lookup and the crew alerts.
 */

export type Outcome = "ok" | "alerted" | "redacted" | "blocked";
export type Severity = "high" | "medium" | "low";
export type Role = "user" | "assistant";

export interface Finding {
  /** "secret", "scam_link", "lookalike_domain", "blocked_domain", "link_flood", "many_links", "reputation". */
  category: string;
  detector_name: string;
  severity: Severity;
  /** The exact text found. Switch uses it to redact; never log it or show it to people. */
  detected_string: string;
  /** A short, safe description for the crew ("dlscord-gift[.]com looks like discord.com"). */
  reason: string;
}

export interface Verdict {
  outcome: Outcome;
  findings: Finding[];
}

export interface Rules {
  /** Domains the community trusts: links to them (and their subdomains) are never flagged. */
  allow: string[];
  /** Domains the community blocks. */
  block: string[];
}

export const NO_RULES: Rules = { allow: [], block: [] };

// ── Secrets ───────────────────────────────────────────────────────────────

const SECRETS: { name: string; label: string; re: RegExp }[] = [
  { name: "anthropic_api_key", label: "an Anthropic API key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: "openai_api_key", label: "an OpenAI API key", re: /\bsk-(?!ant-)(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}/g },
  { name: "aws_access_key", label: "an AWS access key", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: "github_token", label: "a GitHub token", re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})/g },
  { name: "slack_token", label: "a Slack token", re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g },
  { name: "stripe_secret_key", label: "a Stripe secret key", re: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}/g },
  { name: "google_api_key", label: "a Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "discord_bot_token", label: "a Discord bot token", re: /\b[MNO][A-Za-z\d_-]{23,25}\.[A-Za-z\d_-]{6}\.[A-Za-z\d_-]{27,38}\b/g },
  { name: "telegram_bot_token", label: "a Telegram bot token", re: /\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b/g },
  { name: "private_key", label: "a private key", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----|$)/g },
  { name: "database_url_password", label: "a database password", re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:/@]+:[^\s@/]{6,}@[^\s]+/g },
];

export function findSecrets(text: string): Finding[] {
  const out: Finding[] = [];
  const taken: [number, number][] = [];
  for (const s of SECRETS) {
    for (const m of text.matchAll(s.re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      // One secret, one finding: skip a match inside one already found.
      if (taken.some(([a, b]) => start < b && end > a)) continue;
      taken.push([start, end]);
      out.push({ category: "secret", detector_name: s.name, severity: "high", detected_string: m[0], reason: s.label });
    }
  }
  return out;
}

// ── Links ─────────────────────────────────────────────────────────────────

export interface Link {
  /** As written in the message. */
  raw: string;
  /** Lowercase host, punycode decoded, without "www.". */
  host: string;
  /** The registrable part: "dlscord-gift.com", "example.co.uk". */
  domain: string;
  /** Normalized link for flood counting: host + path, no query, no trailing slash. */
  key: string;
}

const TLDS =
  "com|net|org|io|co|gg|me|app|dev|ai|xyz|info|biz|ru|cn|tk|ml|ga|cf|gq|top|site|online|click|link|live|gift|shop|store|fun|cc|ly|to|in|uk|us|de|fr|ws|su|zip|mov|ma|sh|so|tv|pw|icu|vip|club|buzz|rest|work";
const URL_RE = new RegExp(
  String.raw`\b(?:https?:\/\/[^\s<>"'\])]+|(?:www\.)?(?:[a-z0-9\u00a1-\uffff](?:[a-z0-9\u00a1-\uffff-]{0,61}[a-z0-9\u00a1-\uffff])?\.)+(?:${TLDS}|xn--[a-z0-9-]+)(?:\/[^\s<>"'\])]*)?)`,
  "giu",
);
const TWO_LEVEL = new Set(["co.uk", "org.uk", "ac.uk", "co.in", "org.in", "ac.in", "com.au", "co.jp", "com.br", "co.za", "com.sg", "gov.in", "net.in"]);

export function registrable(host: string): string {
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const last2 = parts.slice(-2).join(".");
  return TWO_LEVEL.has(last2) ? parts.slice(-3).join(".") : last2;
}

export function extractLinks(text: string): Link[] {
  const out: Link[] = [];
  for (const m of text.matchAll(URL_RE)) {
    let raw = m[0].replace(/[.,;:!?)]+$/, "");
    // An email address is not a link.
    if (text[(m.index ?? 0) - 1] === "@") continue;
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
    let url: URL;
    try {
      url = new URL(withScheme);
    } catch {
      continue;
    }
    const ascii = url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    if (!ascii.includes(".")) continue;
    const host = (domainToUnicode(ascii) || ascii).toLowerCase();
    const path = url.pathname.replace(/\/+$/, "");
    out.push({ raw, host, domain: registrable(host), key: `${ascii}${path}`.toLowerCase() });
    raw = "";
  }
  return out;
}

/** "dlscord-gift[.]com": safe to post anywhere, no link preview, no click. */
export function defang(host: string): string {
  return host.replace(/\./g, "[.]");
}

const covers = (domain: string, host: string) => host === domain || host.endsWith(`.${domain}`);

/** Brands scammers copy, with the domains that really belong to them. */
const BRANDS: Record<string, string[]> = {
  discord: ["discord.com", "discord.gg", "discordapp.com", "discord.media", "discordapp.net", "discord.new", "discord.dev", "discordstatus.com"],
  steam: ["steampowered.com", "steamcommunity.com", "steamstatic.com", "steam.tv", "steamchina.com"],
  steamcommunity: ["steamcommunity.com"],
  telegram: ["telegram.org", "t.me", "telegram.me", "telegra.ph"],
  github: ["github.com", "github.io", "githubusercontent.com", "github.dev", "githubassets.com"],
  google: ["google.com", "google.co.in", "goo.gl", "googleusercontent.com", "gstatic.com", "youtube.com", "youtu.be", "g.co", "forms.gle"],
  paypal: ["paypal.com", "paypal.me"],
  metamask: ["metamask.io"],
  binance: ["binance.com"],
  coinbase: ["coinbase.com"],
  opensea: ["opensea.io"],
  slack: ["slack.com"],
  whatsapp: ["whatsapp.com", "wa.me", "whatsapp.net"],
  microsoft: ["microsoft.com", "live.com", "office.com", "microsoftonline.com", "outlook.com"],
  apple: ["apple.com", "icloud.com"],
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.com", "fb.me", "messenger.com"],
  linkedin: ["linkedin.com", "lnkd.in"],
  devfolio: ["devfolio.co"],
  unstop: ["unstop.com"],
  wemakedevs: ["wemakedevs.org"],
  luma: ["lu.ma", "luma.com"],
  vercel: ["vercel.com", "vercel.app"],
  epicgames: ["epicgames.com"],
  roblox: ["roblox.com"],
};
const OFFICIAL = new Set(Object.values(BRANDS).flat());
const officialHost = (host: string) => [...OFFICIAL].some((d) => covers(d, host));

/** Letters scammers swap in, folded back: "dlscord" and "disc0rd" both read "discord". */
export function skeleton(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[аɑα]/g, "a")
    .replace(/[её]/g, "e")
    .replace(/[оο0]/g, "o")
    .replace(/[рρ]/g, "p")
    .replace(/[сϲ]/g, "c")
    .replace(/[хχ]/g, "x")
    .replace(/[уγ]/g, "y")
    .replace(/[іı1!|]/g, "i")
    .replace(/l/g, "i")
    .replace(/rn/g, "m")
    .replace(/vv/g, "w")
    .replace(/5/g, "s")
    .replace(/3/g, "e")
    .replace(/[^a-z]/g, "");
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length]![b.length]!;
}

/** The brand a strange domain pretends to be, or null. */
export function lookalikeOf(link: Link): string | null {
  if (officialHost(link.host)) return null;
  const labels = link.host.split(".");
  const name = labels.slice(0, -1); // drop the TLD
  for (const label of name) {
    for (const part of [label, ...label.split("-")]) {
      if (part.length < 4) continue;
      const sk = skeleton(part);
      for (const brand of Object.keys(BRANDS)) {
        const bk = skeleton(brand);
        if (part === brand) continue; // the brand's own name inside another domain: see brandInside
        if (sk === bk) return brand;
        if (bk.length >= 6 && Math.abs(sk.length - bk.length) <= 1 && editDistance(sk, bk) === 1) return brand;
      }
    }
  }
  return null;
}

/** A real brand name used inside a domain that is not the brand's: "discord-nitro.gift". */
export function brandInside(link: Link): string | null {
  if (officialHost(link.host)) return null;
  const words = link.host.split(/[.-]/);
  return Object.keys(BRANDS).find((b) => b.length >= 5 && words.includes(b)) ?? null;
}

const SCAM_WORDS =
  /\b(free\s+(?:discord\s+)?nitro|nitro\s+(?:gift|giveaway|for\s+free)|steam\s+gift|claim\s+(?:your\s+)?(?:free\s+)?(?:reward|prize|gift|airdrop|nft|tokens?|nitro)|airdrop|seed\s+phrase|recovery\s+phrase|secret\s+phrase|connect\s+(?:your\s+)?wallet|validate\s+your\s+wallet|verify\s+your\s+(?:account|wallet)\s+(?:here|now)|double\s+your\s+(?:crypto|money|btc|eth)|crypto\s+giveaway|you\s+(?:have\s+)?won|limited\s+offer.{0,20}click)\b/i;
const SCAMMY_TLD = /\.(?:gift|tk|ml|ga|cf|gq|zip|mov|top|click|icu|buzz|rest)$/i;
const SHORTENERS = new Set(["bit.ly", "tinyurl.com", "t.co", "rb.gy", "is.gd", "cutt.ly", "shorturl.at", "tiny.cc", "ow.ly", "rebrand.ly", "s.id"]);

// ── Floods ────────────────────────────────────────────────────────────────

/** Recent links per room, to spot the same link pasted again and again. */
export class FloodWatch {
  private seen = new Map<string, { key: string; at: number }[]>();
  constructor(
    readonly windowMs = 120_000,
    readonly limit = 3,
  ) {}

  /** Record this message's links; returns the ones now seen `limit` or more times in the window. */
  record(roomId: string, links: Link[], now = Date.now()): Link[] {
    const list = (this.seen.get(roomId) ?? []).filter((x) => now - x.at < this.windowMs);
    const flooded: Link[] = [];
    for (const l of new Map(links.map((x) => [x.key, x])).values()) {
      list.push({ key: l.key, at: now });
      if (list.filter((x) => x.key === l.key).length >= this.limit) flooded.push(l);
    }
    this.seen.set(roomId, list.slice(-200));
    return flooded;
  }
}

// ── The verdict ───────────────────────────────────────────────────────────

const RANK: Record<Outcome, number> = { ok: 0, alerted: 1, redacted: 2, blocked: 3 };

export function worst(a: Outcome, b: Outcome): Outcome {
  return RANK[a] >= RANK[b] ? a : b;
}

/**
 * Check one message. `role` "assistant" is an agent's post (Ferri's own):
 * secrets and bad links count, floods do not.
 */
export function check(input: { role: Role; content: string; roomId: string; rules?: Rules; flood?: FloodWatch; now?: number }): Verdict {
  const rules = input.rules ?? NO_RULES;
  const findings: Finding[] = [];
  let outcome: Outcome = "ok";
  const add = (f: Finding, o: Outcome) => {
    findings.push(f);
    outcome = worst(outcome, o);
  };

  for (const f of findSecrets(input.content)) add(f, "redacted");

  const links = extractLinks(input.content);
  const allowed = (l: Link) => rules.allow.some((d) => covers(d.toLowerCase(), l.host));
  const checked = links.filter((l) => !allowed(l));
  const scamWords = SCAM_WORDS.exec(input.content)?.[0] ?? null;

  for (const l of checked) {
    const host = defang(l.host);
    const blockedBy = rules.block.find((d) => covers(d.toLowerCase(), l.host));
    if (blockedBy) {
      add({ category: "blocked_domain", detector_name: "community_block_list", severity: "high", detected_string: l.raw, reason: `${host} is on the community's block list` }, "blocked");
      continue;
    }
    const like = lookalikeOf(l);
    if (like) {
      add({ category: "lookalike_domain", detector_name: "brand_lookalike", severity: "high", detected_string: l.raw, reason: `${host} looks like ${like} but is not` }, "blocked");
      continue;
    }
    const inside = brandInside(l);
    if (inside && (scamWords || SCAMMY_TLD.test(l.host))) {
      add({ category: "scam_link", detector_name: "brand_in_strange_domain", severity: "high", detected_string: l.raw, reason: `${host} uses the ${inside} name but is not ${inside}` }, "blocked");
      continue;
    }
    if (scamWords && !officialHost(l.host)) {
      add({ category: "scam_link", detector_name: "scam_phrase_with_link", severity: "high", detected_string: l.raw, reason: `“${scamWords.toLowerCase()}” with a link to ${host}` }, "blocked");
      continue;
    }
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(l.host)) {
      add({ category: "scam_link", detector_name: "raw_ip_link", severity: "medium", detected_string: l.raw, reason: `a link to a bare IP address (${host})` }, "alerted");
      continue;
    }
    if (SHORTENERS.has(l.domain) && scamWords) {
      add({ category: "scam_link", detector_name: "shortener_with_scam_words", severity: "high", detected_string: l.raw, reason: `a short link (${host}) with “${scamWords.toLowerCase()}”` }, "blocked");
    }
  }

  if (input.role === "user") {
    if (input.flood) {
      for (const l of input.flood.record(input.roomId, checked, input.now)) {
        add({ category: "link_flood", detector_name: "same_link_repeated", severity: "medium", detected_string: l.raw, reason: `the same link (${defang(l.host)}) posted ${input.flood.limit}+ times in ${Math.round(input.flood.windowMs / 60000)} min` }, "blocked");
      }
    }
    if (new Set(checked.map((l) => l.key)).size >= 6) {
      add({ category: "many_links", detector_name: "many_links", severity: "low", detected_string: "", reason: `${checked.length} links in one message` }, "alerted");
    }
  }
  return { outcome, findings };
}

/** What a person reads about a verdict: the reasons, never the detected text. */
export function describe(v: Verdict): string {
  const reasons = [...new Set(v.findings.map((f) => f.reason))];
  return reasons.join("; ") || "nothing";
}

/** Switch Trust's wire outcome. */
export const WIRE_OUTCOME: Record<Outcome, string> = {
  ok: "GUARDRAIL_RESULT_OUTCOME_OK",
  alerted: "GUARDRAIL_RESULT_OUTCOME_ALERTED",
  redacted: "GUARDRAIL_RESULT_OUTCOME_REDACTED",
  blocked: "GUARDRAIL_RESULT_OUTCOME_BLOCKED",
};
