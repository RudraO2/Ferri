import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  ClipboardCheck,
  Dices,
  FileSpreadsheet,
  Gavel,
  GraduationCap,
  HandHeart,
  Handshake,
  LifeBuoy,
  Lock,
  Mic,
  PackageSearch,
  PencilLine,
  ShieldAlert,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { Art, FerriAvatar } from "@/components/ferri";
import { PlatformLogo } from "@/components/platform";
import { doc } from "../_components/links";

export const metadata: Metadata = {
  title: "Use cases: made for volunteer crews",
  description:
    "How Ferri runs the group chats for hackathons, meetups, conferences, festivals, workshops and game nights: the questions attendees ask, the desks Ferri sets up for each, and a day with Ferri.",
};

/* ── The desks, from skills/desks/*.md ────────────────────────────────── */

type DeskKind = "help" | "judging" | "mentors" | "volunteers" | "checkin" | "speakers" | "sponsors" | "food" | "safety" | "lost-found" | "tables";

const DESKS: Record<DeskKind, { name: string; icon: LucideIcon; line: string; sheet?: string; open?: boolean }> = {
  help: { name: "Help", icon: LifeBuoy, open: true, line: "Stuck on setup, the wifi or a build error? Ferri or the Builder helps. A person joins when it needs one." },
  judging: { name: "Judging", icon: Gavel, sheet: "Scores", line: "Judges post scores as they go. Ferri keeps the numbers and never says who's winning." },
  mentors: { name: "Mentors", icon: GraduationCap, open: true, sheet: "Requests", line: "Teams post what they need. Mentors take a request and close it when it's sorted." },
  volunteers: { name: "Volunteers", icon: HandHeart, sheet: "Shifts", line: "Shift sign-ups and swaps, and the same answers for every volunteer to give guests." },
  checkin: { name: "Check-in", icon: ClipboardCheck, sheet: "Check-ins", line: "The door team posts a name and Ferri ticks the guest off the guest list." },
  speakers: { name: "Speakers", icon: Mic, sheet: "Slots", line: "Slots, arrivals and the running order. Questions about the AV are answered from your info." },
  sponsors: { name: "Sponsors", icon: Handshake, sheet: "Deliverables", line: "What each sponsor was promised, who owns it and where it stands." },
  food: { name: "Food", icon: UtensilsCrossed, sheet: "Counts", line: "Counts per meal. Ferri never guesses what's in a dish or whether it's safe for an allergy." },
  safety: { name: "Safety", icon: ShieldAlert, sheet: "Incidents", line: "Every report reaches the person on duty and the leads at once, as an urgent case." },
  "lost-found": { name: "Lost and found", icon: PackageSearch, open: true, sheet: "Items", line: "Lost and found reports, matched up. Valuables are only described roughly." },
  tables: { name: "Tables", icon: Dices, open: true, sheet: "Assignments", line: "Hosts post their game and free seats. Players find a table." },
};

/* ── The packs, from skills/packs/*.md ─────────────────────────────────── */

type Use = {
  id: string;
  name: string;
  art: string;
  tagline: string;
  crowd: string;
  asks: string[];
  desks: DeskKind[];
  chat: { app: string; room: string; who: string; q: string; a: string; source: string };
  day: [string, React.ReactNode][];
  tasks: string[];
};

