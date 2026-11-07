/**
 * One-command connections to outside platforms (spec 23): `./ferri connect telegram|discord|slack`,
 * `connect list`, `connect remove <bridge id>`. The CLI is `scripts/connect.ts`; the parts here
 * take an injected fetch and Gateway client, so they are tested without a network.
 *
 * Switch facts (read from the fork): `POST /gateway/collaborations {bridge_type, display_name,
 * connection_config}`; Telegram needs `bot_token` and `bot_username`; Discord `bot_token` and
 * `guild_id`; Slack `bot_token`, `app_token` (Socket Mode) and `workspace_id`, which
 * `POST /gateway/collaborations/setup/slack/check` reads from the tokens. `DELETE
 * /gateway/collaborations/{id}` removes a connection and every room on it.
 */
import type { GatewayClient } from "@ferri/switch";
import type { BridgeInfo } from "./doctor.ts";

export type ConnectPlatform = "telegram" | "discord" | "slack";

export type ConnectCommand =
  | { action: "connect"; platform: "telegram"; token: string; username: string | null; name: string }
  | { action: "connect"; platform: "discord"; token: string; guild: string; name: string }
  | { action: "connect"; platform: "slack"; botToken: string; appToken: string; workspace: string | null; name: string }
  | { action: "list" }
  | { action: "remove"; id: string; yes: boolean }
  | { action: "help" };

type Env = Record<string, string | undefined>;

export const CONNECT_USAGE = [
  "Connect Ferri to a chat platform through Switch.",
  "",
  "  connect telegram --token <bot token> [--username <bot username>] [--name <display name>]",
  "  connect discord --token <bot token> --guild <server id> [--name <display name>]",
  "  connect slack --bot-token xoxb-... --app-token xapp-... [--workspace T...] [--name <display name>]",
  "  connect list",
  "  connect remove <connection id> --yes",
  "",
  "A value left out is read from .env: TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, DISCORD_BOT_TOKEN,",
  "DISCORD_GUILD_ID, SLACK_BOT_TOKEN, SLACK_APP_TOKEN, SLACK_WORKSPACE_ID.",
].join("\n");

export const DEFAULT_CONNECTION_NAME: Record<ConnectPlatform, string> = {
  telegram: "Ferri Telegram",
  discord: "Ferri Discord",
  slack: "Ferri Slack",
};

/** `--key value` and `--key=value` flags, plus the words that are not flags. */
export function parseCliFlags(argv: string[]): { words: string[]; flags: Record<string, string | true> } {
  const words: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) {
      words.push(a);
      continue;
    }
    const eq = a.indexOf("=");
    if (eq > 0) flags[a.slice(2, eq)] = a.slice(eq + 1);
    else if (argv[i + 1] !== undefined && !argv[i + 1]!.startsWith("--")) flags[a.slice(2)] = argv[++i]!;
    else flags[a.slice(2)] = true;
  }
  return { words, flags };
}

