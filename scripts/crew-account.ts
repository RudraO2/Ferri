/**
 * Give a crew member a Switch account for Ferri Pocket and link it.
 *
 *   pnpm crew:account <crew name> <email> [password]
 *
 * Creates the account through the Gateway admin API (`POST /gateway/users`)
 * unless it exists, then sets the crew member's `handles.switch` to the email.
 * Without a password one is generated and saved in .env as CREW_<NAME>_PASSWORD.
 */
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { createDb, crewMembers } from "@ferri/db";
import { findCommunity, linkCrewAccount } from "@ferri/knowledge";
import { GatewayError, gatewayFromEnv } from "@ferri/switch";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [name, email, given] = process.argv.slice(2);
if (!name || !email) {
  console.error("usage: pnpm crew:account <crew name> <email> [password]");
  process.exit(1);
}

const { db, close } = createDb();
try {
  const community = await findCommunity(db, process.env.FERRI_COMMUNITY || undefined);
  if (!community) throw new Error("no community: run `pnpm kb seed` first");
  const members = (await db.select().from(crewMembers).where(eq(crewMembers.communityId, community.id))).filter(
    (m) => m.name.toLowerCase() === name.toLowerCase(),
  );
  if (!members.length) throw new Error(`no crew member named ${name}`);

  const gateway = await gatewayFromEnv(path.join(root, "..", "switch", ".env"));
  if (!gateway) throw new Error("no Switch admin password (SWITCH_ADMIN_PASSWORD or ../switch/.env)");
  const users = await gateway.call<{ id: string; email: string }[]>("GET", "/gateway/users");
  if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    console.log(`Switch account ${email} exists; linking it.`);
  } else {
    const password = given || randomBytes(9).toString("base64url");
    try {
      await gateway.call("POST", "/gateway/users", { name: members[0]!.name, email, password, role: "user" });
    } catch (err) {
      if (!(err instanceof GatewayError && err.status === 409)) throw err;
    }
    if (!given) {
      const key = `CREW_${members[0]!.name.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_PASSWORD`;
      const envPath = path.join(root, ".env");
      let text = fs.readFileSync(envPath, "utf8");
      const re = new RegExp(`^${key}=.*$`, "m");
      text = re.test(text) ? text.replace(re, `${key}=${password}`) : `${text.trimEnd()}\n${key}=${password}\n`;
      fs.writeFileSync(envPath, text);
      console.log(`Created Switch account ${email}. Password saved in .env as ${key}.`);
    } else {
      console.log(`Created Switch account ${email}.`);
    }
  }
  const linked = await linkCrewAccount(db, { communityId: community.id, crewMemberId: members[0]!.id, email });
  console.log(`Linked ${members[0]!.name} (${linked.length} crew row${linked.length === 1 ? "" : "s"}) to ${email}. They can sign in to Pocket at /m.`);
} finally {
  await close();
}