const USES: Use[] = [
  {
    id: "hackathons",
    name: "Hackathons",
    art: "stage-build",
    tagline: "Teams build against the clock.",
    crowd: "Participants build in teams, mentors help them think, and judges score demos. Technical problems go to the help desk, and scores stay out of participants' groups.",
    asks: ["When do submissions close?", "What's the wifi password?", "Can a mentor help us with auth?", "Our deploy fails with a build error"],
    desks: ["help", "judging", "mentors", "volunteers", "checkin"],
    chat: {
      app: "discord",
      room: "#build-night",
      who: "dev_arjun",
      q: "@ferri when do submissions close?",
      a: "Submissions close at 7:00 AM on Sunday 22 November. Judging starts at 8:00 AM, after breakfast.",
      source: "Lantern Build Night schedule (Sunday 22 November)",
    },
    day: [
      ["Morning", "The door team posts “checked in Asha” in the check-in desk, and Ferri ticks her off the guest list with the running count."],
      ["Afternoon", "A team pastes a build error in the help desk. The Builder asks for the exact error and helps them step by step."],
      ["Judging", "Judges post “Team Alpha 8 for innovation”. “@ferri show the scores” posts the ranked totals, counted in code."],
    ],
    tasks: ["Write the judging criteria and the scoring scale", "Recruit mentors and set their hours", "Make the volunteer shift plan", "Import the guest list for check-in", "Share the wifi details and the submission link"],
  },
  {
    id: "meetups",
    name: "Meetups",
    art: "ferri-wave",
    tagline: "Talks, then time to meet people.",
    crowd: "A room of regulars and first-timers. Questions about the talks, the order and the timings go by the run of show, and speakers coordinate in their own desk.",
    asks: ["What time does the first talk start?", "Who's speaking tonight?", "Is there an HDMI adapter for speakers?", "Can I come if I didn't RSVP?"],
    desks: ["speakers", "checkin", "volunteers"],
    chat: {
      app: "telegram",
      room: "Example meetup group",
      who: "Sana",
      q: "what time does the first talk start?",
      a: "Doors open at 6:00 PM and the first talk starts at 6:30 PM.",
      source: "Meetup run of show (Talks)",
    },
    day: [
      ["Doors", "Two volunteers at the door post names. Ferri ticks each guest off the RSVP list and asks about any name it can't find."],
      ["Before the talks", "A speaker says “I'm here” in the speakers desk, so the slot sheet shows who is still on the way."],
    ],
    tasks: ["Confirm the speakers and the running order", "Check the projector, adapters and mic", "Import the RSVP list for check-in", "Ask two volunteers to help at the door"],
  },
  {
    id: "conferences",
    name: "Conferences",
    art: "ferri-ticket",
    tagline: "Several rooms, many talks, sponsors to look after.",
    crowd: "Attendees moving between rooms all day. Questions about talks and rooms go by the schedule, sponsors are looked after in their desk, and anyone with a problem goes to help.",
    asks: ["Which room is the keynote in?", "Where do I pick up my badge?", "When is the lunch break?", "My ticket won't scan at the door"],
    desks: ["speakers", "sponsors", "volunteers", "checkin", "help"],
    chat: {
      app: "slack",
      room: "#example-conf",
      who: "Tara",
      q: "@ferri which room is the keynote in?",
      a: "Hall A on the ground floor. Doors open at 9:30.",
      source: "Conference schedule (Day 1)",
    },
    day: [
      ["Registration", "Volunteers swap shifts in the volunteer desk. “Show the shifts” lists who's on registration and the rooms."],
      ["Midday", "“What's left for CloudCo?” in the sponsors desk lists the open promises from the deliverables sheet."],
    ],
    tasks: ["Confirm every speaker, talk and slot", "List what each sponsor was promised and who owns it", "Make the volunteer shift plan", "Import the attendee list for check-in", "Check the AV in every room"],
  },
  {
    id: "festivals",
    name: "Festivals",
    art: "ferri-party",
    tagline: "A big, busy crowd. Safety first.",
    crowd: "Hundreds of people, food stalls and a lot of noise. Anything unsafe goes to the person on duty at once, food questions go by the menu and stall times, and lost things go to lost and found.",
    asks: ["Is there a vegan option?", "When do the food stalls close?", "Where is first aid?", "I lost my phone near the stage"],
    desks: ["volunteers", "food", "safety", "lost-found"],
    chat: {
      app: "whatsapp",
      room: "Example festival group",
      who: "Kabir",
      q: "where is first aid?",
      a: "At the info tent by the main gate, open until the last act ends.",
      source: "Festival venue guide (First aid)",
    },
    day: [
      ["Evening", "Someone posts “found a blue water bottle near the stage”. It goes on the item list, and Ferri points out the matching lost report."],
      ["Late", "A volunteer reports someone unwell in the safety desk. It's logged, and the person on duty and the leads get an urgent push."],
    ],
    tasks: ["Make the volunteer shift plan (gates, stalls, cleanup)", "Confirm the food stalls, the menu and dietary options", "Name the person on duty for safety at every hour", "Set up a lost and found spot"],
  },
  {
    id: "workshops",
    name: "Workshops",
    art: "ferri-thinking",
    tagline: "Everyone follows along on their own laptop.",
    crowd: "People working through exercises, each on their own machine. Setup problems are the most common questions, so the help desk, with the Builder, does most of the work.",
    asks: ["Do I need to install anything first?", "Where are the materials?", "npm install fails at step 3", "Is there wifi in the room?"],
    desks: ["help", "checkin"],
    chat: {
      app: "discord",
      room: "#example-workshop",
      who: "kiran",
      q: "do I need to install anything first?",
      a: "Yes: Node 22 and VS Code. The setup steps are pinned in the help desk.",
      source: "Workshop setup guide (Before you come)",
    },
    day: [
      ["The day before", "The crew asks Ferri to share the setup steps. One OK posts them to every group."],
      ["Mid-exercise", "Someone pastes an error in the help desk. The Builder asks what they tried and walks them through, without ever asking for a password or key."],
    ],
    tasks: ["Share the setup steps and the materials a day before", "Import the RSVP list for check-in", "Test the exercises on a fresh laptop"],
  },
  {
    id: "game-nights",
    name: "Game nights",
    art: "ferri-main",
    tagline: "Players move between tables. Hosts teach the games.",
    crowd: "Regulars, newcomers and a stack of board games. Players looking for a game are pointed to the tables desk, and anything left behind goes to lost and found.",
    asks: ["Where can I play Codenames?", "Any free seats?", "Can I bring my own game?", "Did anyone find a dice bag?"],
    desks: ["tables", "checkin", "lost-found"],
    chat: {
      app: "telegram",
      room: "Example game night group",
      who: "Rahul",
      q: "can I bring my own game?",
      a: "Yes. Tell a host when you arrive and they'll find you a table.",
      source: "Game night house rules",
    },
    day: [
      ["Start of the night", "Hosts post “Table 3: Catan, host Ravi, 2 seats free”. A player asking where to play is pointed to a table with free seats."],
      ["Closing up", "A dice bag left behind goes on the lost and found list, described so its owner can claim it."],
    ],
    tasks: ["List the games people are bringing and who hosts each table", "Plan the table layout and the number of seats", "Import the RSVP list for check-in", "Set up a lost and found spot"],
  },
];