/** The command from the arguments, with .env filling what the flags leave out. Throws with what to fix. */
export function parseConnectArgs(argv: string[], env: Env = {}): ConnectCommand {
  const { words, flags } = parseCliFlags(argv);
  const str = (k: string) => (typeof flags[k] === "string" ? (flags[k] as string).trim() : "");
  const pick = (k: string, envKey: string) => str(k) || env[envKey]?.trim() || "";
  const what = words[0]?.toLowerCase();
  if (!what || what === "help" || flags.help) return { action: "help" };
  if (what === "list") return { action: "list" };
  if (what === "remove") {
    const id = words[1];
    if (!id) throw new Error("Say which connection to remove: connect remove <connection id> (see connect list).");
    return { action: "remove", id, yes: flags.yes === true || flags.y === true };
  }
  if (what === "telegram") {
    const token = pick("token", "TELEGRAM_BOT_TOKEN");
    if (!token) throw new Error("No bot token. Get one from @BotFather (/newbot), then: connect telegram --token <bot token>");
    if (!/^\d+:[\w-]{20,}$/.test(token)) throw new Error("That does not look like a Telegram bot token (it looks like 123456789:AA...). Copy it again from @BotFather.");
    return { action: "connect", platform: "telegram", token, username: pick("username", "TELEGRAM_BOT_USERNAME").replace(/^@/, "") || null, name: str("name") || DEFAULT_CONNECTION_NAME.telegram };
  }
  if (what === "discord") {
    const token = pick("token", "DISCORD_BOT_TOKEN");
    const guild = pick("guild", "DISCORD_GUILD_ID");
    if (!token) throw new Error("No bot token. In the Discord Developer Portal, open your app, then Bot, then Reset Token: connect discord --token <bot token> --guild <server id>");
    if (!guild) throw new Error("No server id. In Discord, turn on Developer Mode, right-click your server, Copy Server ID: connect discord --token <bot token> --guild <server id>");
    if (!/^\d{15,22}$/.test(guild)) throw new Error(`"${guild}" is not a Discord server id (it is a long number). Right-click the server, Copy Server ID.`);
    return { action: "connect", platform: "discord", token, guild, name: str("name") || DEFAULT_CONNECTION_NAME.discord };
  }
  if (what === "slack") {
    const botToken = pick("bot-token", "SLACK_BOT_TOKEN");
    const appToken = pick("app-token", "SLACK_APP_TOKEN");
    if (!botToken || !appToken) {
      throw new Error("Slack needs two tokens: connect slack --bot-token xoxb-... --app-token xapp-... (OAuth & Permissions has the bot token; Basic Information, App-Level Tokens, with connections:write, has the app token).");
    }
    if (!botToken.startsWith("xoxb-")) throw new Error("The bot token starts with xoxb-. Copy it from OAuth & Permissions in your Slack app.");
    if (!appToken.startsWith("xapp-")) throw new Error("The app token starts with xapp-. Make one in Basic Information, App-Level Tokens, with the connections:write scope.");
    return { action: "connect", platform: "slack", botToken, appToken, workspace: pick("workspace", "SLACK_WORKSPACE_ID") || null, name: str("name") || DEFAULT_CONNECTION_NAME.slack };
  }
  throw new Error(`Unknown platform "${words[0]}". Use telegram, discord or slack (WhatsApp: whatsapp:pair).`);
}

export interface TelegramBot {
  id: number;
  username: string;
  firstName: string;
  canJoinGroups: boolean;
  canReadAllGroupMessages: boolean;
}

