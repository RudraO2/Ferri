/**
 * Demo data for screenshots and the demo video (spec 24): a believable evening of one
 * live event, so no Desk or Pocket page is empty.
 *
 *   pnpm demo:fill    writes it (clears the old demo data first)
 *   pnpm demo:clear   removes it
 *
 * Every row it writes is marked: ids and message ids start with "demo:", guests use
 * @demo.ferri.invalid addresses, Shield findings carry `demo: true`. Nothing else is
 * touched, and nothing is posted anywhere.
 */
import { and, asc, eq, isNull, like, sql } from "drizzle-orm";
import {
  announcementPosts,
  announcementVersions,
  announcements,
  cards,
  careCases,
  communities,
  createDb,
  crewMembers,
  eventSpaces,
  events,
  guests,
  questions,
  shieldEvents,
  spaces,
} from "@ferri/db";

const MARK = "demo:";
const GUEST_DOMAIN = "demo.ferri.invalid";
const { db, close } = createDb();

// A small seeded random, so every fill looks the same.
let seed = 7;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

const PEOPLE = ["Priya", "Arjun", "Meera", "Kabir", "Sana", "Rohan", "Ishita", "Dev", "Ananya", "Vikram", "Zoya", "Neel", "Tara", "Aditya", "Riya", "Farhan", "Leela", "Omar", "Nisha", "Karan"];

/** Questions members ask, by topic, with what Ferri answered when it knew. */
// Every answer matches the seeded Build Night knowledge (seed/events/build-night).
const KNOWN = [
  ["schedule", "when does hacking start?", "Hacking starts at 11:00 AM on Saturday, right after team formation."],
  ["schedule", "when do submissions close?", "Submissions close at 7:00 AM on Sunday."],
  ["venue", "where is the venue?", "Koramangala Makerspace, 3rd floor, 80 Feet Road, Koramangala. The entrance is next to the blue bakery."],
  ["venue", "how do I get there by metro?", "Take the Pink Line to Koramangala station; the venue is a 10 minute walk."],
  ["food", "what time is dinner?", "Dinner is at 8:30 PM on Saturday, and there is a midnight snack at 12:30 AM."],
  ["food", "will there be vegan food?", "Yes. All meals are vegetarian, with vegan and Jain options on request at registration."],
  ["teams", "can I join without a team?", "Yes. You can come solo; team formation is at 10:30 AM on Saturday."],
  ["teams", "how many people per team?", "Teams have 2 to 4 people."],
  ["tech", "what's the wifi password?", "The network is LanternGuest and the password is buildnight2026."],
  ["rules", "can we use code we wrote before?", "Projects must be started at the event; you may use open-source libraries."],
  ["prizes", "what are the prizes?", "First place wins ₹40,000, second ₹25,000 and third ₹10,000. Every team that demos gets swag."],
  ["judging", "how long is each demo?", "Each team gets 4 minutes to demo and 2 minutes of questions."],
] as const;
const ASK_STYLE = (q: string) => pick([`@ferri ${q}`, `@ferri ${q}`, `hey @ferri ${q}`, `${q.charAt(0).toUpperCase()}${q.slice(1)} @ferri`]);

async function clear() {
  const like_ = `${MARK}%`;
  const cardIds = (await db.select({ id: cards.id }).from(cards).where(like(cards.switchSessionId, like_))).map((c) => c.id);
  await db.delete(questions).where(like(questions.messageId, like_));
  await db.delete(careCases).where(like(careCases.sourceMessageId, like_));
  await db.delete(announcements).where(like(announcements.sourceMessageId, like_)); // posts and versions cascade
  if (cardIds.length) await db.delete(cards).where(like(cards.switchSessionId, like_));
  await db.delete(shieldEvents).where(sql`${shieldEvents.findings}::text like '%"demo": true%'`);
  await db.delete(guests).where(like(guests.email, `%@${GUEST_DOMAIN}`));
  const demoSpaces = await db.select({ id: spaces.id }).from(spaces).where(like(spaces.switchRoomId, like_));
  for (const s of demoSpaces) {
    await db.delete(eventSpaces).where(eq(eventSpaces.spaceId, s.id));
    await db.delete(spaces).where(eq(spaces.id, s.id));
  }
  console.log(`Demo data removed (${cardIds.length} cards, ${demoSpaces.length} demo spaces, and their questions, cases, posts, Shield events, guests).`);
}