/* ── Pieces ───────────────────────────────────────────────────────────── */

function DeskRow({ kind }: { kind: DeskKind }) {
  const d = DESKS[kind];
  return (
    <li className="flex gap-3 py-3">
      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-brand-soft text-brand-ink">
        <d.icon size={16} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[15px] font-semibold text-zinc-900">{d.name}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-px text-[11.5px] font-medium text-zinc-600">
            {d.open ? "open to everyone" : (
              <>
                <Lock size={10} aria-hidden /> private
              </>
            )}
          </span>
          {d.sheet ? (
            <span className="inline-flex items-center gap-1 text-[12px] text-zinc-500">
              <FileSpreadsheet size={12} aria-hidden /> {d.sheet} sheet
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[14px] leading-snug text-zinc-600">{d.line}</p>
      </div>
    </li>
  );
}

function Chat({ chat }: { chat: Use["chat"] }) {
  return (
    <div className="overflow-hidden rounded-[20px] border border-zinc-200 bg-white shadow-[var(--shadow-pop)]">
      <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 text-[12.5px] font-medium text-zinc-500">
        <PlatformLogo platform={chat.app} size={14} />
        <span className="truncate">{chat.room}</span>
      </div>
      <div className="pg-bubbles space-y-3 p-4 sm:p-5">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[12px] font-semibold text-zinc-700" aria-hidden>
            {chat.who.charAt(0).toUpperCase()}
          </span>
          <div className="max-w-[85%] rounded-[16px] rounded-tl-[4px] border border-zinc-200 bg-white px-3.5 py-2">
            <div className="text-[12.5px] font-semibold text-zinc-900">{chat.who}</div>
            <div className="text-[14.5px] leading-snug text-zinc-700">{chat.q}</div>
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <FerriAvatar size={28} className="mt-0.5" />
          <div className="max-w-[85%] rounded-[16px] rounded-tl-[4px] border border-[var(--brand-line)] bg-white px-3.5 py-2">
            <div className="text-[12.5px] font-semibold text-brand-ink">Ferri</div>
            <div className="text-[14.5px] leading-snug text-zinc-800">{chat.a}</div>
            <div className="mt-1.5 border-t border-zinc-200 pt-1.5 text-[12px] text-zinc-500">Source: {chat.source}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */

export default function UseCasesPage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative isolate -mt-[76px] pt-[128px] pb-14">
        <div className="hero-sky" aria-hidden>
          <span className="cloud top-[12%] left-[-6%] h-[110px] w-[400px]" />
          <span className="cloud top-[34%] left-[12%] h-[60px] w-[220px] [animation-delay:-12s]" />
          <span className="cloud top-[8%] right-[-4%] h-[120px] w-[440px] [animation-delay:-6s]" />
        </div>
        <div className="site-section text-center">
          <h1 className="rise mx-auto max-w-[1100px] text-zinc-900">
            <span className="display block text-[clamp(42px,6.2vw,84px)]">Made for volunteer crews.</span>
            <span className="font-serif-display block text-[clamp(40px,6.2vw,82px)] leading-[1.04]">Six kinds of events, one teammate.</span>
          </h1>
          <p className="rise mx-auto mt-6 max-w-[660px] text-[clamp(17px,1.5vw,19px)] leading-[1.6] text-zinc-600 [animation-delay:120ms]">
            Each kind of event comes with a starter pack: the desks it runs on, a list of starter tasks for the plan, and how Ferri should behave. One card in the crew room
            sets it all up.
          </p>

          <nav aria-label="Event types" className="rise mt-10 [animation-delay:200ms]">
            <ul className="mx-auto grid max-w-[860px] grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {USES.map((u) => (
                <li key={u.id}>
                  <a
                    href={`#${u.id}`}
                    className="group flex h-full flex-col items-center gap-1 rounded-[20px] border border-white/70 bg-white/70 px-2 pt-3 pb-3 text-[14.5px] font-semibold text-zinc-800 backdrop-blur transition hover:border-[var(--brand-line)] hover:bg-white"
                  >
                    <Art name={u.art} width={72} height={72} className="w-[56px] transition group-hover:-translate-y-0.5" />
                    {u.name}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </section>

      {/* ── One section per event type ───────────────────────── */}
      {USES.map((u, i) => {
        const flip = i % 2 === 1;
        return (
          <section
            key={u.id}
            id={u.id}
            aria-labelledby={`${u.id}-title`}
            className={`scroll-mt-24 py-20 lg:py-24 ${flip ? "border-y border-zinc-200 bg-zinc-100/60" : ""}`}
          >
            <div className="site-section grid items-start gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16">
              {/* Who and which desks */}
              <div className={flip ? "lg:order-2" : ""}>
                <div className="flex items-end gap-4">
                  <Art name={u.art} width={120} height={120} className="w-[84px] shrink-0 sm:w-[104px]" />
                  <div className="min-w-0 pb-1">
                    <p className="kicker mb-1.5">{u.tagline}</p>
                    <h2 id={`${u.id}-title`} className="display text-[clamp(36px,5vw,60px)] text-zinc-900">
                      {u.name}
                    </h2>
                  </div>
                </div>
                <p className="mt-5 max-w-[580px] text-[16.5px] leading-[1.65] text-zinc-600">{u.crowd}</p>

                <h3 className="mt-8 text-[14px] font-semibold text-zinc-900">What people ask</h3>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {u.asks.map((q) => (
                    <li key={q} className="rounded-[14px] rounded-bl-[4px] border border-zinc-200 bg-white px-3 py-1.5 text-[14px] text-zinc-700">
                      {q}
                    </li>
                  ))}
                </ul>

                <h3 className="mt-8 text-[14px] font-semibold text-zinc-900">The desks Ferri sets up</h3>
                <ul className="mt-1 divide-y divide-zinc-200 border-y border-zinc-200">
                  {u.desks.map((k) => (
                    <DeskRow key={k} kind={k} />
                  ))}
                </ul>
              </div>

              {/* A day with Ferri */}
              <div className={`space-y-8 ${flip ? "lg:order-1" : ""}`}>
                <Chat chat={u.chat} />

                <div>
                  <h3 className="hand text-[26px] leading-none text-zinc-700">A day with Ferri</h3>
                  <ol className="mt-4 space-y-4 border-l-2 border-dashed border-zinc-300 pl-5">
                    {u.day.map(([when, what]) => (
                      <li key={when} className="relative">
                        <span className="absolute top-1.5 -left-[27px] h-3 w-3 rounded-full border-2 border-white bg-brand" aria-hidden />
                        <div className="text-[13px] font-semibold text-brand-ink">{when}</div>
                        <p className="mt-0.5 text-[15px] leading-snug text-zinc-700">{what}</p>
                      </li>
                    ))}
                  </ol>
                </div>

                <details className="group rounded-[16px] border border-zinc-200 bg-white px-4 py-1">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-2.5 text-[14.5px] font-semibold text-zinc-900 [&::-webkit-details-marker]:hidden">
                    {u.tasks.length} starter tasks for the plan
                    <span className="text-[13px] font-medium text-brand-ink group-open:hidden">Show</span>
                    <span className="hidden text-[13px] font-medium text-brand-ink group-open:inline">Hide</span>
                  </summary>
                  <ul className="space-y-1.5 pb-3.5 text-[14px] text-zinc-600">
                    {u.tasks.map((t) => (
                      <li key={t} className="flex gap-2">
                        <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                        {t}
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            </div>
          </section>
        );
      })}

      {/* ── What every pack shares ───────────────────────────── */}
      <section className="site-section py-20 lg:py-28">
        <div className="grid items-start gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <div>
            <p className="kicker">What every pack shares</p>
            <h2 className="display text-[clamp(34px,4.6vw,56px)] text-zinc-900">One card. Every room the event needs.</h2>
            <p className="mt-5 max-w-[580px] text-[17px] leading-[1.65] text-zinc-600">
              Say <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-[14.5px] text-zinc-800">@ferri set up the desks for a hackathon</span> in the crew room.
              Ferri lists every room on one card. &ldquo;Make them&rdquo; makes them, &ldquo;Don&apos;t&rdquo; makes nothing.
            </p>
            <ul className="mt-8 space-y-4">
              {[
                ["Real channels on your app.", "Each desk is a private or open channel on the crew room's platform, with Ferri, the right people and a kickoff message."],
                ["Sheets kept from what people say.", "Scores, shifts, check-ins and counts land on a sheet. Totals are counted in code, and Desk downloads each sheet as CSV."],
                ["Answers with a source, in every room.", "Every desk answers event questions from your info, with the source, like the rest of Ferri."],
                ["Details stay in their room.", "Each desk's skill keeps its scores, guests' emails, phone numbers or sponsor terms inside that room."],
                ["Starter tasks on the plan.", "“Make them” also adds the pack's instructions to the event and its starter tasks to the plan."],
              ].map(([t, d]) => (
                <li key={t} className="flex gap-3 text-[15.5px] leading-snug">
                  <span className="mt-[7px] h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden />
                  <span>
                    <span className="font-semibold text-zinc-900">{t}</span> <span className="text-zinc-600">{d}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <a
                href={doc("desks")}
                className="inline-flex items-center gap-1 rounded-sm text-[15px] font-semibold text-brand-ink underline decoration-[var(--brand-line)] decoration-2 underline-offset-4 transition hover:decoration-brand"
              >
                Read the desks guide <ArrowUpRight size={15} aria-hidden />
              </a>
            </div>
          </div>

          <div className="space-y-5">
            <div className="overflow-hidden rounded-[20px] border border-zinc-200 bg-white shadow-[var(--shadow-pop)]">
              <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 text-[12.5px] font-medium text-zinc-500">
                <PlatformLogo platform="mattermost" size={14} /> ferri-crew
              </div>
              <div className="p-5">
                <div className="rounded-[16px] border border-[var(--brand-line)] bg-brand-soft/50 p-4">
                  <div className="text-[15.5px] font-semibold text-zinc-900">Set up the hackathon desks for Build Night?</div>
                  <ul className="mt-3 grid gap-1.5 font-mono text-[13px] text-zinc-700 sm:grid-cols-2">
                    {[
                      ["#bn-help", false],
                      ["#bn-judging", true],
                      ["#bn-mentors", false],
                      ["#bn-volunteers", true],
                      ["#bn-checkin", true],
                    ].map(([room, priv]) => (
                      <li key={room as string} className="flex items-center gap-1.5">
                        {priv ? <Lock size={12} className="text-zinc-400" aria-label="private" /> : <span className="inline-block w-3" aria-hidden />}
                        {room}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 text-[13px] text-zinc-600">Plus 5 starter tasks on the plan.</div>
                  <div className="mt-4 flex gap-2">
                    <span className="btn-primary pointer-events-none">Make them</span>
                    <span className="btn pointer-events-none">Don&apos;t</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-4 rounded-[20px] border border-dashed border-zinc-300 p-5">
              <PencilLine size={20} className="mt-0.5 shrink-0 text-brand" aria-hidden />
              <div>
                <div className="text-[15.5px] font-semibold text-zinc-900">No desk fits? Describe one.</div>
                <p className="mt-1 text-[14.5px] leading-relaxed text-zinc-600">
                  <span className="font-mono text-[13px] text-zinc-800">@ferri make a desk for the rangoli judges where they post scores per entry, with arjun</span> has
                  Ferri write a new desk skill and show all of it on a card. &ldquo;Make it&rdquo; saves it and makes the room.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4 rounded-[20px] border border-dashed border-zinc-300 p-5">
              <Art name="shore-crew" width={96} height={72} className="w-[72px] shrink-0" />
              <div>
                <div className="text-[15.5px] font-semibold text-zinc-900">Every pack is yours to edit.</div>
                <p className="mt-1 text-[14.5px] leading-relaxed text-zinc-600">
                  Packs and desks are markdown skills. Change one on Desk&apos;s Skills page, with versions and &ldquo;Reset to default&rdquo;.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final call to action ─────────────────────────────── */}
      <section className="px-4 pt-4 pb-20 sm:px-8">
        <div className="relative mx-auto max-w-[1160px] overflow-hidden rounded-[36px] bg-brand px-6 py-14 text-white shadow-[inset_0_-6px_0_var(--brand-lip)] sm:px-14 sm:py-16">
          <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div>
              <h2 className="display text-[clamp(36px,5vw,62px)]">Your next event, with a teammate.</h2>
              <p className="mt-4 max-w-[580px] text-[17px] leading-relaxed text-white">
                Try Ferri on the page with a made-up hackathon, then run your own with one command. It&apos;s free and open source.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/welcome#try" className="btn h-12 border-0 bg-white px-6 text-[15.5px] text-zinc-900 hover:bg-zinc-50">
                  Ask Ferri a question <ArrowRight size={16} aria-hidden />
                </Link>
                <Link href="/start" className="btn h-12 border-white/40 bg-transparent px-6 text-[15.5px] text-white hover:bg-white/10" style={{ boxShadow: "none" }}>
                  Set it up free
                </Link>
                <Link href="/product" className="btn h-12 border-white/40 bg-transparent px-6 text-[15.5px] text-white hover:bg-white/10" style={{ boxShadow: "none" }}>
                  Everything Ferri does
                </Link>
              </div>
            </div>
            <div className="hidden lg:block">
              <Art name="ferri-party" width={240} height={240} className="w-[230px]" />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
