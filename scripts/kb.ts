/**
 * Knowledge base command line.
 *   pnpm kb seed [dir] [--no-mirror]   load markdown into the database (idempotent), then mirror to Switch
 *   pnpm kb list                       live entries
 *   pnpm kb search <words...>          full text search
 *   pnpm kb ask "<question>" [--room] [--search]
 *                                      run the answer pipeline without Switch (--room: as if asked to the room,
 *                                      not to Ferri; --search: force full text retrieval, as for a big knowledge base)
 *   pnpm kb mirror                     update the Switch library document
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb, runMigrations } from "@ferri/db";
import {
  answerQuestion,
  applySeedSpaces,
  attachedRoomIds,
  bridgeTypesFrom,
  discoverSpaces,
  loadLiveKnowledge,
  loadSkills,
  mirrorToSwitch,
  modelsFromEnv,
  searchKnowledge,
  seedFromDirectory,
  triageMessage,
  worthAnswering,
} from "@ferri/knowledge";
import { SwitchAgent, gatewayFromEnv } from "@ferri/switch";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [cmd, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith("--")));
const args = rest.filter((a) => !a.startsWith("--"));

await runMigrations();
const { db, close } = createDb();

/** A Switch agent client for one-off ops (no live connection). */
function switchAgent(): SwitchAgent | null {
  const agentId = process.env.FERRI_AGENT_ID;
  const apiKey = process.env.FERRI_AGENT_KEY;
  if (!agentId || !apiKey) return null;
  return new SwitchAgent({ baseUrl: process.env.SWITCH_URL ?? "http://localhost:8000", agentId, apiKey, connectionId: "" });
}

async function mirror(): Promise<void> {
  const gateway = await gatewayFromEnv(path.join(root, "..", "switch", ".env"));
  const kb = await loadLiveKnowledge(db, process.env.FERRI_COMMUNITY);
  if (!kb) throw new Error("no community in the database; run `pnpm kb seed` first");
  const roomIds = await attachedRoomIds(db, kb.community.id);
  if (!gateway || !roomIds.length) {
    console.log("mirror skipped: no Switch admin password, or no space attached to an event yet");
    return;
  }
  const r = await mirrorToSwitch({ db, gateway, kb, roomIds });
  console.log(`mirror: ${r.created ? "created" : "updated"} document ${r.documentId} (${r.bytes} bytes), attached to ${r.attached.length} room(s)`);
}

try {
  switch (cmd) {
    case "seed": {
      const dir = path.resolve(root, args[0] ?? "seed");
      const r = await seedFromDirectory(db, dir);
      console.log(
        `seeded ${r.communitySlug} (events: ${r.events.join(", ") || "none"}): ` +
          `${r.crew} crew, ${r.created} created, ${r.updated} updated, ${r.restored} restored, ${r.archived} archived, ${r.unchanged} unchanged` +
          (r.kept ? `, ${r.kept} kept (edited in Desk)` : ""),
      );
      if (r.keptFromDesk.length) console.log(`kept from Desk: ${r.keptFromDesk.join(", ")}`);
      // Spaces: find the rooms Ferri is in, then attach the ones event.yaml names.
      const agent = switchAgent();
      if (agent) {
        const gw = await gatewayFromEnv(path.join(root, "..", "switch", ".env"));
        const d = await discoverSpaces(db, agent, r.communityId, new Map(), gw ? bridgeTypesFrom(() => gw.bridges()) : undefined);
        console.log(`spaces: ${d.rooms} room(s) Ferri is in${d.added.length ? `; new (Off): ${d.added.join(", ")}` : ""}`);
        for (const line of await applySeedSpaces(db, r.spaceRequests)) console.log(`  ${line}`);
      } else if (r.spaceRequests.length) {
        console.log("spaces skipped: FERRI_AGENT_ID / FERRI_AGENT_KEY not set (run `pnpm setup:switch`)");
      }
      if (!flags.has("--no-mirror")) await mirror();
      break;
    }
    case "list": {
      const kb = await loadLiveKnowledge(db, process.env.FERRI_COMMUNITY);
      if (!kb) throw new Error("no community yet");
      console.log(`${kb.community.name}: ${kb.entries.length} live entries; events: ${kb.events.map((e) => `${e.name} [${e.stage}]`).join(", ")}`);
      for (const e of kb.entries) console.log(`  v${e.version} ${e.key}  (${e.eventName ?? "community"}) ${e.sourceTitle} > ${e.heading}`);
      break;
    }
    case "search": {
      const kb = await loadLiveKnowledge(db, process.env.FERRI_COMMUNITY);
      if (!kb) throw new Error("no community yet");
      for (const e of await searchKnowledge(db, kb, args)) console.log(`  ${e.key}  ${e.sourceTitle} > ${e.heading}`);
      break;
    }
    case "ask": {
      const question = args.join(" ");
      if (!question) throw new Error('usage: pnpm kb ask "<question>" [--room]');
      const kb = await loadLiveKnowledge(db, process.env.FERRI_COMMUNITY);
      if (!kb) throw new Error("no community yet");
      const models = modelsFromEnv();
      const addressed = !flags.has("--room");
      const search = flags.has("--search");
      let searchTerms: string[] | undefined;
      if (!addressed || search) {
        const t = await triageMessage({ choice: models.fast, roomName: "cli", sender: "tester", message: question, before: [] });
        console.log(`triage (${t.model}, ${t.latencyMs} ms):`, JSON.stringify(t.triage));
        searchTerms = t.triage?.search_terms;
        if (!addressed && (!t.triage || !worthAnswering(t.triage))) {
          console.log("=> Ferri stays quiet");
          break;
        }
      }
      const r = await answerQuestion({
        db,
        kb,
        choice: models.main,
        skills: loadSkills(path.join(root, "skills"), ["ferri", "librarian"]),
        roomName: "cli",
        sender: "tester",
        question,
        history: [],
        addressed,
        searchTerms,
        inlineLimit: search ? 0 : undefined,
      });
      console.log(
        `kind=${r.kind} retrieval=${r.retrieval} model=${r.model} ${r.latencyMs} ms ` +
          `tokens in=${r.usage.input} out=${r.usage.output} cache_read=${r.usage.cacheRead} cache_write=${r.usage.cacheWrite}` +
          (r.downgraded ? " DOWNGRADED" : "") +
          (r.missing ? ` missing="${r.missing}"` : ""),
      );
      console.log(`---\n${r.text}\n---`);
      break;
    }
    case "mirror":
      await mirror();
      break;
    default:
      console.log("usage: pnpm kb seed [dir] [--no-mirror] | list | search <words...> | ask \"<question>\" [--room] [--search] | mirror");
  }
} finally {
  await close();
}