async function fill() {
  await clear();
  const [c] = await db.select().from(communities).orderBy(asc(communities.createdAt)).limit(1);
  if (!c) throw new Error("No community yet. Run `pnpm kb seed` first.");
  const [ev] = await db
    .select()
    .from(events)
    .where(and(eq(events.communityId, c.id), isNull(events.closedAt)))
    .orderBy(asc(events.startsAt))
    .limit(1);
  if (!ev) throw new Error("No live event. Run `pnpm kb seed` first.");

  // One members space per platform: the real one when it exists, else a demo space.
  const all = await db.select().from(spaces).where(eq(spaces.communityId, c.id));
  const crewSpace = all.find((s) => s.name === "ferri-crew") ?? all[0];
  const PLATFORMS = ["discord", "telegram", "whatsapp_web", "slack", "mattermost"] as const;
  const NAMES: Record<string, string> = {
    discord: "Lantern Labs Discord: build-night",
    telegram: "Telegram: Lantern Build Night",
    whatsapp_web: "WhatsApp: Lantern Build Night",
    slack: "Pulse Slack: build-night",
    mattermost: "ferri-lab",
  };
  const bySpace: Record<string, typeof spaces.$inferSelect> = {};
  for (const p of PLATFORMS) {
    let s = all.find((x) => x.platform === p && x.name === NAMES[p]) ?? all.find((x) => x.platform === p && x.state === "known" && x.id !== crewSpace?.id);
    if (!s) {
      [s] = await db
        .insert(spaces)
        .values({ communityId: c.id, switchRoomId: `${MARK}${p}`, name: NAMES[p]!, platform: p, state: "known", lastMessageAt: new Date() })
        .returning();
      await db.insert(eventSpaces).values({ eventId: ev.id, spaceId: s!.id, mode: "auto", role: "members" });
    }
    bySpace[p] = s!;
  }
  const weights = [0.34, 0.24, 0.17, 0.14, 0.11];
  const platformFor = () => {
    let r = rand();
    for (let i = 0; i < PLATFORMS.length; i++) if ((r -= weights[i]!) <= 0) return PLATFORMS[i]!;
    return PLATFORMS[0]!;
  };

  const crew = await db.select().from(crewMembers).where(eq(crewMembers.communityId, c.id));
  const crewNames = [...new Set([...crew.map((m) => m.name), "Sam", "Asha"])];
  const crewRoom = crewSpace?.switchRoomId ?? `${MARK}crew`;
  const cardTimes = (createdAt: Date) => ({
    nudgeAt: new Date(createdAt.getTime() + 5 * 60_000),
    escalateAt: new Date(createdAt.getTime() + 15 * 60_000),
    expiresAt: new Date(createdAt.getTime() + 6 * 3600_000),
  });

  // ── Questions over the last 10 hours: more each hour, and Ferri answers more alone ──
  // A question Ferri does not know opens a card; the crew answers it within minutes,
  // everyone who asked gets the answer, and Ferri knows it from then on.
  const ANSWERS: Record<string, string> = {
    "are there showers at the venue?": "Yes, two showers on the 3rd floor. Towels are at the help desk.",
    "will the talks be recorded?": "Yes, the opening talk goes up on our YouTube channel next week.",
    "can a team have members from two colleges?": "Yes, teams can mix colleges and companies.",
    "is the hardware lab open all night?": "Yes, the 2nd floor hardware lab is open all night. Sign the sheet at the door.",
    "is there a printer we can use?": "Yes, at the help desk. Up to 10 pages per team.",
    "are mentors around after midnight?": "Two mentors stay all night; find them at the help desk.",
    "can we use the rooftop?": "The rooftop is open until 11:00 PM.",
    "is there a locker for bags?": "Yes, lockers are at check-in. Bring your own lock.",
    "can my friend come watch the demos?": "Yes, visitors can watch from 8:00 AM on Sunday. They need a photo ID at the door.",
    "is there a first aid kit?": "Yes, at the help desk on the 3rd floor.",
  };
  const LEARNABLE = Object.keys(ANSWERS);
  const OPEN = [
    { text: "can we bring our own monitor?", topic: "venue", askers: 2 },
    { text: "can I bring my dog?", topic: "rules", askers: 1 },
    { text: "is there bike parking?", topic: "venue", askers: 1 },
  ];
  let qn = 0;
  const qRows: (typeof questions.$inferInsert)[] = [];
  const ask = (at: Date, text: string, topic: string, alone: boolean, reply: string | null) => {
    const p = platformFor();
    const s = bySpace[p]!;
    const who = pick(PEOPLE);
    qn++;
    const row: typeof questions.$inferInsert = {
      communityId: c.id,
      eventId: ev.id,
      roomId: s.switchRoomId,
      spaceId: s.id,
      messageId: `${MARK}q:${qn}`,
      askerId: `${MARK}${who.toLowerCase()}`,
      askerName: who,
      text: ASK_STYLE(text),
      addressed: true,
      outcome: alone ? "answered" : "unknown",
      replyText: alone ? reply : "I don't have that yet. I'm checking with the team.",
      model: "claude-haiku-5-5",
      latencyMs: 900 + Math.floor(rand() * 1600),
      askedAt: at,
      triage: { topic },
    };
    qRows.push(row);
    return row;
  };
  const learned = new Set<string>();
  let answeredCards = 0;
  for (let h = 9; h >= 0; h--) {
    const progress = (9 - h) / 9; // 0 at the start of the evening, 1 now
    const count = h === 0 ? 30 : Math.round(8 + progress * 14 + rand() * 4);
    const aloneShare = h === 0 ? 0.95 : 0.34 + progress * 0.5 + (rand() - 0.5) * 0.04;
    const fresh = new Map<string, (typeof questions.$inferInsert)[]>();
    for (let i = 0; i < count; i++) {
      // Inside clock hour h (0 = the current hour, up to now), as the Overview buckets them.
      const hourStart = new Date();
      hourStart.setMinutes(0, 0, 0);
      const from = hourStart.getTime() - h * 3600_000;
      const span = h === 0 ? Math.max(60_000, Date.now() - from - 60_000) : 3600_000;
      const at = new Date(from + Math.floor(rand() * span));
      if (rand() < aloneShare) {
        // Known: from the seed, or something the crew taught it earlier tonight.
        const useLearned = learned.size && rand() < 0.25;
        if (useLearned) {
          const key = pick([...learned]);
          ask(at, key, "general", true, ANSWERS[key]!);
        } else {
          const [topic, text, reply] = pick(KNOWN);
          ask(at, text, topic, true, reply);
        }
      } else {
        const remaining = LEARNABLE.filter((k) => !learned.has(k));
        const key = remaining.length ? pick(remaining) : pick(LEARNABLE);
        fresh.set(key, [...(fresh.get(key) ?? []), ask(at, key, "general", false, null)]);
      }
    }
    for (const [key, qs] of fresh) {
      qs.sort((a, b) => a.askedAt!.getTime() - b.askedAt!.getTime());
      const createdAt = new Date(qs[0]!.askedAt!.getTime() + 20_000);
      const answeredAt = new Date(Math.max(qs[qs.length - 1]!.askedAt!.getTime() + 30_000, createdAt.getTime() + (3 + Math.floor(rand() * 8)) * 60_000));
      const [card] = await db
        .insert(cards)
        .values({
          communityId: c.id,
          eventId: ev.id,
          crewRoomId: crewRoom,
          switchSessionId: `${MARK}cards`,
          kind: "question",
          topic: "general",
          question: key.charAt(0).toUpperCase() + key.slice(1),
          status: "answered",
          ...cardTimes(createdAt),
          answeredAt,
          answeredBy: pick(crewNames),
          answeredVia: pick(["card", "card", "chat"]),
          answerText: ANSWERS[key]!,
          createdAt,
          updatedAt: answeredAt,
        })
        .returning({ id: cards.id });
      answeredCards++;
      for (const q of qs) Object.assign(q, { cardId: card!.id, resolution: "answered", resolvedAt: answeredAt, resolutionText: ANSWERS[key]! });
      learned.add(key);
    }
  }
  // Three questions still waiting for the crew, asked in the last few minutes.
  for (const o of OPEN) {
    const at = minutesAgo(3 + Math.floor(rand() * 9));
    const [card] = await db
      .insert(cards)
      .values({
        communityId: c.id,
        eventId: ev.id,
        crewRoomId: crewRoom,
        switchSessionId: `${MARK}cards`,
        kind: "question",
        topic: o.topic,
        question: o.text.charAt(0).toUpperCase() + o.text.slice(1),
        status: "open",
        ...cardTimes(at),
        createdAt: at,
        updatedAt: at,
      })
      .returning({ id: cards.id });
    for (let i = 0; i < o.askers; i++) ask(new Date(at.getTime() - (i + 1) * 40_000), o.text, o.topic, false, null).cardId = card!.id;
  }
  for (let i = 0; i < qRows.length; i += 200) await db.insert(questions).values(qRows.slice(i, i + 200));

  // A reply waiting for an OK (an Approve space).
  const replyAt = minutesAgo(6);
  await db.insert(cards).values({
    communityId: c.id,
    eventId: ev.id,
    crewRoomId: crewRoom,
    switchSessionId: `${MARK}cards`,
    kind: "reply",
    topic: "schedule",
    question: "Is the hardware lab open all night?",
    draftText: "Yes, the hardware lab on the 2nd floor is open all night. Sign the sheet at the door.",
    targetRoomId: bySpace.slack!.switchRoomId,
    status: "open",
    ...cardTimes(replyAt),
    createdAt: replyAt,
  });

  // ── Care: two open cases, one solved ──
  const [maxCase] = await db.select({ n: sql<number>`coalesce(max(${careCases.number}), 0)::int` }).from(careCases).where(eq(careCases.communityId, c.id));
  const caseRows = [
    { kind: "stuck", technical: true, severity: "normal", topic: "setup", reason: "Docker will not start on their laptop; they have tried twice.", quote: "docker keeps crashing, I've lost an hour", person: "Kabir", p: "discord", status: "open", m: 9 },
    { kind: "upset", technical: false, severity: "high", topic: "teams", reason: "Their teammate left and they feel stranded before demos.", quote: "my team just left, I don't know what to do", person: "Ishita", p: "telegram", status: "helping", m: 22, owner: crewNames[0] },
    { kind: "confused", technical: false, severity: "normal", topic: "submission", reason: "Did not know where to submit; now submitted.", quote: "where do we even submit??", person: "Omar", p: "whatsapp_web", status: "solved", m: 140, owner: crewNames[1] ?? crewNames[0] },
  ];
  for (const [i, k] of caseRows.entries()) {
    const s = bySpace[k.p]!;
    const at = minutesAgo(k.m);
    await db.insert(careCases).values({
      communityId: c.id,
      eventId: ev.id,
      number: (maxCase?.n ?? 0) + i + 1,
      spaceId: s.id,
      roomId: s.switchRoomId,
      personId: `${MARK}${k.person.toLowerCase()}`,
      personName: k.person,
      platform: k.p,
      kind: k.kind,
      technical: k.technical,
      severity: k.severity,
      topic: k.topic,
      reason: k.reason,
      quote: k.quote,
      status: k.status,
      ownerName: k.owner ?? null,
      sourceMessageId: `${MARK}care:${i + 1}`,
      lastMessageAt: at,
      closedAt: k.status === "solved" ? minutesAgo(k.m - 25) : null,
      closedBy: k.status === "solved" ? k.owner : null,
      resolution: k.status === "solved" ? "Showed them the Submit button on the event site." : null,
      createdAt: at,
      updatedAt: at,
    });
  }

  // ── Announcements: two posted everywhere (one edited in place), one waiting ──
  const posted = [
    { title: "Lunch moves to 1:30 PM", text: "Lunch moves to 1:30 PM today, on the 3rd floor.", v: 2, m: 300, by: crewNames[0]! },
    { title: "Doors open at 9:00 AM", text: "Doors open at 9:00 AM for check-in. Bring a government photo ID that matches your registration.", v: 1, m: 560, by: crewNames[1] ?? crewNames[0]! },
  ];
  for (const [i, a] of posted.entries()) {
    const at = minutesAgo(a.m);
    const [row] = await db
      .insert(announcements)
      .values({ communityId: c.id, eventId: ev.id, title: a.title, status: "sent", text: a.text, liveVersion: a.v, sentAt: at, origin: "chat", requestedBy: a.by, sourceMessageId: `${MARK}ann:${i + 1}`, createdAt: at, updatedAt: at })
      .returning({ id: announcements.id });
    for (let v = 1; v <= a.v; v++) {
      await db.insert(announcementVersions).values({
        announcementId: row!.id,
        version: v,
        title: a.title,
        draft: v === 1 && a.v > 1 ? a.text.replace("1:30", "1:00") : a.text,
        text: v === 1 && a.v > 1 ? a.text.replace("1:30", "1:00") : a.text,
        status: "approved",
        reason: v > 1 ? "lunch moves to 1:30" : null,
        proposedBy: a.by,
        approvedBy: a.by,
        approvedAt: at,
        createdAt: at,
      });
    }
    for (const p of PLATFORMS) {
      const s = bySpace[p]!;
      await db.insert(announcementPosts).values({ announcementId: row!.id, spaceId: s.id, roomId: s.switchRoomId, spaceName: s.name, platform: p, eventId: `${MARK}post:${i}:${p}`, version: a.v, status: a.v > 1 ? "edited" : "posted" });
    }
  }
  const waitAt = minutesAgo(4);
  const [waiting] = await db
    .insert(announcements)
    .values({ communityId: c.id, eventId: ev.id, title: "Judging starts at 8:00 AM sharp", status: "waiting", origin: "decision", requestedBy: "Ferri", sourceMessageId: `${MARK}ann:3`, createdAt: waitAt, updatedAt: waitAt })
    .returning({ id: announcements.id });
  const [annCard] = await db
    .insert(cards)
    .values({
      communityId: c.id,
      eventId: ev.id,
      crewRoomId: crewRoom,
      switchSessionId: `${MARK}cards`,
      kind: "announce",
      topic: "schedule",
      question: "Judging starts at 8:00 AM sharp",
      announcementId: waiting!.id,
      announcementVersion: 1,
      status: "open",
      ...cardTimes(waitAt),
      createdAt: waitAt,
    })
    .returning({ id: cards.id });
  await db.insert(announcementVersions).values({
    announcementId: waiting!.id,
    version: 1,
    title: "Judging starts at 8:00 AM sharp",
    draft: "Judging starts at 8:00 AM sharp on Sunday, right after breakfast. Each team gets 4 minutes to demo and 2 minutes of questions.",
    status: "waiting",
    reason: "the crew decided it in ferri-crew",
    proposedBy: "Ferri",
    cardId: annCard!.id,
    createdAt: waitAt,
  });

  // ── Shield: risky links blocked through the evening ──
  const SHIELD = [
    ["lookalike_link", "A link to discord-nitro-gift.example, a lookalike of discord.com"],
    ["scam_link", "A link to a known giveaway scam page"],
    ["flood", "Six links in one minute from one sender"],
    ["secret", "An API key pasted in a members space (redacted)"],
  ] as const;
  for (let i = 0; i < 9; i++) {
    const [detector, reason] = pick(SHIELD);
    const s = bySpace[platformFor()]!;
    await db.insert(shieldEvents).values({
      roomId: s.switchRoomId,
      spaceId: s.id,
      role: "user",
      outcome: detector === "secret" ? "redacted" : "blocked",
      findings: [{ category: detector === "secret" ? "secret" : "link", detector_name: detector, severity: "high", reason, demo: true } as never],
      latencyMs: 2 + Math.floor(rand() * 7),
      alertedCrewAt: minutesAgo(1),
      createdAt: minutesAgo(Math.floor(rand() * 580) + 5),
    });
  }

  // ── Guests: a full house with a short waitlist ──
  const LAST = ["Sharma", "Iyer", "Khan", "Patel", "Reddy", "Das", "Menon", "Gupta", "Bose", "Nair"];
  for (let i = 0; i < 64; i++) {
    const first = PEOPLE[i % PEOPLE.length]!;
    const last = LAST[Math.floor(i / 2) % LAST.length]!;
    const status = i < 52 ? "going" : i < 58 ? "waitlist" : i < 61 ? "pending" : "not_going";
    await db.insert(guests).values({
      communityId: c.id,
      eventId: ev.id,
      email: `${first}.${last}.${i}@${GUEST_DOMAIN}`.toLowerCase(),
      name: `${first} ${last}`,
      sources: [i % 3 ? "site" : "luma"],
      status,
      // RSVP codes are letters and digits only (the public /rsvp/<code> page checks that).
      code: `demo${String(i).padStart(2, "0")}${Math.floor(rand() * 1e9).toString(36)}`,
      registeredAt: minutesAgo(60 * 24 * (1 + (i % 9))),
      confirmedAt: status === "going" && i % 2 ? minutesAgo(60 * (2 + (i % 20))) : null,
      checkedInAt: status === "going" && i < 41 ? minutesAgo(30 + i * 9) : null,
      freedAt: status === "not_going" ? minutesAgo(60 * 3) : null,
    });
  }

  const alone = qRows.filter((q) => q.outcome === "answered").length;
  console.log(
    `Demo data written for ${ev.name}: ${qRows.length} questions (${alone} answered by Ferri alone), ${answeredCards + OPEN.length + 2} cards (${OPEN.length + 2} open), ${caseRows.length} care cases, 3 announcements, 9 Shield blocks, 64 guests.`,
  );
  console.log("Remove it with: pnpm demo:clear");
}

const cmd = process.argv[2];
try {
  if (cmd === "fill") await fill();
  else if (cmd === "clear") await clear();
  else {
    console.log("Usage: pnpm demo:fill | pnpm demo:clear");
    process.exitCode = 1;
  }
} finally {
  await close();
}
