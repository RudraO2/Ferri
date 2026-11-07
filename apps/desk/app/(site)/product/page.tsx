import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BellRing,
  CalendarClock,
  Check,
  FileCode2,
  Globe,
  Image as ImageIcon,
  KeyRound,
  Languages,
  Link2Off,
  ListChecks,
  Mail,
  Megaphone,
  PauseCircle,
  Repeat,
  Share2,
  ShieldCheck,
  Ticket,
  Users,
} from "lucide-react";
import { Art, Ferri, FerriAvatar } from "@/components/ferri";
import { PlatformLogo } from "@/components/platform";
import { DISCORD, doc, TELEGRAM } from "../_components/links";
import { ChapterIndex, type Chapter } from "./chapter-index";

export const metadata: Metadata = {
  title: "Everything Ferri does",
  description:
    "A full tour of Ferri, the open-source AI teammate for event organizers: sourced answers on every app, the crew loop, announcements, guests and RSVPs, care, Shield, the Builder, plan and wrap, Desk and Pocket. Built on Switch.",
};

const CHAPTERS: Chapter[] = [
  { id: "answers", label: "Answers" },
  { id: "crew", label: "The crew loop" },
  { id: "reach", label: "Reach" },
  { id: "care", label: "Care" },
  { id: "safety", label: "Safety" },
  { id: "builder", label: "Builder" },
  { id: "plan-wrap", label: "Plan and Wrap" },
  { id: "desk", label: "Desk and Pocket" },
  { id: "yours", label: "Make it yours" },
];

/* ── Small shared pieces ──────────────────────────────────────────────── */

