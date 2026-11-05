/**
 * Answer eval: runs the real triage and answer calls against the seeded demo
 * knowledge and checks Ferri's decisions (answer or not, which source, quiet
 * or not). Uses FERRI_MODEL_MAIN / FERRI_MODEL_FAST from .env: keep both on
 * claude-haiku-5-5 at low effort for tests.
 *
 *   pnpm kb seed && pnpm eval:answers
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "@ferri/db";
import {
  answerQuestion,
  cardsAnsweredBy,
  crewIntent,
  loadLiveKnowledge,
  loadSkills,
  modelsFromEnv,
  prepareCard,
  triageMessage,
  worthAnswering,
  type ChatLine,
  type OpenCard,
} from "@ferri/knowledge";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

interface AnswerCase {
  q: string;
  kind: "answer" | "unknown" | "chat";
  /** Every listed key fragment must be among the cited entry keys. */
  cites?: string[];
  /** A partial answer: the model must name what is missing. */
  missing?: boolean;
}

interface RoomCase {
  q: string;
  worth: boolean;
  after?: ChatLine[];
}

const answers: AnswerCase[] = [
  { q: "what time is lunch?", kind: "answer", cites: ["#food"] },
  { q: "when does hacking start?", kind: "answer", cites: ["schedule.md#saturday"] },
  { q: "what's the wifi password", kind: "answer", cites: ["#wi-fi"] },
  { q: "how big can teams be?", kind: "answer", cites: ["#teams"] },
  { q: "what are the prizes?", kind: "answer", cites: ["#prizes"] },
  { q: "which metro station is closest to the venue?", kind: "answer", cites: ["#getting-there"] },
  { q: "khana veg hai kya?", kind: "answer", cites: ["#food"] },
  { q: "how do I report harassment?", kind: "answer", cites: ["#reporting-a-problem"] },
  { q: "registration kab tak open hai?", kind: "answer", cites: ["#registration"] },
  { q: "what time is lunch, and is there parking?", kind: "answer", cites: ["#food"], missing: true },
  { q: "is there parking for bikes?", kind: "unknown" },
  { q: "can I bring my dog?", kind: "unknown" },
  { q: "is there a hotel discount for participants?", kind: "unknown" },
  { q: "who won last year's hackathon?", kind: "unknown" },
  { q: "hi ferri, thanks for the help earlier!", kind: "chat" },
];

const room: RoomCase[] = [
  { q: "does anyone know the wifi password?", worth: true },
  { q: "when do submissions close?", worth: true },
  { q: "kya photo ID chahiye?", worth: true },
  { q: "anyone want to grab chai after?", worth: false },
  { q: "how was everyone's weekend?", worth: false },
  { q: "lol this is so fun", worth: false },
  { q: "can someone review my PR?", worth: false },
  { q: "what time is dinner?", worth: false, after: [{ sender: "Priya", body: "8:30 pm, same hall as lunch" }] },
  { q: "what time is dinner?", worth: true, after: [{ sender: "Arjun", body: "no idea, same question" }] },
];

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

