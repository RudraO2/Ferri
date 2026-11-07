/**
 * Connect Ferri to a chat platform through Switch in one command (spec 23).
 *
 *   pnpm connect telegram --token <bot token> [--username <bot username>] [--name <display name>]
 *   pnpm connect discord --token <bot token> --guild <server id> [--name <display name>]
 *   pnpm connect slack --bot-token xoxb-... --app-token xapp-... [--workspace T...] [--name <display name>]
 *   pnpm connect list
 *   pnpm connect remove <connection id> --yes
 *
 * In Docker: ./ferri connect ... . Values left out come from .env (TELEGRAM_BOT_TOKEN, ...).
 * Safe to re-run: a connection of that platform with the same name is reported, not duplicated.
 */
import fs from "node:fs";
import path from "node:path";
import { CONNECT_USAGE, connectPlatform, formatBridges, gatewayDetail, parseConnectArgs, type BridgeInfo } from "@ferri/knowledge";
import { GatewayClient } from "@ferri/switch";

const root = path.resolve(import.meta.dirname, "..");
const env: Record<string, string | undefined> = { ...process.env };
if (!env.SWITCH_ADMIN_PASSWORD) {
  // Silent fallback that exists today: a Switch checkout next to this repo.
  const sibling = path.join(root, "..", "switch", ".env");
  if (fs.existsSync(sibling)) {
    const pw = /^GATEWAY_ADMIN_PASSWORD=(.*)$/m.exec(fs.readFileSync(sibling, "utf8"))?.[1]?.trim();
    if (pw) env.SWITCH_ADMIN_PASSWORD = pw;
  }
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

let cmd;
try {
  cmd = parseConnectArgs(process.argv.slice(2), env);
} catch (e) {
  fail(`${(e as Error).message}\n\n${CONNECT_USAGE}`);
}
if (cmd.action === "help") {
  console.log(CONNECT_USAGE);
  process.exit(0);
}

const switchUrl = (env.SWITCH_URL ?? "http://localhost:8000").replace(/\/+$/, "");
if (!env.SWITCH_ADMIN_PASSWORD) fail("SWITCH_ADMIN_PASSWORD is not set. Put it in .env (the same value as GATEWAY_ADMIN_PASSWORD).");
const gateway = new GatewayClient(switchUrl, env.SWITCH_ADMIN_EMAIL || "admin@switch.local", env.SWITCH_ADMIN_PASSWORD, { timeoutMs: 20_000 });
try {
  await gateway.login();
} catch (e) {
  const m = (e as Error).message;
  fail(
    /fetch failed|ECONNREFUSED|TimeoutError|aborted/i.test(`${m} ${(e as Error).name}`)
      ? `Switch is not reachable at ${switchUrl}. Start the stack (./ferri up), or set SWITCH_URL in .env.`
      : `Switch admin sign-in failed: ${m}. Check SWITCH_ADMIN_EMAIL and SWITCH_ADMIN_PASSWORD in .env.`,
  );
}

try {
  if (cmd.action === "list") {
    console.log(formatBridges(await gateway.call<BridgeInfo[]>("GET", "/gateway/collaborations")));
  } else if (cmd.action === "remove") {
    const bridges = await gateway.call<BridgeInfo[]>("GET", "/gateway/collaborations");
    const b = bridges.find((x) => x.bridge_id === cmd.id);
    if (!b) fail(`No connection with id ${cmd.id}. See: connect list`);
    if (!cmd.yes) {
      fail(
        `This removes "${b.display_name}" (${b.bridge_type}) and every Switch room on it` +
          `${typeof b.room_count === "number" ? ` (${b.room_count})` : ""}. The chats on the platform stay.\n` +
          `To go ahead: connect remove ${b.bridge_id} --yes`,
      );
    }
    await gateway.call("DELETE", `/gateway/collaborations/${encodeURIComponent(b.bridge_id)}`);
    console.log(`Removed "${b.display_name}" (${b.bridge_id}).`);
  } else {
    const result = await connectPlatform(cmd, { gateway });
    console.log(result.lines.join("\n"));
  }
} catch (e) {
  fail(e instanceof Error && "body" in e ? `Switch refused it: ${gatewayDetail(e)}` : (e as Error).message);
}
