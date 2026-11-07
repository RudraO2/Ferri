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
  checkDecision,
  crewByName,
  crewIntent,
  draftAgenda,
  draftAnnouncement,
  draftOutreachEmail,
  readReply,
  readCare,
  readGuestReply,
  draftGuestEmail,
  readPlanChat,
  shortPlanIds,
  type CrewMember,
  type PlanItem,
  localNow,
  parseWhen,
  worthAnnouncing,
  loadLiveKnowledge,
  loadSkills,
  modelsFromEnv,
  prepareCard,
  triageMessage,
  worthAnswering,
  type ChatLine,
  type OpenCard,
  normalizeSettingInput,
  parseSetting,
  translateAnnouncement,
  voiceBlock,
  type SettingKey,
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
  { q: "what time is it right now?", kind: "chat" },
  { q: "what's the AQI in Delhi today?", kind: "chat" },
  { q: "can you search the web and tell me who won the IPL?", kind: "chat" },
  { q: "who is aryantechie?", kind: "chat" },
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
  // Judge without crew answers: what the crew taught Ferri in live tests would change the expected answers.
  const kb = { ...live, entries: live.entries.filter((e) => e.sourceKind !== "crew_answer") };
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
    card("team-switch", "teams", "Can a participant switch to a different team after hacking has started?"),
  ];

  const prepCases: { q: string; joins: string | null; personal?: boolean }[] = [
    { q: "where can I park my scooter?", joins: "parking" },
    { q: "are pets allowed? I have a small dog", joins: "dogs" },
    { q: "is there car parking?", joins: null },
    { q: "can I bring my cat?", joins: null },
    { q: "is my registration confirmed? I'm Meera", joins: null, personal: true },
    { q: "is there a hotel discount for participants?", joins: null, personal: false },
    // Spec 06: a rule asked as "can I" is not personal, and it joins the open card.
    { q: "is it ok to move to another team once hacking has begun?", joins: "team-switch", personal: false },
    { q: "can I bring a friend who is not registered?", joins: null, personal: false },
    { q: "which team did you put me in? I'm Meera", joins: null, personal: true },
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

  // ── Spec 09: announcements, reminders, team rooms, decisions ──────────
  const tz = kb.community.timezone;
  // A fixed morning (10:00 AM in Bengaluru), so "at 5 PM" is always ahead: the cases do not depend on the clock.
  const now = new Date(process.env.EVAL_NOW ?? "2026-11-06T04:30:00Z");
  const recent = [
    { id: "lunch", title: "Lunch moves to 1:30 PM", text: "Lunch is now at 1:30 PM on Saturday.", status: "sent" },
    { id: "wifi", title: "Wifi is back", text: "The wifi is back on all floors.", status: "sent" },
  ];
  const launchCases: {
    msg: string;
    intent: string;
    when?: boolean;
    revises?: string;
    who?: "me" | "crew";
    teams?: number;
  }[] = [
    { msg: "@ferri tell everyone the doors open at 9:30 AM, not 10", intent: "announce", when: false },
    { msg: "@ferri announce at 6 PM today that submissions close at 7 PM", intent: "announce", when: true },
    { msg: "@ferri change the lunch announcement, it's 1:45 PM now", intent: "announce", revises: "lunch" },
    { msg: "@ferri let people know lunch moves to 2 PM", intent: "announce", when: false },
    { msg: "@ferri remind me at 5 PM to order the pizza", intent: "remind", who: "me" },
    { msg: "@ferri remind the crew in 2 hours to stack the chairs", intent: "remind", who: "crew" },
    { msg: "@ferri make team rooms for Team Alpha with meera and arjun, and Team Beta with priya", intent: "team_rooms", teams: 2 },
    { msg: "@ferri remember: the quiet room closes at 7 AM on Sunday", intent: "remember" },
  ];
  const lc = await pool(launchCases, 4, async (c) => {
    const r = await crewIntent({ choice: models.fast, sender: "Rudra", message: c.msg, open: [], history: [], announcements: recent, now: localNow(tz, now) });
    tokensIn += r.usage.input + r.usage.cacheWrite;
    tokensOut += r.usage.output;
    cacheRead += r.usage.cacheRead;
    const problems: string[] = [];
    const i = r.intent;
    if (i?.intent !== c.intent) problems.push(`intent ${i?.intent}, expected ${c.intent}`);
    if (c.when !== undefined && !!parseWhen(i?.announce?.when, now) !== c.when) problems.push(`when ${i?.announce?.when}, expected ${c.when ? "a time" : "none"}`);
    if (c.revises !== undefined && r.revises?.id !== c.revises) problems.push(`revises ${r.revises?.id ?? "nothing"}, expected ${c.revises}`);
    if (c.intent === "announce" && c.revises === undefined && r.revises) problems.push(`revises ${r.revises.id}, expected a new announcement`);
    if (c.who && (i?.remind?.who !== c.who || !parseWhen(i?.remind?.when, now))) problems.push(`remind ${JSON.stringify(i?.remind)}, expected ${c.who} with a time`);
    if (c.teams !== undefined && i?.teams.length !== c.teams) problems.push(`teams ${i?.teams.length}, expected ${c.teams}`);
    return { c, r, problems };
  });
  console.log("\nlaunch intents");
  for (const { c, r, problems } of lc) {
    if (problems.length) failed++;
    console.log(`${problems.length ? "FAIL" : "ok  "} ${c.msg}`);
    console.log(`      ${JSON.stringify({ intent: r.intent?.intent, announce: r.intent?.announce, remind: r.intent?.remind, teams: r.intent?.teams })}`);
    for (const x of problems) console.log(`      -> ${x}`);
  }

  const decisionCases: { before: ChatLine[]; msg: string; after: ChatLine[]; offer: boolean; changes?: string }[] = [
    { before: [{ sender: "Priya", body: "judges are stuck in traffic, should we push judging?" }], msg: "ok let's push judging to 4pm on Sunday", after: [], offer: true },
    { before: [], msg: "should we push judging to 4pm?", after: [{ sender: "Rudra", body: "yes, 4pm it is" }], offer: false },
    { before: [], msg: "who is buying the tape for the banners?", after: [], offer: false },
    { before: [], msg: "final call: volunteers meet at 8 AM for the crew briefing", after: [], offer: false },
    { before: [], msg: "caterer called, lunch has to move to 1:45 instead of 1:30", after: [], offer: true, changes: "lunch" },
    { before: [], msg: "we're moving the demos to hall B", after: [{ sender: "Priya", body: "wait, let's check with the venue first" }], offer: false },
  ];
  const dc = await pool(decisionCases, 4, async (c) => {
    const r = await checkDecision({ choice: models.fast, sender: "Rudra", message: c.msg, before: c.before, after: c.after, announcements: recent });
    tokensIn += r.usage.input + r.usage.cacheWrite;
    tokensOut += r.usage.output;
    cacheRead += r.usage.cacheRead;
    const problems: string[] = [];
    if (worthAnnouncing(r.decision) !== c.offer) problems.push(`offer ${worthAnnouncing(r.decision)}, expected ${c.offer}`);
    if (c.changes && r.changes?.id !== c.changes) problems.push(`changes ${r.changes?.id ?? "nothing"}, expected ${c.changes}`);
    return { c, r, problems };
  });
  console.log("\ncrew decisions");
  for (const { c, r, problems } of dc) {
    if (problems.length) failed++;
    console.log(`${problems.length ? "FAIL" : "ok  "} ${c.msg}`);
    console.log(`      ${JSON.stringify(r.decision)}`);
    for (const x of problems) console.log(`      -> ${x}`);
  }

  console.log("\nannouncement draft");
  const draft = await draftAnnouncement({ choice: models.main, kb, what: "Lunch moves to 1:30 PM on Saturday because the caterer is late", sender: "Rudra" });
  const text = draft.draft?.text ?? "";
  const draftProblems = [
    !text.includes("1:30") ? "lost the time" : null,
    /@(everyone|channel|here)/i.test(text) ? "pages the channel" : null,
    /koramangala|80 feet/i.test(text) ? "added the venue, which the request did not give" : null,
  ].filter(Boolean);
  if (draftProblems.length) failed++;
  console.log(`${draftProblems.length ? "FAIL" : "ok  "} ${JSON.stringify(draft.draft)}`);
  for (const x of draftProblems) console.log(`      -> ${x}`);

  // ── Spec 08: the plan ─────────────────────────────────────────────────
  const evCrew: CrewMember[] = [
    { id: "r", eventId: "e", name: "Rudra", handles: { mattermost: "user" }, topics: ["registration"], lead: true, onDuty: true },
    { id: "p", eventId: "e", name: "Priya", handles: { mattermost: "priya" }, topics: ["food"], lead: false, onDuty: false },
    { id: "a", eventId: "e", name: "Arjun", handles: { mattermost: "arjun" }, topics: [], lead: false, onDuty: false },
  ];
  const at = new Date();
  const planRow = (over: Partial<PlanItem>): PlanItem => ({
    id: over.title ?? "x", communityId: "c", eventId: "e", kind: "task", status: "confirmed", topic: "tech", title: "x", text: "x",
    ownerId: null, dueAt: null, forMembers: false, origin: "chat", decidedBy: "Rudra", sourceKey: null, cardId: null, entryId: null,
    remindedAt: null, createdAt: at, updatedAt: at, ...over,
  });
  const currentPlan = [
    planRow({ title: "Projector booking", text: "Book the projector for the main hall.", ownerId: "a" }),
    planRow({ kind: "decision", title: "Event date", text: "Build Night is on 21 November.", topic: "schedule", forMembers: true }),
  ];
  const planIds = shortPlanIds(currentPlan, evCrew);
  const planIntentCases: { msg: string; action: string; ref?: string; owner?: string; due?: boolean }[] = [
    { msg: "@ferri draft the agenda for the event", action: "draft" },
    { msg: "@ferri what's the plan so far?", action: "show" },
    { msg: "@ferri what's left to do before the event?", action: "show" },
    { msg: "@ferri the projector is booked", action: "done", ref: "Projector booking" },
    { msg: "@ferri add a task: print the name badges by Friday, Arjun", action: "add", owner: "Arjun", due: true },
    { msg: "@ferri Arjun owns registration from now on", action: "owner", owner: "Arjun" },
  ];
  const pi = await pool(planIntentCases, 4, async (c) => {
    const r = await crewIntent({ choice: models.fast, sender: "Rudra", message: c.msg, open: [], history: [], announcements: [], now: localNow(tz, now), plan: planIds });
    tokensIn += r.usage.input + r.usage.cacheWrite;
    tokensOut += r.usage.output;
    cacheRead += r.usage.cacheRead;
    const problems: string[] = [];
    const p = r.intent?.plan;
    if (r.intent?.intent !== "plan") problems.push(`intent ${r.intent?.intent}, expected plan`);
    else if (p?.action !== c.action) problems.push(`action ${p?.action}, expected ${c.action}`);
    if (c.ref && r.planItem?.title !== c.ref) problems.push(`ref ${r.planItem?.title ?? "nothing"}, expected ${c.ref}`);
    if (c.owner && crewByName(evCrew, p?.owner)?.name !== c.owner) problems.push(`owner ${p?.owner}, expected ${c.owner}`);
    if (c.due && !parseWhen(p?.due, now)) problems.push(`due ${p?.due}, expected a time`);
    return { c, r, problems };
  });
  console.log("\nplan intents");
  for (const { c, r, problems } of pi) {
    if (problems.length) failed++;
    console.log(`${problems.length ? "FAIL" : "ok  "} ${c.msg}`);
    console.log(`      ${JSON.stringify({ intent: r.intent?.intent, plan: r.intent?.plan })}`);
    for (const x of problems) console.log(`      -> ${x}`);
  }

  // ── Spec 11: work for Ferri Builder ─────────────────────────────────────
  const buildCases: { msg: string; intent: string; kind?: string }[] = [
    { msg: "@ferri get the builder to make a one-page site for Build Night", intent: "build", kind: "site" },
    { msg: "@ferri get the builder to ship the Build Night site with registration and sponsor credits", intent: "build", kind: "site" },
    { msg: "@ferri can you make us a day-of checklist for Build Night, with owners from the plan?", intent: "build", kind: "checklist" },
    { msg: "@ferri make a poster for the meetup with the date and the venue", intent: "build", kind: "poster" },
    { msg: "@ferri have the builder put together a one-page sponsor pitch document", intent: "build", kind: "other" },
    { msg: "@ferri get the builder to put Build Night on Luma", intent: "build", kind: "listing" },
    { msg: "@ferri can we list the meetup on Commudle too?", intent: "build", kind: "listing" },
    { msg: "@ferri tell everyone the event site is live", intent: "announce" },
    { msg: "@ferri draft the run of show for Saturday", intent: "plan" },
  ];
  const bi = await pool(buildCases, 4, async (c) => {
    const r = await crewIntent({ choice: models.fast, sender: "Rudra", message: c.msg, open: [], history: [], announcements: [], now: localNow(tz, now), plan: planIds });
    tokensIn += r.usage.input + r.usage.cacheWrite;
    tokensOut += r.usage.output;
    cacheRead += r.usage.cacheRead;
    const problems: string[] = [];
    if (r.intent?.intent !== c.intent) problems.push(`intent ${r.intent?.intent}, expected ${c.intent}`);
    else if (c.kind && r.intent.build?.kind !== c.kind) problems.push(`kind ${r.intent.build?.kind}, expected ${c.kind}`);
    if (c.intent === "build" && !(r.intent?.build?.title.trim() && r.intent.build.what.trim())) problems.push("build needs a title and what");
    return { c, r, problems };
  });
  console.log("\nbuild intents");
  for (const { c, r, problems } of bi) {
    if (problems.length) failed++;
    console.log(`${problems.length ? "FAIL" : "ok  "} ${c.msg}`);
    console.log(`      ${JSON.stringify({ intent: r.intent?.intent, build: r.intent?.build })}`);
    for (const x of problems) console.log(`      -> ${x}`);
  }

  const planChatCases: { before: ChatLine[]; msg: string; after: ChatLine[]; kinds: string[]; owner?: string; due?: boolean; done?: string; noDone?: boolean }[] = [
    { before: [], msg: "ok so we're doing it at the Koramangala makerspace, teams of up to 4", after: [], kinds: ["decision", "decision"] },
    { before: [], msg: "Priya will handle food and Arjun takes care of registration", after: [], kinds: ["owner", "owner"] },
    { before: [], msg: "Arjun can you book the sound system by Thursday?", after: [{ sender: "Arjun", body: "yep on it" }], kinds: ["task"], owner: "Arjun", due: true },
    { before: [], msg: "should we cap registrations at 120?", after: [], kinds: [] },
    { before: [], msg: "projector's booked btw", after: [], kinds: [], done: "Projector booking" },
    { before: [{ sender: "Rudra", body: "Arjun can you book the projector for the main hall?" }], msg: "yep, on it", after: [], kinds: [], noDone: true },
    { before: [], msg: "lol the coffee machine here is so loud", after: [], kinds: [] },
  ];
  const pc = await pool(planChatCases, 4, async (c) => {
    const r = await readPlanChat({ choice: models.fast, sender: "Rudra", message: c.msg, before: c.before, after: c.after, plan: currentPlan, crew: evCrew, now: localNow(tz, now) });
    tokensIn += r.usage.input + r.usage.cacheWrite;
    tokensOut += r.usage.output;
    cacheRead += r.usage.cacheRead;
    const problems: string[] = [];
    const kinds = (r.read?.items ?? []).map((i) => i.kind).sort();
    if (JSON.stringify(kinds) !== JSON.stringify([...c.kinds].sort())) problems.push(`items ${JSON.stringify(kinds)}, expected ${JSON.stringify(c.kinds)}`);
    if (c.owner && !(r.read?.items ?? []).some((i) => crewByName(evCrew, i.owner)?.name === c.owner)) problems.push(`no item owned by ${c.owner}`);
    if (c.due && !(r.read?.items ?? []).some((i) => parseWhen(i.due, now))) problems.push("no deadline");
    if (c.done && !r.done.some((d) => d.title === c.done)) problems.push(`done ${JSON.stringify(r.done.map((d) => d.title))}, expected ${c.done}`);
    if (c.noDone && r.done.length) problems.push(`done ${JSON.stringify(r.done.map((d) => d.title))}, expected nothing done`);
    return { c, r, problems };
  });
  console.log("\nplan from crew chat");
  for (const { c, r, problems } of pc) {
    if (problems.length) failed++;
    console.log(`${problems.length ? "FAIL" : "ok  "} ${c.msg}`);
    console.log(`      ${JSON.stringify(r.read)}`);
    for (const x of problems) console.log(`      -> ${x}`);
  }

  console.log("\nagenda draft");
  const eventId = kb.events[0]?.id ?? "";
  const agenda = await draftAgenda({ choice: models.main, kb, eventId, request: "draft the agenda", plan: [], crew: evCrew, now: localNow(tz, now) });
  const agendaProblems = [
    !agenda.draft ? "no draft" : null,
    agenda.draft && agenda.draft.agenda.split("\n").length < 4 ? "agenda too short" : null,
    agenda.draft && !agenda.draft.decisions.length ? "no decisions to confirm" : null,
    agenda.draft && agenda.draft.decisions.length > 6 ? "more than 6 decisions" : null,
  ].filter(Boolean);
  if (agendaProblems.length) failed++;
  console.log(`${agendaProblems.length ? "FAIL" : "ok  "} ${JSON.stringify({ summary: agenda.draft?.summary, decisions: agenda.draft?.decisions.map((d) => `${d.title}: ${d.proposal}`) })}`);
  for (const x of agendaProblems) console.log(`      -> ${x}`);

  // ── Spec 15: partner outreach ───────────────────────────────────────────
  const outreachCases: { msg: string; action: string; who?: RegExp; email?: string }[] = [
    { msg: "@ferri find colleges and companies in Bengaluru that could sponsor or host Build Night", action: "find" },
    { msg: "@ferri email CloudCo about sponsoring Build Night prizes", action: "email", who: /cloudco/i },
    { msg: "@ferri write to asha@cloudco.example and ask if CloudCo would host us next time", action: "email", who: /cloudco|asha/i, email: "asha@cloudco.example" },
    { msg: "@ferri reply to CloudCo and say Monday at 4 works for a call", action: "email", who: /cloudco/i },
    { msg: "@ferri who have we heard back from among the sponsors?", action: "status" },
  ];
  const oi = await pool(outreachCases, 4, async (c) => {
    const r = await crewIntent({ choice: models.fast, sender: "Rudra", message: c.msg, open: [], history: [], announcements: [], now: localNow(tz, now), plan: planIds });
    tokensIn += r.usage.input + r.usage.cacheWrite;
    tokensOut += r.usage.output;
    cacheRead += r.usage.cacheRead;
    const o = r.intent?.outreach;
    const problems: string[] = [];
    if (r.intent?.intent !== "outreach") problems.push(`intent ${r.intent?.intent}, expected outreach`);
    else if (o?.action !== c.action) problems.push(`action ${o?.action}, expected ${c.action}`);
    if (c.who && !c.who.test(o?.who ?? "")) problems.push(`who "${o?.who}"`);
    if (c.email && o?.email?.toLowerCase() !== c.email) problems.push(`email "${o?.email}"`);
    if (c.action === "email" && !o?.what.trim()) problems.push("email needs what");
    return { c, r, problems };
  });
  console.log("\noutreach intents");
  for (const { c, r, problems } of oi) {
    if (problems.length) failed++;
    console.log(`${problems.length ? "FAIL" : "ok  "} ${c.msg}`);
    console.log(`      ${JSON.stringify({ intent: r.intent?.intent, outreach: r.intent?.outreach })}`);
    for (const x of problems) console.log(`      -> ${x}`);
  }

  const ours = { subject: "Sponsoring Lantern Build Night, 21-22 Nov in Bengaluru", text: "Hi CloudCo team, we run Lantern Build Night, a 24-hour build event in Bengaluru on 21-22 November. Would CloudCo sponsor the prizes or credits? Could we talk for 15 minutes this week? Rudra, Lantern Labs" };
  const replyCases: { text: string; want: string }[] = [
    { text: "Hi Rudra, thanks! Yes, we'd be glad to sponsor credits. Can we do a call on Monday at 4 PM? Asha", want: "interested" },
    { text: "Thanks for reaching out. How many participants do you expect, and is it open to students?", want: "question" },
    { text: "Thanks, but we've used our sponsorship budget for this year. Best of luck with the event.", want: "declined" },
    { text: "no thanks", want: "unsubscribe" },
    { text: "I am out of the office until 10 November with limited access to email. For urgent matters contact the front desk.", want: "auto_reply" },
  ];
  const rr = await pool(replyCases, 4, async (c) => {
    const r = await readReply({ choice: models.fast, org: "CloudCo", ours, theirs: { subject: `Re: ${ours.subject}`, text: c.text, from: "Asha at CloudCo <asha@cloudco.example>" } });
    tokensIn += r.usage.input + r.usage.cacheWrite;
    tokensOut += r.usage.output;
    cacheRead += r.usage.cacheRead;
    const problems: string[] = [];
    if (r.reading?.want !== c.want) problems.push(`want ${r.reading?.want}, expected ${c.want}`);
    if (!r.reading?.summary.trim() || !r.reading?.next.trim()) problems.push("needs a summary and a next step");
    return { c, r, problems };
  });
  console.log("\nreading partner replies");
  for (const { c, r, problems } of rr) {
    if (problems.length) failed++;
    console.log(`${problems.length ? "FAIL" : "ok  "} ${c.text.slice(0, 70)}`);
    console.log(`      ${JSON.stringify(r.reading)}`);
    for (const x of problems) console.log(`      -> ${x}`);
  }

  console.log("\noutreach email draft");
  const mail = await draftOutreachEmail({
    choice: models.main,
    kb,
    eventId,
    contact: { org: "CloudCo", person: "Asha", kind: "company", why: "Runs a developer credits program for student hackathons." },
    ask: "Ask if CloudCo would sponsor cloud credits for the participants.",
    sender: "Rudra",
  });
  tokensIn += mail.usage.input + mail.usage.cacheWrite;
  tokensOut += mail.usage.output;
  cacheRead += mail.usage.cacheRead;
  const words = mail.draft?.text.split(/\s+/).length ?? 0;
  const mailProblems = [
    !mail.draft ? "no draft" : null,
    mail.draft && !/Lantern Build Night/i.test(mail.draft.text + mail.draft.subject) ? "does not name the event" : null,
    mail.draft && !/Asha/.test(mail.draft.text) ? "does not greet Asha" : null,
    mail.draft && !/Rudra/.test(mail.draft.text) ? "not signed by Rudra" : null,
    mail.draft && (words < 50 || words > 230) ? `${words} words` : null,
    mail.draft && /no thanks|unsubscribe/i.test(mail.draft.text) ? "has its own opt-out line" : null,
    mail.draft && mail.draft.subject.length > 90 ? "subject too long" : null,
  ].filter(Boolean);
  if (mailProblems.length) failed++;
  console.log(`${mailProblems.length ? "FAIL" : "ok  "} ${JSON.stringify({ subject: mail.draft?.subject, words, missing: mail.draft?.missing })}`);
  console.log(`      ${(mail.draft?.text ?? "").replace(/\n+/g, " | ")}`);
  for (const x of mailProblems) console.log(`      -> ${x}`);

  // ── Spec 16: care ───────────────────────────────────────────────────────
  const careCases: { msg: string; before?: ChatLine[]; open?: string; signal?: string[]; technical?: boolean; severity?: string; case: string }[] = [
    { msg: "what time is lunch?", signal: ["none"], case: "none" },
    { msg: "this bug is killing me lol, coffee anyone?", signal: ["none"], case: "none" },
    { msg: "yay we finally got the demo working!!", signal: ["none"], case: "none" },
    { msg: "git push keeps failing with 'Permission denied (publickey)' and I've tried twice, we can't submit anything", signal: ["stuck"], technical: true, case: "new" },
    { msg: "my CloudCo API key stopped working an hour ago, every call says 401, our whole demo depends on it", signal: ["stuck"], technical: true, case: "new" },
    { msg: "I've asked three times where we submit and nobody answers. honestly so frustrating", signal: ["upset", "confused"], case: "new" },
    { msg: "my team just left without telling me, I'm alone now and thinking of going home", signal: ["upset"], severity: "high", case: "new" },
    { msg: "someone keeps making comments about me near the stage and it's making me really uncomfortable", signal: ["unsafe"], severity: "high", case: "new" },
    { msg: "I've looked everywhere and still can't find which room team beta is in", signal: ["confused", "stuck"], case: "new" },
    { msg: "it works now, thanks so much!!", open: "Case 4 [stuck, the Builder is helping]: Meera can't push to GitHub: 'Permission denied (publickey)'", signal: ["none"], case: "solved" },
    { msg: "my team keeps ignoring every idea I bring up, it's getting pretty annoying", open: "Case 4 [stuck, the Builder is helping]: Meera can't push to GitHub: 'Permission denied (publickey)'", signal: ["upset"], case: "new" },
    { msg: "still failing, now it says 'repository not found'", open: "Case 4 [stuck, the Builder is helping]: Meera can't push to GitHub: 'Permission denied (publickey)'", signal: ["stuck"], case: "update" },
    { msg: "anyone know if there's a vegetarian option at dinner?", open: "Case 4 [stuck, the Builder is helping]: Meera can't push to GitHub: 'Permission denied (publickey)'", signal: ["none"], case: "none" },
  ];
  const cr = await pool(careCases, 4, async (c) => {
    const r = await readCare({ choice: models.fast, roomName: "Lantern Labs Discord: build-night", sender: "Meera", message: c.msg, before: c.before ?? [], openCase: c.open ?? null, stage: "live" });
    tokensIn += r.usage.input + r.usage.cacheWrite;
    tokensOut += r.usage.output;
    cacheRead += r.usage.cacheRead;
    const problems: string[] = [];
    const x = r.reading;
    if (!x) problems.push("no reading");
    else {
      if (c.signal && !c.signal.includes(x.signal)) problems.push(`signal ${x.signal}, expected ${c.signal.join(" or ")}`);
      if (x.case !== c.case) problems.push(`case ${x.case}, expected ${c.case}`);
      if (c.technical !== undefined && x.technical !== c.technical) problems.push(`technical ${x.technical}`);
      if (c.severity && x.severity !== c.severity) problems.push(`severity ${x.severity}, expected ${c.severity}`);
      if (c.case === "new" && (!x.reason.trim() || !/meera/i.test(x.reason))) problems.push("a new case needs a reason naming Meera");
      if (/case|builder/i.test(x.reason)) problems.push("the reason talks about cases or the Builder");
    }
    return { c, r, problems };
  });
  console.log("\ncare readings");
  for (const { c, r, problems } of cr) {
    if (problems.length) failed++;
    console.log(`${problems.length ? "FAIL" : "ok  "} ${c.msg.slice(0, 80)}`);
    console.log(`      ${JSON.stringify(r.reading)}`);
    for (const x of problems) console.log(`      -> ${x}`);
  }

  const openCaseLines = [
    "Case 3 [stuck, nobody on it yet]: Meera can't push to GitHub: 'Permission denied (publickey)'",
    "Case 4 [upset, someone is on it, owner Priya]: Arjun's team left him and he is thinking of going home",
  ];
  const careIntentCases: { msg: string; action: string; case?: number | null; note?: RegExp }[] = [
    { msg: "@ferri I've got case 3", action: "mine", case: 3 },
    { msg: "@ferri case 4 solved, found him a new team", action: "solved", case: 4, note: /team/i },
    { msg: "@ferri send the builder to help Meera with her git problem", action: "builder", case: 3 },
    { msg: "@ferri who's stuck right now?", action: "status", case: null },
    { msg: "@ferri tell Meera in case 3 to come to the help desk by the stage", action: "message", case: 3, note: /help desk/i },
  ];
  const ci = await pool(careIntentCases, 4, async (c) => {
    const r = await crewIntent({ choice: models.fast, sender: "Priya", message: c.msg, open: [], history: [], announcements: [], now: localNow(tz, now), plan: planIds, cases: openCaseLines });
    tokensIn += r.usage.input + r.usage.cacheWrite;
    tokensOut += r.usage.output;
    cacheRead += r.usage.cacheRead;
    const k = r.intent?.care;
    const problems: string[] = [];
    if (r.intent?.intent !== "care") problems.push(`intent ${r.intent?.intent}, expected care`);
    else {
      if (k?.action !== c.action) problems.push(`action ${k?.action}, expected ${c.action}`);
      if (c.case !== undefined && (k?.case || null) !== c.case) problems.push(`case ${k?.case}, expected ${c.case}`);
      if (c.note && !c.note.test(k?.note ?? "")) problems.push(`note "${k?.note}"`);
    }
    return { c, r, problems };
  });
  console.log("\ncare intents");
  for (const { c, r, problems } of ci) {
    if (problems.length) failed++;
    console.log(`${problems.length ? "FAIL" : "ok  "} ${c.msg}`);
    console.log(`      ${JSON.stringify({ intent: r.intent?.intent, care: r.intent?.care })}`);
    for (const x of problems) console.log(`      -> ${x}`);
  }

  // ── Spec 17: RSVP ───────────────────────────────────────────────────────
  const guestIntentCases: { msg: string; intent: string; action?: string; when?: boolean; audience?: string }[] = [
    { msg: "@ferri remind the guests tomorrow at 9 AM to bring their laptops and a photo ID", intent: "guests", action: "remind", when: true },
    { msg: "@ferri email everyone who registered that doors open at 9", intent: "guests", action: "remind" },
    { msg: "@ferri ask everyone who can't come to free their spot", intent: "guests", action: "nudge" },
    { msg: "@ferri how many people are coming? who's on the waitlist?", intent: "guests", action: "status" },
    { msg: "@ferri sync the guest list from Luma", intent: "guests", action: "sync" },
    { msg: "@ferri remind me at 5 PM to order the pizza", intent: "remind" },
    { msg: "@ferri tell everyone in the groups that lunch moves to 1:30", intent: "announce" },
  ];
  const gi = await pool(guestIntentCases, 4, async (c) => {
    const r = await crewIntent({ choice: models.fast, sender: "Rudra", message: c.msg, open: [], history: [], announcements: [], now: localNow(tz, now), plan: planIds });
    tokensIn += r.usage.input + r.usage.cacheWrite;
    tokensOut += r.usage.output;
    cacheRead += r.usage.cacheRead;
    const problems: string[] = [];
    if (r.intent?.intent !== c.intent) problems.push(`intent ${r.intent?.intent}, expected ${c.intent}`);
    else if (c.action && r.intent.guests?.action !== c.action) problems.push(`action ${r.intent.guests?.action}, expected ${c.action}`);
    if (c.when && !parseWhen(r.intent?.guests?.when, now)) problems.push(`when ${r.intent?.guests?.when}, expected a time`);
    if (c.action === "remind" && !r.intent?.guests?.what.trim()) problems.push("remind needs what");
    return { c, r, problems };
  });
  console.log("\nguest intents");
  for (const { c, r, problems } of gi) {
    if (problems.length) failed++;
    console.log(`${problems.length ? "FAIL" : "ok  "} ${c.msg}`);
    console.log(`      ${JSON.stringify({ intent: r.intent?.intent, guests: r.intent?.guests })}`);
    for (const x of problems) console.log(`      -> ${x}`);
  }

  const guestReplyCases: { text: string; want: string }[] = [
    { text: "Hi, so sorry, something came up and I can't make it any more. Please give my spot to someone else.", want: "not_coming" },
    { text: "Yes I'll be there, see you Saturday!", want: "coming" },
    { text: "Is there parking for two-wheelers near the venue?", want: "question" },
    { text: "Thanks!", want: "other" },
  ];
  const gr = await pool(guestReplyCases, 4, async (c) => {
    const r = await readGuestReply({ choice: models.fast, eventName: "Lantern Build Night", ours: "Hi Asha, Build Night is tomorrow at 9 AM at Koramangala Makerspace. Bring your laptop.", theirs: c.text, name: "Asha Guest" });
    tokensIn += r.usage.input + r.usage.cacheWrite;
    tokensOut += r.usage.output;
    cacheRead += r.usage.cacheRead;
    const problems: string[] = [];
    if (r.reading?.want !== c.want) problems.push(`want ${r.reading?.want}, expected ${c.want}`);
    if (!r.reading?.summary.trim()) problems.push("needs a summary");
    return { c, r, problems };
  });
  console.log("\nreading guest replies");
  for (const { c, r, problems } of gr) {
    if (problems.length) failed++;
    console.log(`${problems.length ? "FAIL" : "ok  "} ${c.text.slice(0, 70)}`);
    console.log(`      ${JSON.stringify(r.reading)}`);
    for (const x of problems) console.log(`      -> ${x}`);
  }

  console.log("\nguest reminder draft");
  const gd = await draftGuestEmail({ choice: models.main, kb, eventId, kind: "reminder", ask: "Bring your laptop, charger and a photo ID. Doors open at 9 AM.", now: localNow(tz, now) });
  tokensIn += gd.usage.input + gd.usage.cacheWrite;
  tokensOut += gd.usage.output;
  cacheRead += gd.usage.cacheRead;
  const gwords = gd.draft?.text.split(/\s+/).length ?? 0;
  const gdProblems = [
    !gd.draft ? "no draft" : null,
    gd.draft && !/^Hi \{first\},/.test(gd.draft.text.trim()) ? "does not start with Hi {first}," : null,
    gd.draft && !/Build Night/i.test(gd.draft.subject) ? "subject does not name the event" : null,
    gd.draft && /https?:\/\//.test(gd.draft.text) ? "has its own link" : null,
    gd.draft && !/laptop/i.test(gd.draft.text) ? "drops the laptop" : null,
    gd.draft && (gwords < 20 || gwords > 170) ? `${gwords} words` : null,
  ].filter(Boolean);
  if (gdProblems.length) failed++;
  console.log(`${gdProblems.length ? "FAIL" : "ok  "} ${JSON.stringify({ subject: gd.draft?.subject, words: gwords, missing: gd.draft?.missing })}`);
  console.log(`      ${(gd.draft?.text ?? "").replace(/\n+/g, " | ")}`);
  for (const x of gdProblems) console.log(`      -> ${x}`);

  // ── Spec 21: customization (settings intents, answers in a set language, voice in drafts) ──
  let spec21Cases = 0;
  {
    const settingsCases: { msg: string; action: string; key?: string; scope?: string; space?: RegExp; value?: unknown }[] = [
      { msg: "@ferri reply in Hindi in the WhatsApp group", action: "set", key: "language", scope: "space", space: /whatsapp/i, value: "Hindi" },
      { msg: "@ferri be more playful on Discord", action: "set", key: "tone", scope: "space", space: /discord/i, value: "playful" },
      { msg: "@ferri turn off care for Build Night", action: "set", key: "care", scope: "event", value: "off" },
      { msg: "@ferri wait a minute before answering questions in the room", action: "set", key: "stepInSeconds", value: 60 },
      { msg: "@ferri what are the settings?", action: "show" },
      { msg: "@ferri stop replying in Hindi in the WhatsApp group", action: "reset", key: "language", scope: "space", space: /whatsapp/i },
    ];
    const si = await pool(settingsCases, 4, async (c) => {
      const r = await crewIntent({ choice: models.fast, sender: "Rudra", message: c.msg, open: [], history: [], announcements: [], now: localNow(tz, now), plan: planIds });
      tokensIn += r.usage.input + r.usage.cacheWrite;
      tokensOut += r.usage.output;
      cacheRead += r.usage.cacheRead;
      const s = r.intent?.settings;
      const problems: string[] = [];
      if (r.intent?.intent !== "settings" || !s) problems.push(`intent ${r.intent?.intent}, expected settings`);
      else {
        if (s.action !== c.action) problems.push(`action ${s.action}, expected ${c.action}`);
        if (c.key && s.key !== c.key) problems.push(`key ${s.key}, expected ${c.key}`);
        if (c.scope && s.scope !== c.scope) problems.push(`scope ${s.scope}, expected ${c.scope}`);
        if (!c.scope && s.scope === "space") problems.push("scope space, expected no space");
        if (c.space && !c.space.test(s.space)) problems.push(`space "${s.space}"`);
        if (c.value !== undefined && s.key) {
          const v = parseSetting(s.key as SettingKey, normalizeSettingInput(s.key as SettingKey, s.value));
          if (v !== c.value) problems.push(`value "${s.value}" reads as ${JSON.stringify(v)}, expected ${JSON.stringify(c.value)}`);
        }
      }
      return { c, r, problems };
    });
    console.log("\nsettings intents (spec 21)");
    for (const { c, r, problems } of si) {
      if (problems.length) failed++;
      console.log(`${problems.length ? "FAIL" : "ok  "} ${c.msg}`);
      console.log(`      ${JSON.stringify({ intent: r.intent?.intent, settings: r.intent?.settings })}`);
      for (const x of problems) console.log(`      -> ${x}`);
    }
    spec21Cases += settingsCases.length;

    // An answer where the space's language is Hindi: in Hindi, with a real source and the Hindi source label.
    const hindi = voiceBlock({ tone: "", language: "Hindi" });
    const ha = await answerQuestion({ db, kb, choice: models.main, skills: `${skills}\n\n${hindi}`, roomName: "eval", sender: "tester", question: "what time is lunch?", history: [], addressed: true, language: "Hindi" });
    tokensIn += ha.usage.input + ha.usage.cacheWrite;
    tokensOut += ha.usage.output;
    cacheRead += ha.usage.cacheRead;
    const haProblems = [
      ha.kind !== "answer" ? `kind ${ha.kind}` : null,
      !ha.sources.some((x) => x.key.includes("#food")) ? "no citation of #food" : null,
      !/[ऀ-ॿ]/.test(ha.text.split("\n\n")[0] ?? "") ? "reply not in Devanagari" : null,
      !/\n\nस्रोत: /.test(ha.text) ? "no Hindi source line" : null,
    ].filter(Boolean);
    if (haProblems.length) failed++;
    console.log(`\n${haProblems.length ? "FAIL" : "ok  "} answer in Hindi with a source :: ${ha.text.replace(/\n+/g, " | ")}`);
    for (const x of haProblems) console.log(`      -> ${x}`);
    spec21Cases++;

    // The voice block reaches the announcement drafter.
    const vd = await draftAnnouncement({ choice: models.main, kb, what: "Lunch moves to 1:30 PM on Saturday because the caterer is late", sender: "Rudra", voice: voiceBlock({ tone: "playful", language: "Hindi" }) });
    tokensIn += vd.usage.input + vd.usage.cacheWrite;
    tokensOut += vd.usage.output;
    cacheRead += vd.usage.cacheRead;
    const vdProblems = [
      !vd.draft ? "no draft" : null,
      vd.draft && !/[ऀ-ॿ]/.test(vd.draft.text) ? "draft not in Hindi" : null,
      vd.draft && !/1:30/.test(vd.draft.text) ? "drops 1:30" : null,
      vd.draft && /@(everyone|channel|here)/i.test(vd.draft.text) ? "pages the room" : null,
    ].filter(Boolean);
    if (vdProblems.length) failed++;
    console.log(`${vdProblems.length ? "FAIL" : "ok  "} announcement draft with a Hindi, playful voice :: ${(vd.draft?.text ?? "").replace(/\n+/g, " | ")}`);
    for (const x of vdProblems) console.log(`      -> ${x}`);
    spec21Cases++;

    // One announcement, translated for a Hindi space: same facts.
    const tr = await translateAnnouncement({ choice: models.fast, text: "Lunch moves to 1:30 PM on Saturday. It's in Hall B. Details: https://lantern.example/food", language: "Hindi" });
    tokensIn += tr.usage.input + tr.usage.cacheWrite;
    tokensOut += tr.usage.output;
    cacheRead += tr.usage.cacheRead;
    const trProblems = [
      !tr.text ? "no translation" : null,
      tr.text && !/[ऀ-ॿ]/.test(tr.text) ? "not in Hindi" : null,
      tr.text && !/1:30/.test(tr.text) ? "drops 1:30" : null,
      tr.text && !tr.text.includes("https://lantern.example/food") ? "changes the link" : null,
    ].filter(Boolean);
    if (trProblems.length) failed++;
    console.log(`${trProblems.length ? "FAIL" : "ok  "} announcement translated into Hindi :: ${(tr.text ?? "").replace(/\n+/g, " | ")}`);
    for (const x of trProblems) console.log(`      -> ${x}`);
    spec21Cases++;
  }

  // ── Spec 19: wrap (crew intents, lessons with no invented numbers, partners, keep/check) ──
  let spec19Cases = 0;
  {
    const wrapLib = await import("@ferri/knowledge");
    const wrapCases: { msg: string; action: string; event?: RegExp; from?: RegExp; to?: RegExp; when?: boolean }[] = [
      { msg: "@ferri how did build night go?", action: "recap" },
      { msg: "@ferri close build night and move the spaces to Build Night 2", action: "close", to: /build night 2/i },
      { msg: "@ferri start Lantern Build Night 2 on 12 December from the Build Night kit", action: "start", event: /build night 2/i, from: /build night/i, when: true },
      { msg: "@ferri reopen build night", action: "reopen", event: /build night/i },
      { msg: "@ferri save our sponsors and partners to contacts for next time", action: "partners" },
      { msg: "@ferri make a starter kit from build night", action: "kit", event: /build night/i },
    ];
    const wi = await pool(wrapCases, 4, async (c) => {
      const r = await crewIntent({ choice: models.fast, sender: "Rudra", message: c.msg, open: [], history: [], announcements: [], now: localNow(tz, now), plan: planIds });
      tokensIn += r.usage.input + r.usage.cacheWrite;
      tokensOut += r.usage.output;
      cacheRead += r.usage.cacheRead;
      const w = r.intent?.wrap;
      const problems: string[] = [];
      if (r.intent?.intent !== "wrap" || !w) problems.push(`intent ${r.intent?.intent}, expected wrap`);
      else {
        if (w.action !== c.action) problems.push(`action ${w.action}, expected ${c.action}`);
        if (c.event && !c.event.test(w.event)) problems.push(`event "${w.event}"`);
        if (c.from && !c.from.test(w.from)) problems.push(`from "${w.from}"`);
        if (c.to && !c.to.test(w.to)) problems.push(`to "${w.to}"`);
        const when = parseWhen(w.when || null, now);
        if (c.when && (!when || when.getUTCMonth() !== 11 || ![11, 12].includes(when.getUTCDate()))) problems.push(`when "${w.when}", expected 12 December`);
      }
      return { c, r, problems };
    });
    console.log("\nwrap intents (spec 19)");
    for (const { c, r, problems } of wi) {
      if (problems.length) failed++;
      console.log(`${problems.length ? "FAIL" : "ok  "} ${c.msg}`);
      console.log(`      ${JSON.stringify({ intent: r.intent?.intent, wrap: r.intent?.wrap })}`);
      for (const x of problems) console.log(`      -> ${x}`);
    }
    spec19Cases += wrapCases.length;

    // Spec 18: social intents (posts to LinkedIn, X and Instagram through Buffer), not announcements.
    const socialCases: { msg: string; action: string; nets?: string[]; image?: string; when?: boolean }[] = [
      { msg: "@ferri post the poster on LinkedIn, X and Instagram saying registration is open", action: "post", nets: ["linkedin", "twitter", "instagram"], image: "poster" },
      { msg: "@ferri tweet that we have 20 spots left", action: "post", nets: ["twitter"], image: "none" },
      { msg: "@ferri share on social on 1 June 2027 at 10 AM that the next Build Night is coming", action: "post", nets: [], when: true },
      { msg: "@ferri what did we post on social?", action: "status" },
    ];
    const si = await pool(socialCases, 4, async (c) => {
      const r = await crewIntent({ choice: models.fast, sender: "Rudra", message: c.msg, open: [], history: [], announcements: [], now: localNow(tz, now), plan: planIds });
      tokensIn += r.usage.input + r.usage.cacheWrite;
      tokensOut += r.usage.output;
      cacheRead += r.usage.cacheRead;
      const s = r.intent?.social;
      const problems: string[] = [];
      if (r.intent?.intent !== "social" || !s) problems.push(`intent ${r.intent?.intent}, expected social`);
      else {
        if (s.action !== c.action) problems.push(`action ${s.action}, expected ${c.action}`);
        const got = wrapLib.servicesFrom(s.networks).sort().join(",");
        if (c.nets && got !== [...c.nets].sort().join(",")) problems.push(`networks ${JSON.stringify(s.networks)}`);
        if (c.image && s.image !== c.image) problems.push(`image ${s.image}, expected ${c.image}`);
        if (c.when && !/^2027-06-01T10:00/.test(s.when)) problems.push(`when "${s.when}"`);
      }
      return { c, r, problems };
    });
    console.log("\nsocial intents (spec 18)");
    for (const { c, r, problems } of si) {
      if (problems.length) failed++;
      console.log(`${problems.length ? "FAIL" : "ok  "} ${c.msg}`);
      console.log(`      ${JSON.stringify({ intent: r.intent?.intent, social: r.intent?.social })}`);
      for (const x of problems) console.log(`      -> ${x}`);
    }
    spec19Cases += socialCases.length;

    // Lessons: grounded, and no number that is not in the stats (checked again here on the guarded output).
    const stats = {
      event: { name: "Lantern Build Night", startsAt: null, endsAt: null },
      questions: { asked: 42, people: 17, answeredByFerri: 30, answeredByCrew: 8, unanswered: 4, listened: 0, medianFerriSeconds: 3, medianCrewMinutes: 12, platforms: ["mattermost", "telegram"] },
      knowledge: { crewAnswers: 6 },
      cards: { opened: 14, byKind: { question: 10, announce: 4 }, answered: 11, expired: 3, dismissed: 0 },
      announcements: { sent: 3, spaces: 9, edits: 1 },
      care: { cases: 5, solved: 4, byBuilder: 2, open: 1 },
      guests: { registered: 120, going: 95, waitlist: 10, pending: 0, notGoing: 15, checkedIn: 80, confirmed: 60, freed: 12, reoffered: 9, sources: { site: 70, luma: 50 } },
      guestEmails: { sends: 2, mails: 190, delivered: 185 },
      outreach: { emailed: 8, replies: 5, interested: 3, declined: 1 },
      listings: [],
      builder: { done: 4, byKind: { site: 1, poster: 2, listing: 1 } },
      shield: { checks: 300, blocked: 2, redacted: 1 },
      spaces: { count: 9, platforms: ["mattermost", "telegram"] },
      computedAt: now.toISOString(),
    } as unknown as import("@ferri/knowledge").RecapStats;
    const record = {
      unanswered: ["Where can teams sleep overnight?", "Is there parking for bikes?", "Can we bring our own monitor?"],
      topAsked: [{ question: "When does hacking start?", count: 9 }, { question: "What is the wifi password?", count: 7 }],
      caseReasons: ["stuck (solved): could not connect to the wifi with a Linux laptop", "upset (open): lost their team after the team mixer"],
      expiredCards: ["question: Where can teams sleep overnight?", "question: Is there parking for bikes?", "question: Can we bring our own monitor?"],
      replySummaries: ["CloudCo will give every team 100 dollars of credits and wants a logo on the site."],
      announcements: ["Lunch moves to 1:30 PM", "Judging starts at 4 PM"],
    };
    const lessons = await wrapLib.writeLessons({ choice: models.fast, eventName: "Lantern Build Night", stats, record });
    const allowed = wrapLib.allowedNumbers(stats);
    const all = [...lessons.wentWell, ...lessons.toFix, ...lessons.answerEarly];
    const invented = all.filter((l) => wrapLib.numbersIn(l.split("Lantern Build Night").join(" ")).some((x) => !allowed.has(x)));
    const lProblems = [
      !lessons.wentWell.length ? "no went-well lines" : null,
      !lessons.toFix.length ? "no to-fix lines" : null,
      !lessons.answerEarly.some((l) => /sleep|overnight|parking|monitor/i.test(l)) ? "answer-early misses the unanswered questions" : null,
      invented.length ? `invented numbers: ${invented.join(" | ")}` : null,
    ].filter(Boolean);
    if (lProblems.length) failed++;
    console.log(`\n${lProblems.length ? "FAIL" : "ok  "} wrap lessons with only real numbers :: ${JSON.stringify(lessons)}`);
    for (const x of lProblems) console.log(`      -> ${x}`);
    spec19Cases++;

    // Partners from the knowledge and plan: organizations that took part, email only when written.
    const sources = [
      { id: "K1", title: "Lantern Build Night FAQ: Sponsors", text: "CloudCo gives every team cloud credits. Questions about credits: asha@cloudco.example. Prizes are given by Nimbus Labs." },
      { id: "K2", title: "Lantern Build Night FAQ: Venue", text: "We are at the Koramangala Makerspace, 3rd floor. Register on Luma; chat with us on Discord." },
      { id: "P1", title: "plan decision: Food", text: "Dinner is pizza from Slice House, paid by the community." },
      { id: "P2", title: "plan task: Outreach", text: "Ask DataWorks if they want to sponsor next time." },
    ];
    const found = await wrapLib.extractPartners({ choice: models.fast, eventName: "Lantern Build Night", communityName: "Lantern Labs", sources });
    const has = (re: RegExp) => found.find((p) => re.test(p.org));
    const pProblems = [
      !has(/cloudco/i) ? "misses CloudCo" : null,
      has(/cloudco/i) && has(/cloudco/i)!.email !== "asha@cloudco.example" ? `CloudCo email ${has(/cloudco/i)!.email}` : null,
      !has(/slice house/i) ? "misses Slice House" : null,
      !has(/makerspace/i) ? "misses the venue" : null,
      !has(/nimbus/i) ? "misses the prize giver" : null,
      has(/luma|discord/i) ? "lists a platform as a partner" : null,
      has(/lantern labs/i) ? "lists the community itself" : null,
      found.some((p) => p.email && !sources.some((s) => s.text.includes(p.email!))) ? "an email that is not written" : null,
    ].filter(Boolean);
    if (pProblems.length) failed++;
    console.log(`${pProblems.length ? "FAIL" : "ok  "} partners from knowledge and plan :: ${found.map((p) => `${p.org} (${p.role}${p.email ? `, ${p.email}` : ""})`).join("; ")}`);
    for (const x of pProblems) console.log(`      -> ${x}`);
    spec19Cases++;

    // Keep or check: evergreen facts stay, edition facts get checked.
    const kitEntries = [
      { heading: "Code of conduct", body: "Be kind. Harassment of any kind is not tolerated; tell any crew member.", sourceTitle: "Lantern Build Night FAQ" },
      { heading: "Wi-Fi", body: "The makerspace wifi is Lantern-Guest; the password is on the wall by the door.", sourceTitle: "Lantern Build Night FAQ" },
      { heading: "Prizes", body: "First prize is 50,000 rupees from Nimbus Labs; second prize is a 3D printer.", sourceTitle: "Lantern Build Night FAQ" },
      { heading: "Schedule", body: "Doors open Saturday 21 November at 10 AM; hacking ends Sunday at 10 AM.", sourceTitle: "Lantern Build Night FAQ" },
    ];
    const sorted = await wrapLib.sortKitKnowledge({ choice: models.fast, eventName: "Lantern Build Night", entries: kitEntries });
    const keep = sorted.keep.map((e) => e.heading);
    const check = sorted.check.map((e) => e.heading);
    const kProblems = [
      !keep.includes("Code of conduct") ? "code of conduct not kept" : null,
      !keep.includes("Wi-Fi") ? "wifi not kept" : null,
      !check.includes("Prizes") ? "prizes not checked" : null,
      !check.includes("Schedule") ? "schedule not checked" : null,
    ].filter(Boolean);
    if (kProblems.length) failed++;
    console.log(`${kProblems.length ? "FAIL" : "ok  "} kit knowledge keep/check :: keep [${keep.join(", ")}], check [${sorted.check.map((e) => `${e.heading}: ${e.check}`).join("; ")}]`);
    for (const x of kProblems) console.log(`      -> ${x}`);
    spec19Cases++;
  }

  // ── Spec 20: desks (crew desk intents, sheet readings, the custom desk writer; cases in scripts/eval-desks.ts) ──
  let spec20Cases = 0;
  {
    const { deskEval } = await import("./eval-desks.ts");
    const d = await deskEval({ fast: models.fast, now, tz });
    failed += d.failed;
    spec20Cases += d.cases;
    tokensIn += d.usage.input + d.usage.cacheWrite;
    tokensOut += d.usage.output;
    cacheRead += d.usage.cacheRead;
  }

  const total =
    spec20Cases +
    answers.length + room.length + prepCases.length + intentCases.length + coverCases.length + launchCases.length + decisionCases.length + 1 +
    planIntentCases.length + buildCases.length + planChatCases.length + 1 + outreachCases.length + replyCases.length + 1 +
    careCases.length + careIntentCases.length + guestIntentCases.length + guestReplyCases.length + 1 + spec21Cases + spec19Cases;
  console.log(
    `\n${total - failed}/${total} passed. tokens: ${tokensIn} in, ${tokensOut} out, ${cacheRead} read from cache.`,
  );
  process.exitCode = failed ? 1 : 0;
} finally {
  await close();
}