const { db, close } = createDb();
try {
  const live = await loadLiveKnowledge(db, process.env.FERRI_COMMUNITY);
  if (!live) throw new Error("no community; run `pnpm kb seed` first");
  // Judge against the seeded knowledge only: what the crew taught Ferri in live tests would change the expected answers.
  const kb = { ...live, entries: live.entries.filter((e) => e.sourceKind === "markdown") };
  const models = modelsFromEnv();
  const skills = loadSkills(path.join(root, "skills"), ["ferri", "librarian"]);
  console.log(`answers: ${models.main.model}/${models.main.effort}, triage: ${models.fast.model}/${models.fast.effort}`);
  if (/sonnet|opus/.test(models.main.model + models.fast.model)) {
    console.log("warning: tests should run on claude-haiku-5-5 (set FERRI_MODEL_MAIN in .env)");
  }

  let failed = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  let cacheRead = 0;

  const a = await pool(answers, 4, async (c) => {
    const r = await answerQuestion({
      db,
      kb,
      choice: models.main,
      skills,
      roomName: "eval",
      sender: "tester",
      question: c.q,
      history: [],
      addressed: true,
    });
    tokensIn += r.usage.input + r.usage.cacheWrite;
    tokensOut += r.usage.output;
    cacheRead += r.usage.cacheRead;
    const keys = r.sources.map((s) => s.key);
    const problems: string[] = [];
    if (r.kind !== c.kind) problems.push(`kind ${r.kind}, expected ${c.kind}`);
    for (const frag of c.cites ?? []) if (!keys.some((k) => k.includes(frag))) problems.push(`no citation of ${frag}`);
    if (c.missing && !r.missing) problems.push("missing part not named");
    return { c, r, keys, problems };
  });
  console.log("\nanswers");
  for (const { c, r, keys, problems } of a) {
    if (problems.length) failed++;
    console.log(`${problems.length ? "FAIL" : "ok  "} ${c.q}`);
    console.log(`      ${r.kind} [${keys.join(", ")}]${r.missing ? ` missing="${r.missing}"` : ""} :: ${r.text.replace(/\n+/g, " | ")}`);
    for (const p of problems) console.log(`      -> ${p}`);
  }

  const t = await pool(room, 4, async (c) => {
    const out = await triageMessage({
      choice: models.fast,
      roomName: "eval",
      sender: "Meera",
      message: c.q,
      before: [],
      after: c.after,
    });
    tokensIn += out.usage.input + out.usage.cacheWrite;
    tokensOut += out.usage.output;
    cacheRead += out.usage.cacheRead;
    const worth = out.triage ? worthAnswering(out.triage) : null;
    return { c, triage: out.triage, ok: worth === c.worth };
  });
  console.log("\nroom triage");
  for (const { c, triage, ok } of t) {
    if (!ok) failed++;
    const tag = c.after ? ` (after: ${c.after.map((l) => l.body).join(" / ")})` : "";
    console.log(`${ok ? "ok  " : "FAIL"} ${c.q}${tag}`);
    console.log(`      expected ${c.worth ? "answer" : "quiet"}; triage ${JSON.stringify(triage)}`);
  }

  // ── Spec 03: card matching, crew intent, facts that answer cards ────────

  const card = (id: string, topic: string, question: string, personal = false): OpenCard => ({
    id,
    eventId: null,
    topic,
    question,
    personal,
    crewRoomId: "eval",
  });
  const openCards = [
    card("parking", "venue", "Is there parking for bikes at the venue?"),
    card("dogs", "rules", "Can attendees bring dogs to the event?"),
    card("arjun-reg", "registration", "Is Arjun's registration confirmed?", true),
  ];

  const prepCases: { q: string; joins: string | null; personal?: boolean }[] = [
    { q: "where can I park my scooter?", joins: "parking" },
    { q: "are pets allowed? I have a small dog", joins: "dogs" },
    { q: "is there car parking?", joins: null },
    { q: "can I bring my cat?", joins: null },
    { q: "is my registration confirmed? I'm Meera", joins: null, personal: true },
    { q: "is there a hotel discount for participants?", joins: null, personal: false },
  ];
  const p = await pool(prepCases, 4, async (c) => {
    const r = await prepareCard({ choice: models.fast, question: c.q, asker: "tester", open: openCards });
    tokensIn += r.usage.input + r.usage.cacheWrite;
    tokensOut += r.usage.output;
    cacheRead += r.usage.cacheRead;
    const problems: string[] = [];
    if (!r.prep) problems.push("no output");
    if ((r.joins?.id ?? null) !== c.joins) problems.push(`joined ${r.joins?.id ?? "nothing"}, expected ${c.joins ?? "nothing"}`);
    if (c.personal !== undefined && r.prep?.personal !== c.personal) problems.push(`personal ${r.prep?.personal}, expected ${c.personal}`);
    return { c, r, problems };
  });
  console.log("\ncard prep");
  for (const { c, r, problems } of p) {
    if (problems.length) failed++;
    console.log(`${problems.length ? "FAIL" : "ok  "} ${c.q}`);
    console.log(`      ${JSON.stringify(r.prep)}`);
    for (const x of problems) console.log(`      -> ${x}`);
  }

  const intentCards = [openCards[0]!, card("lockers", "venue", "Are there lockers at the venue?")];
  const intentCases: { msg: string; intent: string; card?: string; facts?: number }[] = [
    { msg: "@ferri bike parking is in the basement, enter from the back lane", intent: "answer_card", card: "parking" },
    { msg: "@ferri tell them yes, free lockers on the 2nd floor", intent: "answer_card", card: "lockers" },
    { msg: "@ferri remember: the quiet room closes at 7 AM on Sunday", intent: "remember", facts: 1 },
    { msg: "@ferri lockers are on the 2nd floor. Also lunch moves to 2 PM on Saturday", intent: "answer_card", card: "lockers", facts: 1 },
    { msg: "@ferri what time is lunch?", intent: "question" },
    { msg: "@ferri thanks, you're a star", intent: "other" },
  ];
  const ic = await pool(intentCases, 4, async (c) => {
    const r = await crewIntent({ choice: models.fast, sender: "Priya", message: c.msg, open: intentCards, history: [] });
    tokensIn += r.usage.input + r.usage.cacheWrite;
    tokensOut += r.usage.output;
    cacheRead += r.usage.cacheRead;
    const problems: string[] = [];
    if (r.intent?.intent !== c.intent) problems.push(`intent ${r.intent?.intent}, expected ${c.intent}`);
    if (c.card && r.card?.id !== c.card) problems.push(`card ${r.card?.id ?? "none"}, expected ${c.card}`);
    if (c.facts !== undefined && (r.intent?.facts.length ?? 0) < c.facts) problems.push(`facts ${r.intent?.facts.length ?? 0}, expected ${c.facts}+`);
    return { c, r, problems };
  });
  console.log("\ncrew intent");
  for (const { c, r, problems } of ic) {
    if (problems.length) failed++;
    console.log(`${problems.length ? "FAIL" : "ok  "} ${c.msg}`);
    console.log(`      ${JSON.stringify(r.intent)}`);
    for (const x of problems) console.log(`      -> ${x}`);
  }

  const coverCases: { fact: string; answers: string[] }[] = [
    { fact: "There are free lockers on the 2nd floor; bring your own lock.", answers: ["lockers"] },
    { fact: "The quiet room closes at 7 AM on Sunday.", answers: [] },
  ];
  console.log("\nfacts that answer open cards");
  for (const c of coverCases) {
    const got = (await cardsAnsweredBy({ choice: models.fast, fact: c.fact, open: [...intentCards, openCards[1]!] })).map((x) => x.id).sort();
    const ok = JSON.stringify(got) === JSON.stringify([...c.answers].sort());
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} ${c.fact}  -> [${got.join(", ")}]${ok ? "" : ` expected [${c.answers.join(", ")}]`}`);
  }

  const total = answers.length + room.length + prepCases.length + intentCases.length + coverCases.length;
  console.log(
    `\n${total - failed}/${total} passed. tokens: ${tokensIn} in, ${tokensOut} out, ${cacheRead} read from cache.`,
  );
  process.exitCode = failed ? 1 : 0;
} finally {
  await close();
}