/** Telegram's getMe: the bot's username and whether it can read group chats. */
export async function checkTelegramToken(token: string, f: typeof fetch = fetch, timeoutMs = 8000): Promise<TelegramBot> {
  let res: Response;
  try {
    res = await f(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new Error(`Cannot reach Telegram: ${(e as Error).message}. Check the internet connection.`);
  }
  const body = (await res.json().catch(() => null)) as {
    ok?: boolean;
    description?: string;
    result?: { id: number; username: string; first_name: string; can_join_groups?: boolean; can_read_all_group_messages?: boolean };
  } | null;
  if (!body?.ok || !body.result) {
    throw new Error(`Telegram refused the token (${body?.description ?? `HTTP ${res.status}`}). Copy it again from @BotFather, or send /revoke there for a new one.`);
  }
  const r = body.result;
  return { id: r.id, username: r.username, firstName: r.first_name, canJoinGroups: r.can_join_groups !== false, canReadAllGroupMessages: r.can_read_all_group_messages === true };
}

export interface DiscordBot {
  id: string;
  username: string;
  /** The server's name when the bot is already in it; null when it is not (yet). */
  guildName: string | null;
}

/** The bit Switch's Discord app asks for (core/switch_core/bridges/collaboration/discord/install.py). */
export const DISCORD_PERMISSIONS = [10, 11, 35, 38, 29, 4, 28, 16, 15, 6].reduce((n, bit) => n + 2 ** bit, 0);

export const discordInviteUrl = (appId: string) =>
  `https://discord.com/oauth2/authorize?client_id=${appId}&scope=bot+applications.commands&permissions=${DISCORD_PERMISSIONS}`;

/** Discord's users/@me with the bot token, then whether the bot is in the server. */
export async function checkDiscordToken(token: string, guild: string, f: typeof fetch = fetch, timeoutMs = 8000): Promise<DiscordBot> {
  const headers = { authorization: `Bot ${token}` };
  let me: Response;
  try {
    me = await f("https://discord.com/api/v10/users/@me", { headers, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new Error(`Cannot reach Discord: ${(e as Error).message}. Check the internet connection.`);
  }
  if (me.status === 401) throw new Error("Discord refused the bot token. In the Developer Portal, open your app, then Bot, then Reset Token, and use the new one.");
  if (!me.ok) throw new Error(`Discord answered HTTP ${me.status} for the bot token. Try again in a minute.`);
  const user = (await me.json()) as { id: string; username: string; bot?: boolean };
  if (user.bot === false) throw new Error("That is a user token, not a bot token. Use the token from your app's Bot page.");
  let guildName: string | null = null;
  try {
    const g = await f(`https://discord.com/api/v10/guilds/${guild}`, { headers, signal: AbortSignal.timeout(timeoutMs) });
    if (g.ok) guildName = ((await g.json()) as { name: string }).name;
  } catch {
    // Not knowing is fine: the warning below covers it.
  }
  return { id: user.id, username: user.username, guildName };
}

/** An existing connection of this platform with this display name (case does not matter). */
export function findConnection(bridges: BridgeInfo[], type: string, name: string): BridgeInfo | null {
  return bridges.find((b) => b.bridge_type === type && b.display_name.trim().toLowerCase() === name.trim().toLowerCase()) ?? null;
}

/** What a person does next, after the connection exists. */
export function connectNextSteps(platform: ConnectPlatform, bot: string | null): string[] {
  const where = { telegram: "group", discord: "channel", slack: "channel" }[platform];
  const add = {
    telegram: `Add ${bot ? `@${bot}` : "the bot"} to your Telegram group. A group becomes a room when the bot lands in it.`,
    discord: "Post any message in a channel the bot can see. A channel becomes a room on its first message.",
    slack: `Invite the app to a channel: /invite @${bot ?? "your app"}. A channel becomes a room when the app joins.`,
  }[platform];
  return [
    "Next:",
    `  1. ${add}`,
    `  2. In that ${where}, type: !invite-agent @ferri`,
    "  3. In Desk, open Spaces and attach the new space to your event (Listen, Approve or Auto).",
    "  Check it any time with the doctor.",
  ];
}

export interface ConnectResult {
  ok: boolean;
  lines: string[];
  bridge?: BridgeInfo;
}

/** Validate the credentials, then create the connection unless one with the same name exists. */
export async function connectPlatform(
  cmd: Extract<ConnectCommand, { action: "connect" }>,
  deps: { gateway: Pick<GatewayClient, "call">; fetch?: typeof fetch },
): Promise<ConnectResult> {
  const f = deps.fetch ?? fetch;
  const lines: string[] = [];
  const bridges = await deps.gateway.call<BridgeInfo[]>("GET", "/gateway/collaborations");
  const existing = findConnection(bridges, cmd.platform, cmd.name);
  const others = bridges.filter((b) => b.bridge_type === cmd.platform && b !== existing);

  let config: Record<string, unknown>;
  let bot: string | null = null;
  if (cmd.platform === "telegram") {
    const me = await checkTelegramToken(cmd.token, f);
    bot = me.username;
    if (cmd.username && cmd.username.toLowerCase() !== me.username.toLowerCase()) {
      lines.push(`Note: the token belongs to @${me.username}, not @${cmd.username}. Using @${me.username}.`);
    }
    lines.push(`Token works: @${me.username} (${me.firstName}).`);
    if (!me.canReadAllGroupMessages) {
      lines.push(
        "Warning: Group Privacy is on, so the bot only sees messages aimed at it. Turn Group Privacy off in BotFather (/mybots, your bot, Bot Settings, Group Privacy, Turn off), then remove and re-add the bot to any group it is already in.",
      );
    }
    if (!me.canJoinGroups) lines.push("Warning: the bot cannot join groups. In BotFather: /mybots, your bot, Bot Settings, Allow Groups, Turn on.");
    config = { bot_token: cmd.token, bot_username: me.username };
  } else if (cmd.platform === "discord") {
    const me = await checkDiscordToken(cmd.token, cmd.guild, f);
    bot = me.username;
    lines.push(`Token works: ${me.username} (${me.id}).`);
    if (me.guildName) lines.push(`The bot is in the server "${me.guildName}".`);
    else lines.push(`Warning: the bot is not in server ${cmd.guild} yet. Invite it: ${discordInviteUrl(me.id)}`);
    lines.push("Make sure the bot has Server Members Intent and Message Content Intent on (Developer Portal, Bot, Privileged Gateway Intents).");
    config = { bot_token: cmd.token, guild_id: cmd.guild };
  } else {
    let checked: { workspace_id: string; workspace_name: string; bot_name: string };
    try {
      checked = await deps.gateway.call("POST", "/gateway/collaborations/setup/slack/check", { bot_token: cmd.botToken, app_token: cmd.appToken });
    } catch (e) {
      throw new Error(`Slack refused the tokens: ${gatewayDetail(e)}`);
    }
    bot = checked.bot_name;
    lines.push(`Tokens work: ${checked.bot_name} in ${checked.workspace_name} (${checked.workspace_id}).`);
    if (cmd.workspace && cmd.workspace !== checked.workspace_id) lines.push(`Note: the tokens are for ${checked.workspace_id}, not ${cmd.workspace}. Using ${checked.workspace_id}.`);
    config = { bot_token: cmd.botToken, app_token: cmd.appToken, workspace_id: checked.workspace_id };
  }

  if (existing) {
    lines.push(`Already connected: "${existing.display_name}" (${existing.bridge_id}). Nothing changed.`);
    lines.push(`To replace it: connect remove ${existing.bridge_id} --yes, then connect ${cmd.platform} again.`);
    return { ok: true, lines: [...lines, "", ...connectNextSteps(cmd.platform, bot)], bridge: existing };
  }
  if (others.length) {
    lines.push(`Note: Switch already has ${others.length} other ${cmd.platform} connection${others.length === 1 ? "" : "s"} (${others.map((b) => `"${b.display_name}"`).join(", ")}). Two connections must not share one bot.`);
  }

  let created: BridgeInfo;
  try {
    created = await deps.gateway.call<BridgeInfo>("POST", "/gateway/collaborations", { bridge_type: cmd.platform, display_name: cmd.name, connection_config: config });
  } catch (e) {
    throw new Error(`Switch did not add the connection: ${gatewayDetail(e)}`);
  }
  lines.push(`Connected: "${created.display_name}" (${created.bridge_id}).`);
  return { ok: true, lines: [...lines, "", ...connectNextSteps(cmd.platform, bot)], bridge: created };
}

/** The connections as a short table. */
export function formatBridges(bridges: BridgeInfo[]): string {
  if (!bridges.length) return "No connections in Switch yet.";
  const rows = bridges.map((b) => [b.bridge_id, b.bridge_type, b.display_name, typeof b.room_count === "number" ? `${b.room_count} rooms` : "", b.attention ? `needs attention: ${b.attention}` : (b.status ?? "")]);
  const widths = rows[0]!.map((_, i) => Math.max(...rows.map((r) => r[i]!.length)));
  return rows.map((r) => r.map((c, i) => c.padEnd(widths[i]!)).join("  ").trimEnd()).join("\n");
}

/** Switch's own words from a Gateway error ({"detail": "..."}), else the message. */
export function gatewayDetail(e: unknown): string {
  const body = (e as { body?: string }).body;
  if (body) {
    try {
      const d = (JSON.parse(body) as { detail?: unknown }).detail;
      if (typeof d === "string") return d;
      if (Array.isArray(d)) return d.map((x) => (x as { msg?: string }).msg ?? JSON.stringify(x)).join("; ");
    } catch {
      return body.slice(0, 300);
    }
  }
  return (e as Error).message;
}
