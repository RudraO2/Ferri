/**
 * Desks eval (spec 20): crew desk intents, sheet readings and the custom desk
 * writer, on the real model calls. Part of `pnpm eval:answers`; runs alone with
 * `tsx --env-file-if-exists=.env scripts/eval-desks.ts`. Keep FERRI_MODEL_FAST
 * on claude-haiku-5-5 at low effort.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  crewIntent,
  deskKindFor,
  localNow,
  modelsFromEnv,
  packTypeFor,
  parseDeskSkill,
  readSheet,
  writeCustomDesk,
  type DeskSheet,
  type DeskValue,
  type ModelChoice,
  type Usage,
} from "@ferri/knowledge";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sheetOf(kind: string): DeskSheet {
  const p = parseDeskSkill(fs.readFileSync(path.join(root, "skills", "desks", `${kind}.md`), "utf8"));
  if (!p.ok || !p.skill.sheet) throw new Error(`skills/desks/${kind}.md has no valid sheet`);
  return p.skill.sheet;
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

const low = (v: DeskValue | undefined) => String(v ?? "").toLowerCase();

export async function deskEval(input: { fast: ModelChoice; now: Date; tz: string }): Promise<{ cases: number; failed: number; usage: Usage }> {
  const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const add = (u: Usage | null | undefined) => {
    if (!u) return;
    usage.input += u.input;
    usage.output += u.output;
    usage.cacheRead += u.cacheRead;
    usage.cacheWrite += u.cacheWrite;
  };
  let failed = 0;
  let cases = 0;
  const report = (name: string, problems: string[], detail: string) => {
    cases++;
    if (problems.length) failed++;
    console.log(`${problems.length ? "FAIL" : "ok  "} ${name}`);
    console.log(`      ${detail}`);
    for (const x of problems) console.log(`      -> ${x}`);
  };

  // ── Crew intents ──────────────────────────────────────────────────────
  const intentCases: { msg: string; action: string; kind?: string; pack?: string; members?: string[]; what?: RegExp }[] = [
    { msg: "@ferri make a judging desk with arjun and priya", action: "make", kind: "judging", members: ["arjun", "priya"] },
    { msg: "@ferri we need a help desk for build night", action: "make", kind: "help" },
    { msg: "@ferri set up the desks for our board game night", action: "pack", pack: "game-night" },
    { msg: "@ferri set up the desks for a meetup", action: "pack", pack: "meetup" },
    { msg: "@ferri make a desk for the rangoli judges where they post their scores per entry", action: "custom", what: /rangoli|score/i },
    { msg: "@ferri what desks do we have?", action: "list" },
    { msg: "@ferri show the judging scores", action: "sheet", kind: "judging" },
    { msg: "@ferri who has checked in so far?", action: "sheet", kind: "checkin" },
  ];
  console.log("\ndesk intents (spec 20)");
  const ir = await pool(intentCases, 4, async (c) => {
    let r: Awaited<ReturnType<typeof crewIntent>>;
    try {
      r = await crewIntent({ choice: input.fast, sender: "Rudra", message: c.msg, open: [], history: [], announcements: [], now: localNow(input.tz, input.now) });
    } catch (err) {
      return { c, r: { intent: null } as unknown as Awaited<ReturnType<typeof crewIntent>>, problems: [`the call failed: ${(err as Error).message.slice(0, 160)}`] };
    }
    add(r.usage);
    const d = r.intent?.desk;
    const problems: string[] = [];
    if (r.intent?.intent !== "desk" || !d) problems.push(`intent ${r.intent?.intent}, expected desk`);
    else {
      if (d.action !== c.action) problems.push(`action ${d.action}, expected ${c.action}`);
      if (c.kind && deskKindFor(d.kind) !== c.kind) problems.push(`kind "${d.kind}", expected ${c.kind}`);
      if (c.pack && packTypeFor(d.kind) !== c.pack) problems.push(`pack "${d.kind}", expected ${c.pack}`);
      for (const m of c.members ?? []) if (!d.members.some((x) => x.toLowerCase().replace(/^@/, "") === m)) problems.push(`members ${JSON.stringify(d.members)} miss ${m}`);
      if (c.what && !c.what.test(`${d.what} ${d.name}`)) problems.push(`what "${d.what}", name "${d.name}"`);
    }
    return { c, r, problems };
  });
  for (const { c, r, problems } of ir) report(c.msg, problems, JSON.stringify({ intent: r.intent?.intent, desk: r.intent?.desk }));

  // ── Sheet readings ────────────────────────────────────────────────────
  const judging = sheetOf("judging");
  const checkin = sheetOf("checkin");
  const lost = sheetOf("lost-found");
  const scored = [{ id: "row-1", data: { team: "Team Alpha", judge: "Arjun", criterion: "innovation", score: 8, note: null }, by: "Arjun" }];
  type SheetCase = {
    name: string;
    sheet: DeskSheet;
    title: string;
    sender: string;
    msg: string;
    rows?: typeof scored;
    action: "add" | "change" | "show" | "none";
    check?: (rows: { ref: string | null; data: Record<string, DeskValue> }[]) => string | null;
  };
  const sheetCases: SheetCase[] = [
    {
      name: "a score is added",
      sheet: judging,
      title: "Judging desk",
      sender: "Arjun",
      msg: "Team Alpha 8 for innovation",
      action: "add",
      check: (r) => (r.length === 1 && /alpha/i.test(low(r[0]!.data.team)) && r[0]!.data.score === 8 && /innovation/.test(low(r[0]!.data.criterion)) && /arjun/.test(low(r[0]!.data.judge)) ? null : "row is not Team Alpha / innovation / 8 / Arjun"),
    },
    {
      name: "two scores in one message",
      sheet: judging,
      title: "Judging desk",
      sender: "Priya",
      msg: "Team Beta: 7 for design and 9 for impact",
      action: "add",
      check: (r) => (r.length === 2 && r.every((x) => /beta/i.test(low(x.data.team))) && r.some((x) => x.data.score === 7) && r.some((x) => x.data.score === 9) ? null : "expected two Team Beta rows (7 and 9)"),
    },
    {
      name: "a score is changed",
      sheet: judging,
      title: "Judging desk",
      sender: "Arjun",
      msg: "actually make Team Alpha's innovation a 9",
      rows: scored,
      action: "change",
      check: (r) => (r.length === 1 && r[0]!.data.score === 9 && r[0]!.ref === "row-1" ? null : "expected row S1 changed to 9"),
    },
    { name: "show the scores", sheet: judging, title: "Judging desk", sender: "Rudra", msg: "@ferri show the scores", rows: scored, action: "show" },
    { name: "a plain question is not an entry", sheet: judging, title: "Judging desk", sender: "Priya", msg: "when does judging end today?", rows: scored, action: "none" },
    {
      name: "a check-in",
      sheet: checkin,
      title: "Check-in desk",
      sender: "Meera",
      msg: "checked in Asha Guest",
      action: "add",
      check: (r) => (r.length === 1 && low(r[0]!.data.name) === "asha guest" ? null : "expected the name Asha Guest"),
    },
    {
      name: "a found item",
      sheet: lost,
      title: "Lost and found desk",
      sender: "Ravi",
      msg: "found a blue water bottle near the stage",
      action: "add",
      check: (r) => (r.length === 1 && /bottle/.test(low(r[0]!.data.item)) && /stage/.test(low(r[0]!.data.found_at)) ? null : "expected the bottle found near the stage"),
    },
  ];
  console.log("\ndesk sheet readings (spec 20)");
  const sr = await pool(sheetCases, 4, async (c) => {
    const out = await readSheet({ choice: input.fast, deskTitle: c.title, sheet: c.sheet, sender: c.sender, message: c.msg, rows: c.rows ?? [] });
    add(out.usage);
    const problems: string[] = [];
    if (!out.reading) problems.push("no reading");
    else {
      if (out.reading.action !== c.action) problems.push(`action ${out.reading.action}, expected ${c.action}`);
      else if (c.check) {
        const p = c.check(out.reading.rows);
        if (p) problems.push(p);
      }
    }
    return { c, out, problems };
  });
  for (const { c, out, problems } of sr) report(`${c.name}: "${c.msg}"`, problems, JSON.stringify(out.reading));

  // ── The custom desk writer ────────────────────────────────────────────
  console.log("\ncustom desk writer (spec 20)");
  const w = await writeCustomDesk({ choice: input.fast, what: "the rangoli judges post their scores per entry", name: "rangoli judges", eventName: "Lantern Diwali Night", sender: "Rudra" });
  add(w.usage);
  const s = w.skill;
  const wProblems = [
    w.fallback ? `fell back to the minimal skill (${w.error})` : null,
    !parseDeskSkill(w.text).ok ? "the written skill does not parse" : null,
    !s.kind.startsWith("custom-") ? `kind ${s.kind}` : null,
    !s.sheet ? "no sheet" : null,
    s.sheet && !s.sheet.columns.some((c) => /score|point|mark/.test(c)) ? `no score column in ${s.sheet.columns.join(", ")}` : null,
    s.sheet && !s.sheet.summary ? "no summary" : null,
    s.sheet?.summary && s.sheet.summary.op === "count" ? "summary counts instead of totalling scores" : null,
    s.visibility !== "private" ? "scores desk is public" : null,
    s.body.split("\n").length < 3 ? "behavior is too short" : null,
  ].filter((x): x is string => !!x);
  report("custom desk skill for the rangoli judges", wProblems, JSON.stringify({ kind: s.kind, title: s.title, room: s.room, visibility: s.visibility, sheet: s.sheet }));

  return { cases, failed, usage };
}

// Run alone: `tsx --env-file-if-exists=.env scripts/eval-desks.ts`.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const models = modelsFromEnv();
  console.log(`desks eval on ${models.fast.model}/${models.fast.effort}`);
  const r = await deskEval({ fast: models.fast, now: new Date(process.env.EVAL_NOW ?? "2026-11-06T04:30:00Z"), tz: "Asia/Kolkata" });
  console.log(`\n${r.cases - r.failed}/${r.cases} passed. tokens: ${r.usage.input + r.usage.cacheWrite} in, ${r.usage.output} out, ${r.usage.cacheRead} read from cache.`);
  process.exitCode = r.failed ? 1 : 0;
}