function Bullets({ items, className = "" }: { items: React.ReactNode[]; className?: string }) {
  return (
    <ul className={`space-y-2.5 ${className}`}>
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2.5 text-[15.5px] leading-snug text-zinc-700">
          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-ink">
            <Check size={12} aria-hidden />
          </span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function Guide({ name, label = "Read the guide" }: { name: string; label?: string }) {
  return (
    <a
      href={doc(name)}
      className="inline-flex items-center gap-1 rounded-sm text-[15px] font-semibold text-brand-ink underline decoration-[var(--brand-line)] decoration-2 underline-offset-4 transition hover:decoration-brand"
    >
      {label} <ArrowUpRight size={15} aria-hidden />
    </a>
  );
}

function Head({ kicker, title, children }: { kicker: string; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <p className="kicker">{kicker}</p>
      <h2 className="display text-[clamp(32px,4.4vw,54px)] text-zinc-900">{title}</h2>
      <p className="mt-5 max-w-[580px] text-[17px] leading-[1.65] text-zinc-600">{children}</p>
    </div>
  );
}

function Cmd({ children, by = "crew" }: { children: React.ReactNode; by?: string }) {
  return (
    <span className="inline-flex max-w-full items-baseline gap-2 rounded-[10px] border border-zinc-200 bg-zinc-50 px-2.5 py-1 font-mono text-[13px] text-zinc-800">
      <span className="shrink-0 text-zinc-400" aria-hidden>
        {by}
      </span>
      <span className="min-w-0 break-words">{children}</span>
    </span>
  );
}

/** A window frame for the small mock UIs. */
function Frame({ title, icon, children, className = "" }: { title: React.ReactNode; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-[20px] border border-zinc-200 bg-white shadow-[var(--shadow-pop)] ${className}`}>
      <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 text-[12.5px] font-medium text-zinc-500">
        {icon}
        <span className="truncate">{title}</span>
      </div>
      {children}
    </div>
  );
}

function FerriLine({ children, source }: { children: React.ReactNode; source?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <FerriAvatar size={28} className="mt-0.5" />
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-brand-ink">Ferri</div>
        <div className="text-[14.5px] leading-snug text-zinc-800">{children}</div>
        {source ? <div className="mt-1 text-[12.5px] text-zinc-500">Source: {source}</div> : null}
      </div>
    </div>
  );
}

function PersonLine({ who, app, children }: { who: string; app?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[12px] font-semibold text-zinc-600" aria-hidden>
        {who.charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-zinc-900">
          {who}
          {app ? <PlatformLogo platform={app} size={13} /> : null}
        </div>
        <div className="text-[14.5px] leading-snug text-zinc-700">{children}</div>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */

export default function ProductPage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative isolate -mt-[76px] pt-[128px] pb-16 sm:pb-20">
        <div className="hero-sky" aria-hidden>
          <span className="cloud top-[14%] left-[-6%] h-[110px] w-[380px]" />
          <span className="cloud top-[36%] left-[10%] h-[60px] w-[220px] [animation-delay:-12s]" />
          <span className="cloud top-[10%] right-[-4%] h-[120px] w-[420px] [animation-delay:-6s]" />
        </div>
        <div className="site-section grid items-center gap-10 lg:grid-cols-[1fr_auto]">
          <div className="text-center lg:text-left">
            <h1 className="rise text-zinc-900">
              <span className="display block text-[clamp(44px,5.8vw,80px)]">Everything Ferri does.</span>
              <span className="font-serif-display block text-[clamp(36px,4.8vw,66px)] leading-[1.04]">From the first question to the last thank-you.</span>
            </h1>
            <p className="rise mx-auto mt-6 max-w-[640px] text-[clamp(17px,1.5vw,19px)] leading-[1.6] text-zinc-600 [animation-delay:120ms] lg:mx-0">
              Answers come first: sourced, on every app, learned from your crew. Around them, Ferri carries the crew&apos;s decisions out to every group, looks after people who
              are stuck, keeps scams out, and helps you plan the event and wrap it up.
            </p>
            <div className="rise mt-8 flex flex-wrap items-center justify-center gap-3 [animation-delay:200ms] lg:justify-start">
              <Link href="/welcome#try" className="btn-primary h-[50px] px-6 text-[15.5px]">
                Ask Ferri a question <ArrowRight size={16} aria-hidden />
              </Link>
              <Link href="/use-cases" className="btn h-[50px] px-6 text-[15.5px]">
                See it per event type
              </Link>
            </div>
          </div>
          <div className="rise hidden justify-center [animation-delay:160ms] lg:flex">
            <Ferri pose="main" size={300} alive decorative priority />
          </div>
        </div>
      </section>

      <div className="relative">
        <ChapterIndex chapters={CHAPTERS} />

        {/* ── 1. Answers ───────────────────────────────────────── */}
        <section id="answers" className="site-section scroll-mt-[140px] py-20 lg:py-28">
          <div className="grid items-start gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
            <div>
              <Head kicker="Answers, sourced and learned" title="An answer with a source, or a straight “I don't know yet”.">
                Ferri answers only from your event&apos;s info and the answers your crew gave it, and names where each answer came from. When nothing fits, it says it&apos;s checking
                with the team, and never guesses.
              </Head>
              <Bullets
                className="mt-8"
                items={[
                  <>A source line under every answer. The check is in code, so no prompt can switch it off.</>,
                  <>Notices questions nobody addressed to it, waits a moment so a person can answer first, and steps in only when it has a sourced answer.</>,
                  <>Every answer the crew gives is saved, so the next person who asks gets it at once.</>,
                  <>
                    The crew can teach it directly: <Cmd>@ferri remember: lockers are on the 2nd floor</Cmd>
                  </>,
                  <>Never answers the same message twice.</>,
                ]}
              />
              <div className="mt-7">
                <Guide name="knowledge" />
              </div>
            </div>

            <div className="space-y-5">
              <Frame title="#build-night, nobody mentioned Ferri" icon={<PlatformLogo platform="discord" size={14} />}>
                <div className="space-y-4 p-5">
                  <PersonLine who="neha.dev">does anyone know the wifi password?</PersonLine>
                  <p className="text-center text-[12px] text-zinc-400">a short wait, so a person can answer first</p>
                  <FerriLine source="Lantern Build Night FAQ (Wi-Fi)">The Wi-Fi network is LanternGuest and the password is buildnight2026.</FerriLine>
                </div>
              </Frame>
              <div className="rounded-[20px] border border-zinc-200 bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[14px] font-semibold text-zinc-900">Each group gets a mode</div>
                  <Ferri pose="thinking" size={64} decorative className="-my-3 w-[56px]" />
                </div>
                <dl className="mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-2">
                  {[
                    ["Off", "Ferri stays out of it."],
                    ["Listen", "Reads and learns. Never posts."],
                    ["Approve", "Every reply waits for an organizer's OK."],
                    ["Auto", "Answers with sources on its own."],
                  ].map(([m, d]) => (
                    <div key={m} className="flex items-baseline gap-3">
                      <dt className={`w-[68px] shrink-0 rounded-full px-2 py-0.5 text-center text-[12.5px] font-semibold ${m === "Auto" ? "bg-brand text-white" : "bg-zinc-100 text-zinc-700"}`}>
                        {m}
                      </dt>
                      <dd className="text-[14px] leading-snug text-zinc-600">{d}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        </section>

        {/* ── 2. The crew loop ─────────────────────────────────── */}
        <section id="crew" className="scroll-mt-[140px] border-y border-zinc-200 bg-zinc-100/60 py-20 lg:py-28">
          <div className="site-section">
            <div className="grid items-end gap-8 lg:grid-cols-[1fr_auto]">
              <Head kicker="The crew loop" title="Answered once. Sent to everyone who asked.">
                When Ferri doesn&apos;t know, the attendee hears &ldquo;I&apos;m checking with the team&rdquo; at once, and one card opens for the person on the crew who owns that
                topic.
              </Head>
              <span className="hidden lg:block">
                <Ferri pose="carry" size={190} decorative />
              </span>
            </div>

            <div className="mt-12 grid items-start gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
              {/* The card and the fan-out */}
              <div className="space-y-4">
                <Frame title="ferri-crew, the crew's private room" icon={<PlatformLogo platform="mattermost" size={14} />}>
                  <div className="p-5">
                    <div className="rounded-[16px] border border-[var(--brand-line)] bg-brand-soft/50 p-4">
                      <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-zinc-600">
                        <span className="rounded-full bg-white px-2 py-0.5 font-semibold text-zinc-900">Card A1</span>
                        <span>venue · for Priya</span>
                        <span className="ml-auto inline-flex items-center gap-1">
                          <PlatformLogo platform="telegram" size={13} />
                          <PlatformLogo platform="slack" size={13} />
                          <PlatformLogo platform="discord" size={13} />3 waiting
                        </span>
                      </div>
                      <div className="mt-2.5 text-[16px] font-semibold text-zinc-900">Can I bring my dog?</div>
                      <div className="mt-1 text-[13px] text-zinc-500">Also asked as &ldquo;are pets allowed at the venue?&rdquo;</div>
                    </div>
                    <div className="mt-4 flex justify-end">
                      <span className="rounded-[14px] rounded-br-[4px] bg-zinc-100 px-3.5 py-2 font-mono text-[13px] text-zinc-800">A1 &ldquo;Yes, dogs are welcome on a leash&rdquo;</span>
                    </div>
                  </div>
                </Frame>
                <ul className="grid gap-2 sm:grid-cols-3" aria-label="The answer reaches each asker on their own app">
                  {[
                    ["telegram", "@meera"],
                    ["slack", "@arjun"],
                    ["discord", "@kiran"],
                  ].map(([app, who]) => (
                    <li key={app} className="flex items-start gap-2 rounded-[14px] border border-zinc-200 bg-white px-3 py-2.5 text-[13px] leading-snug text-zinc-700">
                      <PlatformLogo platform={app} size={15} className="mt-0.5" />
                      <span>
                        <span className="font-semibold text-brand-ink">{who}</span> Yes, dogs are welcome on a leash.
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 rounded-[18px] border border-zinc-200 bg-white p-5">
                  <div className="text-[14px] font-semibold text-zinc-900">Nobody answers? The card climbs a ladder.</div>
                  <ol className="relative mt-4 space-y-3.5 border-l-2 border-dashed border-zinc-300 pl-5">
                    {[
                      ["Card opens", "The topic owner gets it, with a push."],
                      ["Nudge", "The owner is reminded."],
                      ["Escalate", "The whole crew sees it."],
                      ["Unanswered", "Marked as such. Ferri never makes one up."],
                    ].map(([t, d]) => (
                      <li key={t} className="relative text-[14px] leading-snug">
                        <span className="absolute top-1 -left-[27px] h-3 w-3 rounded-full border-2 border-white bg-brand" aria-hidden />
                        <span className="font-semibold text-zinc-900">{t}.</span> <span className="text-zinc-600">{d}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              <div>
                <Bullets
                  items={[
                    <>Cards go to whoever owns the topic: food to the food lead, judging to the judging lead. Owners come from the crew list and the plan.</>,
                    <>The same question in other words joins the same card, so the crew answers it once.</>,
                    <>Answer on the card, from Desk, from your phone, or just tell Ferri in the crew room.</>,
                    <>One answer reaches everyone who was waiting, on their own app, with a real mention.</>,
                    <>Pocket buzzes only the owner&apos;s phone. When someone else answers, the buzz changes to &ldquo;Answered by Priya&rdquo;.</>,
                  ]}
                />
                <div className="mt-8 rounded-[18px] border border-dashed border-zinc-300 p-5">
                  <div className="text-[14px] font-semibold text-zinc-900">A room for each job</div>
                  <p className="mt-1 text-[14.5px] leading-relaxed text-zinc-600">
                    <Cmd>@ferri make a judging desk with arjun</Cmd> makes a private channel with its own instructions and a live sheet Ferri keeps from what people say
                    (&ldquo;Team Alpha 8 for innovation&rdquo;). Eleven desks come with Ferri.{" "}
                    <Link href="/use-cases" className="font-semibold text-brand-ink underline decoration-[var(--brand-line)] underline-offset-4">
                      See them per event
                    </Link>
                    .
                  </p>
                </div>
                <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2">
                  <Guide name="knowledge" />
                  <Guide name="desks" label="Desks guide" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── 3. Reach ─────────────────────────────────────────── */}
        <section id="reach" className="site-section scroll-mt-[140px] py-20 lg:py-28">
          <div className="grid items-start gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
            <div className="order-2 lg:order-1">
              <Frame title="Announcement, waiting for one OK" icon={<Megaphone size={14} aria-hidden />}>
                <div className="p-5">
                  <div className="text-[12.5px] text-zinc-500">Drafted from Rudra in ferri-crew</div>
                  <p className="mt-2 rounded-[14px] bg-zinc-50 p-3.5 text-[15px] leading-relaxed text-zinc-800">
                    Heads up: lunch moves to <span className="mark">1:30 PM</span> today. Same place, the 2nd floor lounge.
                  </p>
                  <div className="mt-4 text-[12.5px] font-medium text-zinc-500">Goes to 5 groups</div>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {[
                      ["discord", "build-night"],
                      ["telegram", "Lantern Build Night"],
                      ["slack", "build-night"],
                      ["whatsapp", "Build Night group"],
                      ["mattermost", "team-alpha · in Hindi"],
                    ].map(([app, name]) => (
                      <li key={app} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-2.5 py-1 text-[12.5px] text-zinc-700">
                        <PlatformLogo platform={app} size={13} /> {name}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <span className="btn-primary pointer-events-none">Post it</span>
                    <span className="btn pointer-events-none">Don&apos;t post</span>
                  </div>
                </div>
              </Frame>
              <div className="mt-4 flex items-center gap-3 pl-1 text-[13.5px] text-zinc-600">
                <Art name="ferri-announce" width={72} height={72} className="w-[60px]" />
                <span>
                  Times change? <Cmd>@ferri change the lunch announcement, it&apos;s 1:45 now</Cmd> and one more OK edits the posts in place.
                </span>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <Head kicker="Reach" title="Say it once. Every app hears it.">
                What the crew decides becomes an update outside after one OK: posts in every group, emails to guests, social posts and partner emails. Each waits on one card.
              </Head>
              <Bullets
                className="mt-8"
                items={[
                  <>Posted to every group of the event on Discord, Telegram, Slack, WhatsApp and Mattermost, and saved so answers use it from then on.</>,
                  <>Edited in place on Mattermost, Slack, Discord and Telegram, never a confusing second post.</>,
                  <>Scheduled posts go out at their time once approved. Not approved in time, not sent, and the crew is told.</>,
                  <>A group with its own language gets its own translation, shown on the same card.</>,
                  <>When the crew settles something in chat, Ferri offers the announcement, credited to whoever decided.</>,
                ]}
              />
              <div className="mt-7">
                <Guide name="plan-and-launch" />
              </div>
            </div>
          </div>

          {/* Beyond the group chats */}
          <div className="mt-20 grid gap-x-12 gap-y-10 border-t border-zinc-200 pt-12 md:grid-cols-3">
            {[
              {
                icon: Ticket,
                title: "Guests and RSVPs",
                line: "One guest list per event, from the event site, Luma or a pasted CSV.",
                items: [
                  "Reminders and “can you still come?” as one personal email per guest, after one OK",
                  "Guests answer on a public RSVP page, or just reply to the email",
                  "A freed spot is offered to the next person on the waitlist",
                ],
                guide: "rsvp",
              },
              {
                icon: Share2,
                title: "Social posts through Buffer",
                line: "One card holds a post for LinkedIn, X and Instagram, each sized for its network.",
                items: ["Post it, schedule it, or save as Buffer drafts", "The Builder's poster goes along as the image", "Nothing reaches Buffer before the crew answers"],
                guide: "social",
              },
              {
                icon: Mail,
                title: "Partner outreach by email",
                line: "Sponsors, venues and colleges, written to from your own address.",
                items: [
                  "The Builder finds partners, with an address only when a page publishes it",
                  "Every email waits on a card with To, Subject and the whole body",
                  "Replies land on the contact's timeline. “No thanks” means never again",
                ],
                guide: "email",
              },
            ].map((b) => (
              <div key={b.title}>
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] bg-brand-soft text-brand-ink">
                    <b.icon size={17} aria-hidden />
                  </span>
                  <h3 className="text-[18px] font-semibold tracking-[-0.01em] text-zinc-900">{b.title}</h3>
                </div>
                <p className="mt-3 text-[15px] leading-relaxed text-zinc-600">{b.line}</p>
                <ul className="mt-3 space-y-1.5 text-[14.5px] leading-snug text-zinc-700">
                  {b.items.map((it) => (
                    <li key={it} className="flex gap-2">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                      {it}
                    </li>
                  ))}
                </ul>
                <div className="mt-4">
                  <Guide name={b.guide} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 4. Care ──────────────────────────────────────────── */}
        <section id="care" className="scroll-mt-[140px] border-y border-zinc-200 bg-zinc-100/60 py-20 lg:py-28">
          <div className="site-section grid items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
            <div>
              <Head kicker="Care" title="Some people need a person, not an answer.">
                Ferri reads every message for attendees who are confused, stuck, upset or unsafe, and hands each one to the right person on the crew as a case.
              </Head>
              <Bullets
                className="mt-8"
                items={[
                  <>Each case has a plain reason the crew can read at a glance, and an owner: the topic owner, else whoever is on duty, else the leads.</>,
                  <>Unsafe (harassment, a threat, a medical problem) is always urgent: the person on duty and every lead get a push.</>,
                  <>A case stays open until it&apos;s solved. One with no news gets a check-in.</>,
                  <>The crew&apos;s own words reach the member. Ferri never posts an empty &ldquo;sorry you&apos;re upset&rdquo; itself.</>,
                  <>Technical cases can go to the Builder, which helps the member step by step in their own room and never asks for passwords or keys.</>,
                  <>Turn care on or off per community, event or group.</>,
                ]}
              />
              <div className="mt-7">
                <Guide name="care" />
              </div>
            </div>
            <div className="relative">
              <div className="pointer-events-none absolute -top-14 right-2 z-10 hidden sm:block" aria-hidden>
                <Art name="ferri-lost" width={120} height={120} className="w-[104px]" />
              </div>
              <Frame title="ferri-crew · Care" icon={<Users size={14} aria-hidden />}>
                <div className="p-5">
                  <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">Case 3</span>
                    <span className="text-zinc-500">teams · owner Rudra · Discord</span>
                  </div>
                  <p className="mt-3 text-[15.5px] leading-relaxed text-zinc-800">
                    Meera is frustrated and feels ignored: she asked twice where her team should sit and got no reply.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {["I'm on it", "Send the Builder", "Solved", "Not a case"].map((b, i) => (
                      <span key={b} className={`${i === 0 ? "btn-primary" : "btn"} pointer-events-none h-8 px-3 text-[12.5px]`}>
                        {b}
                      </span>
                    ))}
                  </div>
                  <div className="mt-5 border-t border-zinc-200 pt-4">
                    <div className="text-[12px] text-zinc-500">Rudra writes back, Ferri delivers it to Meera as the crew&apos;s words</div>
                    <div className="mt-2 rounded-[14px] rounded-bl-[4px] bg-zinc-100 px-3.5 py-2 font-mono text-[13px] leading-relaxed text-zinc-800">
                      A64 &ldquo;Meera, I am coming to you right now. Please stay by the registration desk.&rdquo;
                    </div>
                  </div>
                </div>
              </Frame>
            </div>
          </div>
        </section>

        {/* ── 5. Safety ────────────────────────────────────────── */}
        <section id="safety" className="site-section scroll-mt-[140px] py-20 lg:py-28">
          <div className="grid items-end gap-8 lg:grid-cols-[1fr_auto]">
            <Head kicker="Safety" title="Scams stopped before anyone clicks.">
              Shield checks every message on every app, from people and from agents, before anyone sees it. It answers in 2 to 9 ms, with no model in the path.
            </Head>
            <span className="hidden lg:block">
              <Ferri pose="shield" size={190} decorative />
            </span>
          </div>

          <div className="mt-12 grid items-start gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
            <Frame title="Shield · what it stopped" icon={<ShieldCheck size={14} aria-hidden />}>
              <ul className="divide-y divide-zinc-200">
                {[
                  { icon: Link2Off, tag: "Blocked", tone: "bg-red-100 text-red-700", what: "Scam link", detail: "“free nitro” with dlscord-gift[.]com", app: "discord" },
                  { icon: Repeat, tag: "Blocked", tone: "bg-red-100 text-red-700", what: "Link flood", detail: "the same link 3 times in 2 minutes", app: "telegram" },
                  { icon: KeyRound, tag: "Redacted", tone: "bg-amber-100 text-amber-800", what: "Leaked key", detail: "an API key, replaced with [redacted]", app: "slack" },
                  { icon: Globe, tag: "Allowed", tone: "bg-emerald-100 text-emerald-800", what: "Your event site", detail: "allowed when the Builder ships it", app: "whatsapp" },
                ].map((r) => (
                  <li key={r.what} className="flex items-center gap-3 px-5 py-3.5">
                    <r.icon size={17} className="shrink-0 text-zinc-500" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14.5px] font-semibold text-zinc-900">{r.what}</div>
                      <div className="text-[13px] text-zinc-500 sm:truncate">{r.detail}</div>
                    </div>
                    <PlatformLogo platform={r.app} size={15} className="hidden sm:block" />
                    <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${r.tone}`}>{r.tag}</span>
                  </li>
                ))}
              </ul>
            </Frame>
            <div>
              <Bullets
                items={[
                  <>Blocks scam and lookalike links, punycode tricks, &ldquo;seed phrase&rdquo; bait, and anything on your block list. The message never reaches the group.</>,
                  <>The same link posted three times in two minutes is blocked as a flood.</>,
                  <>API keys, tokens and passwords become [redacted], in attendees&apos; messages and in Ferri&apos;s own posts.</>,
                  <>The crew hears about it with the domain defanged, never the secret, and the leads get a push.</>,
                ]}
              />
              <div className="mt-8 space-y-3">
                <div className="flex items-start gap-3 rounded-[16px] border border-zinc-200 bg-white p-4">
                  <PauseCircle size={20} className="mt-0.5 shrink-0 text-red-600" aria-hidden />
                  <div>
                    <div className="text-[15px] font-semibold text-zinc-900">One pause for everything</div>
                    <div className="mt-0.5 text-[14px] leading-snug text-zinc-600">
                      One switch in Desk stops every post everywhere. Questions are still logged, and the crew&apos;s answers go out when you lift it.
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-[16px] border border-zinc-200 bg-white p-4">
                  <BellRing size={20} className="mt-0.5 shrink-0 text-brand" aria-hidden />
                  <div>
                    <div className="text-[15px] font-semibold text-zinc-900">One OK for anything that goes outside</div>
                    <div className="mt-0.5 text-[14px] leading-snug text-zinc-600">Announcements, guest emails, partner emails, social posts, listings and deploys each wait on a card. No tap, nothing happens.</div>
                  </div>
                </div>
              </div>
              <div className="mt-7">
                <Guide name="shield" />
              </div>
            </div>
          </div>
        </section>

        {/* ── 6. Builder ───────────────────────────────────────── */}
        <section id="builder" className="scroll-mt-[140px] border-y border-zinc-200 bg-zinc-100/60 py-20 lg:py-28">
          <div className="site-section">
            <div className="grid items-center gap-10 lg:grid-cols-[1fr_auto]">
              <Head kicker="Builder" title="A second pair of hands that asks first.">
                Ferri Builder is a coding agent that Switch runs on your own machine. It makes the things you&apos;d stay up making, and every public step waits on a permission
                card.
              </Head>
              <div className="flex justify-center">
                <Art name="stage-build" width={300} height={300} className="w-[220px] lg:w-[280px]" />
              </div>
            </div>

            <div className="mt-12 grid gap-px overflow-hidden rounded-[24px] border border-zinc-200 bg-zinc-200 md:grid-cols-3">
              {[
                {
                  icon: Globe,
                  title: "The event site",
                  items: ["Registration with a capacity, a waitlist and “Free my spot”", "Schedule, FAQ, rules and sponsor credit claiming", "Deploys to Vercel only after “Allow”"],
                },
                {
                  icon: ImageIcon,
                  title: "Posters and social cards",
                  items: ["Six formats from one design, from A4 print to story", "Every word, date and venue drawn exactly, no typos", "The QR code is read back from every image"],
                },
                {
                  icon: ListChecks,
                  title: "The Luma listing",
                  items: ["Filled in the Builder's own browser, with a screenshot first", "Submitted only after “Allow once”", "Ferri never types, sees or keeps a password"],
                },
              ].map((c) => (
                <div key={c.title} className="bg-white p-6">
                  <c.icon size={20} className="text-brand" aria-hidden />
                  <h3 className="mt-3 text-[17px] font-semibold text-zinc-900">{c.title}</h3>
                  <ul className="mt-3 space-y-1.5 text-[14.5px] leading-snug text-zinc-600">
                    {c.items.map((it) => (
                      <li key={it} className="flex gap-2">
                        <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                        {it}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="mt-10 grid items-center gap-10 lg:grid-cols-[1fr_1fr]">
              <Bullets
                items={[
                  <>
                    Ask in the crew room: <Cmd>@ferri get the builder to make a one-page site for Build Night</Cmd>
                  </>,
                  <>It reads the event&apos;s facts from the room&apos;s Switch documents and leaves anything missing as a visible placeholder.</>,
                  <>Its own Switch budget: 400k output tokens and 60 turns per 24 hours by default. When it&apos;s spent, Switch stops it and Ferri holds new jobs.</>,
                  <>It also helps attendees with setup and build errors in the help desk.</>,
                ]}
              />
              <div className="mx-auto w-full max-w-[440px]">
                <div className="rounded-[20px] border border-zinc-200 bg-white p-5 shadow-[var(--shadow-pop)]">
                  <div className="flex items-center gap-2 text-[12.5px] font-medium text-zinc-500">
                    <FileCode2 size={14} aria-hidden /> Builder wants to run a command
                  </div>
                  <div className="mt-3 rounded-[12px] bg-[#0d1b1e] px-4 py-3 font-mono text-[13.5px] text-[#e6f2f1]">
                    <span className="text-[#5fd3cb] select-none">$ </span>vercel deploy --prod
                  </div>
                  <p className="mt-3 text-[13.5px] text-zinc-600">Nothing goes live until someone on the crew allows it, in the room, in Desk or in Pocket.</p>
                  <div className="mt-4 flex gap-2">
                    <span className="btn-primary pointer-events-none">Allow once</span>
                    <span className="btn pointer-events-none">No</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-8">
              <Guide name="builder" />
            </div>
          </div>
        </section>

        {/* ── 7. Plan and Wrap ─────────────────────────────────── */}
        <section id="plan-wrap" className="site-section scroll-mt-[140px] py-20 lg:py-28">
          <div className="max-w-[760px]">
            <p className="kicker">Plan and Wrap</p>
            <h2 className="display text-[clamp(32px,4.4vw,54px)] text-zinc-900">Before the first attendee. After the last one.</h2>
            <p className="mt-5 max-w-[600px] text-[17px] leading-[1.65] text-zinc-600">
              The crew talks the way it always does. Ferri turns that chatter into a plan beforehand, and counts what really happened afterwards.
            </p>
          </div>
          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            {[
              {
                art: "stage-plan",
                title: "Crew chatter becomes a plan",
                cmd: "@ferri draft the agenda",
                items: [
                  "Decisions, owners, and tasks with deadlines, picked up from the crew room. Nobody fills in a form.",
                  "A run of show, plus one card per key decision still open",
                  "Owners named in the plan get that topic's questions",
                  "Reminders with a push when a task falls due",
                  "“@ferri what's the plan?” sums up what's decided, waiting and due next",
                ],
                guide: "plan-and-launch",
              },
              {
                art: "stage-wrap",
                title: "A recap with real numbers",
                cmd: "@ferri how did build night go?",
                items: [
                  "Questions, cards, cases, guests, check-ins and Shield, counted in code from the database",
                  "Short lessons, with any sentence whose number isn't in the counts dropped",
                  "Partners saved to Contacts. Nobody is emailed",
                  "A starter kit, so the next event starts from what this one learned",
                  "A close card that turns the groups off or moves them to the next event",
                ],
                guide: "wrap",
              },
            ].map((c) => (
              <article key={c.title} className="rounded-[28px] border border-zinc-200 bg-white p-6 sm:p-8">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="display text-[clamp(24px,2.6vw,32px)] text-zinc-900">{c.title}</h3>
                  <Art name={c.art} width={120} height={120} className="-mt-3 -mr-2 w-[88px] shrink-0 sm:w-[110px]" />
                </div>
                <div className="mt-3">
                  <Cmd>{c.cmd}</Cmd>
                </div>
                <Bullets className="mt-6" items={c.items} />
                <div className="mt-6">
                  <Guide name={c.guide} />
                </div>
              </article>
            ))}
          </div>
          <p className="mt-6 flex items-start gap-2 text-[14.5px] text-zinc-600">
            <CalendarClock size={17} className="mt-0.5 shrink-0 text-brand" aria-hidden />
            An hour after the event ends, Ferri proposes the recap, the close card and a thank-you announcement on its own, once. Each waits for its OK.
          </p>
        </section>

        {/* ── 8. Desk and Pocket ───────────────────────────────── */}
        <section id="desk" className="scroll-mt-[140px] overflow-hidden bg-[#0d1b1e] py-20 text-[#eef3f2] lg:py-28">
          <div className="site-section">
            <div className="max-w-[720px]">
              <p className="mb-3 text-[14px] font-semibold text-[#8fe0da]">Desk and Pocket</p>
              <h2 className="display text-[clamp(32px,4.4vw,54px)]">A control room for the crew. A buzz on the right phone.</h2>
              <p className="mt-5 max-w-[600px] text-[17px] leading-[1.65] text-[#b9cccc]">
                Desk is where organizers run Ferri, from the laptop. Pocket is the crew&apos;s phone app, inside Desk, with the cards that need you and one big box to answer
                them.
              </p>
            </div>

            <div className="mt-12 grid items-start gap-10 lg:grid-cols-[1fr_260px] lg:gap-12">
              <div>
                <div className="overflow-hidden rounded-[16px] border border-white/10 shadow-[0_50px_120px_-40px_rgba(0,0,0,0.8)]">
                  <Image
                    src="/site/desk-overview.png"
                    alt="Ferri Desk's overview: the share of questions Ferri answered alone climbs by hour, questions per app, open cards, care cases, Shield blocks and a live feed."
                    width={1440}
                    height={900}
                    sizes="(min-width: 1024px) 820px, 100vw"
                    className="h-auto w-full"
                  />
                </div>
                <h3 className="mt-8 text-[17px] font-semibold text-white">In Desk</h3>
                <ul className="mt-3 grid gap-x-8 gap-y-2 text-[14.5px] text-[#b9cccc] sm:grid-cols-2">
                  {[
                    "Spaces on every app, with their mode",
                    "The master pause",
                    "Cards waiting for the crew, and replies to approve",
                    "Knowledge, searchable, with every version kept",
                    "Plan, announcements, care cases and guests",
                    "Social posts, desks and their sheets, contacts",
                    "Wrap, skills and settings",
                    "The Builder, Shield, and a Setup page",
                  ].map((t) => (
                    <li key={t} className="flex gap-2">
                      <Check size={15} className="mt-0.5 shrink-0 text-[#5fd3cb]" aria-hidden />
                      {t}
                    </li>
                  ))}
                </ul>
                <div className="mt-6">
                  <a href={doc("dashboard")} className="inline-flex items-center gap-1 text-[15px] font-semibold text-[#8fe0da] underline decoration-white/25 decoration-2 underline-offset-4 hover:decoration-[#8fe0da]">
                    Read the Desk guide <ArrowUpRight size={15} aria-hidden />
                  </a>
                </div>
              </div>
              <div>
                <div className="mx-auto w-[230px] overflow-hidden rounded-[34px] border-[6px] border-[#1d3338] bg-white shadow-[0_40px_90px_-30px_rgba(0,0,0,0.9)] lg:w-full">
                  <Image
                    src="/site/pocket-card.png"
                    alt="Ferri Pocket on a phone: a member's question, Ferri's holding reply and one big answer box."
                    width={780}
                    height={1688}
                    sizes="260px"
                    className="h-auto w-full"
                  />
                </div>
                <h3 className="mt-8 text-[17px] font-semibold text-white">In Pocket</h3>
                <ul className="mt-3 space-y-2 text-[14.5px] text-[#b9cccc]">
                  {[
                    "Needs you: the cards for your topics first",
                    "Answer, or Send, Edit and Don't send",
                    "Who is stuck, longest first",
                    "A push when a card opens, at the nudge and at escalation",
                    "+ Announce, straight from your phone",
                  ].map((t) => (
                    <li key={t} className="flex gap-2">
                      <Check size={15} className="mt-0.5 shrink-0 text-[#5fd3cb]" aria-hidden />
                      {t}
                    </li>
                  ))}
                </ul>
                <div className="mt-6">
                  <a href={doc("pocket")} className="inline-flex items-center gap-1 text-[15px] font-semibold text-[#8fe0da] underline decoration-white/25 decoration-2 underline-offset-4 hover:decoration-[#8fe0da]">
                    Read the Pocket guide <ArrowUpRight size={15} aria-hidden />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── 9. Make it yours ─────────────────────────────────── */}
        <section id="yours" className="site-section scroll-mt-[140px] py-20 lg:py-28">
          <div className="grid items-start gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
            <div>
              <Head kicker="Make it yours" title="Your tone. Their language.">
                Ferri&apos;s persona, its answer rules, every desk and every pack are markdown skills the crew edits in Desk. Tone, language and timing go per community, event or
                group.
              </Head>
              <Bullets
                className="mt-8"
                items={[
                  <>Edit any skill in Desk, with versions and &ldquo;Reset to default&rdquo;. Ferri uses the edit on its next message.</>,
                  <>Tone: warm, playful, professional, brief, or the crew&apos;s own words.</>,
                  <>A group with its own language gets answers in it, with the source label translated too.</>,
                  <>Timing: how long Ferri waits in the room, the card ladder, guest reminders and wrap.</>,
                  <>The source check, the cards and the pause are in code, so no edit can turn them off.</>,
                ]}
              />
              <div className="mt-7">
                <Guide name="customization" />
              </div>
            </div>
            <div className="relative">
              <div className="pointer-events-none absolute -top-12 -right-1 z-10 hidden sm:block" aria-hidden>
                <Ferri pose="wave" size={110} decorative className="w-[96px]" />
              </div>
              <Frame title="ferri-crew · settings by chat" icon={<Languages size={14} aria-hidden />}>
                <div className="space-y-4 p-5">
                  <PersonLine who="Rudra">@ferri reply in Hindi in team-alpha</PersonLine>
                  <FerriLine>Done. team-alpha gets answers in Hindi from now on. Say &ldquo;@ferri reply in English in team-alpha&rdquo; to undo.</FerriLine>
                  <div className="border-t border-zinc-200 pt-4">
                    <div className="text-[12.5px] font-medium text-zinc-500">More you can say in the crew room</div>
                    <ul className="mt-2 flex flex-col items-start gap-1.5">
                      {["@ferri be more playful for Build Night", "@ferri wait a minute before answering questions in the room", "@ferri turn off care for Build Night", "@ferri what are the settings?"].map(
                        (c) => (
                          <li key={c} className="max-w-full">
                            <Cmd>{c}</Cmd>
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                </div>
              </Frame>
              <p className="mt-3 pl-1 text-[13px] text-zinc-500">Changes work only from the crew&apos;s rooms, say who made them, and can be undone.</p>
            </div>
          </div>
        </section>
      </div>

      {/* ── Final call to action ─────────────────────────────── */}
      <section className="px-4 pt-4 pb-20 sm:px-8">
        <div className="relative mx-auto max-w-[1160px] overflow-hidden rounded-[36px] bg-brand px-6 py-14 text-white shadow-[inset_0_-6px_0_var(--brand-lip)] sm:px-14 sm:py-16">
          <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div>
              <h2 className="display text-[clamp(36px,5vw,62px)]">See it answer. Then run your own.</h2>
              <p className="mt-4 max-w-[580px] text-[17px] leading-relaxed text-white">
                Ask the live demo something about Lantern Build Night, a made-up event. Then ask something it can&apos;t know, and watch it check with the crew.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/welcome#try" className="btn h-12 border-0 bg-white px-6 text-[15.5px] text-zinc-900 hover:bg-zinc-50">
                  Try it on the page <ArrowRight size={16} aria-hidden />
                </Link>
                <Link href="/start" className="btn h-12 border-white/40 bg-transparent px-6 text-[15.5px] text-white hover:bg-white/10" style={{ boxShadow: "none" }}>
                  Set it up free
                </Link>
              </div>
              <p className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[14px] text-white">
                Or ask in the demo groups:
                <a href={DISCORD} className="inline-flex items-center gap-1.5 underline decoration-white/40 underline-offset-4 hover:decoration-white">
                  Discord
                </a>
                <a href={TELEGRAM} className="inline-flex items-center gap-1.5 underline decoration-white/40 underline-offset-4 hover:decoration-white">
                  Telegram
                </a>
              </p>
            </div>
            <div className="hidden lg:block">
              <Ferri pose="party" size={240} alive decorative />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
