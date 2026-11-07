/**
 * Spaces from the command line (the same as Desk's Spaces page):
 *   pnpm space list                                   every room Ferri is in, and what it is attached to
 *   pnpm space attach "<space name>" [--mode auto|approve|listen] [--crew] [--event <slug>]
 *   pnpm space detach "<space name>"
 *
 * Space names are as Desk shows them, e.g. "Lantern Labs Discord: build-night" or "ferri-lab".
 * Inside the Docker stack: ./ferri space list
 */
import { and, eq, isNull } from "drizzle-orm";
import { createDb, eventSpaces, events, runMigrations, spaces } from "@ferri/db";
import { attachSpace, bridgeTypesFrom, detachSpace, discoverSpaces, findCommunity } from "@ferri/knowledge";
import { SwitchAgent, gatewayFromEnv } from "@ferri/switch";

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};
const name = rest.find((a, i) => !a.startsWith("--") && !rest[i - 1]?.startsWith("--mode") && !rest[i - 1]?.startsWith("--event"));

await runMigrations();
const { db, close } = createDb();
try {
  const community = await findCommunity(db, process.env.FERRI_COMMUNITY);
  if (!community) throw new Error("No community yet: run `./ferri up` (or `pnpm kb seed`) first.");

  // Find rooms Ferri joined since it last looked.
  if (process.env.FERRI_AGENT_ID && process.env.FERRI_AGENT_KEY) {
    const agent = new SwitchAgent({
      baseUrl: process.env.SWITCH_URL ?? "http://localhost:8800",
      agentId: process.env.FERRI_AGENT_ID,
      apiKey: process.env.FERRI_AGENT_KEY,
      connectionId: "",
    });
    const gw = await gatewayFromEnv();
    await discoverSpaces(db, agent, community.id, new Map(), gw ? bridgeTypesFrom(() => gw.bridges()) : undefined);
  }

  const all = await db.select().from(spaces).where(and(eq(spaces.communityId, community.id), eq(spaces.archived, false)));
  const links = await db
    .select({ spaceId: eventSpaces.spaceId, mode: eventSpaces.mode, role: eventSpaces.role, event: events.name, slug: events.slug })
    .from(eventSpaces)
    .innerJoin(events, eq(events.id, eventSpaces.eventId));

  if (!cmd || cmd === "list") {
    for (const s of all) {
      const l = links.filter((x) => x.spaceId === s.id);
      const what = l.length ? l.map((x) => `${x.event}: ${x.role === "crew" ? "crew room" : x.mode}`).join("; ") : "Off";
      console.log(`${s.name.padEnd(44)} ${(s.platform ?? "").padEnd(11)} ${what}`);
    }
  } else if (cmd === "attach" || cmd === "detach") {
    if (!name) throw new Error(`usage: space ${cmd} "<space name>"`);
    const space = all.find((s) => s.name === name) ?? all.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (!space) throw new Error(`No space named "${name}". \`space list\` shows them (a new chat appears after its first message).`);
    if (cmd === "detach") {
      await detachSpace(db, space.id);
      console.log(`${space.name}: Off`);
    } else {
      const slug = flag("event");
      const open = await db.select().from(events).where(and(eq(events.communityId, community.id), isNull(events.closedAt)));
      const event = slug ? open.find((e) => e.slug === slug) : open[0];
      if (!event) throw new Error(slug ? `No live event "${slug}".` : "No live event.");
      const crew = rest.includes("--crew");
      const mode = (flag("mode") ?? (crew ? "auto" : "auto")) as "auto" | "approve" | "listen";
      if (!["auto", "approve", "listen"].includes(mode)) throw new Error("--mode is auto, approve or listen.");
      await attachSpace(db, { spaceId: space.id, eventId: event.id, mode, role: crew ? "crew" : "members", by: "cli" });
      console.log(`${space.name}: ${event.name}, ${crew ? "crew room" : mode}`);
    }
  } else {
    throw new Error("usage: space list | attach <name> [--mode m] [--crew] [--event slug] | detach <name>");
  }
} finally {
  await close();
}
