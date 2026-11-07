import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  Check,
  ChevronDown,
  CirclePlay,
  Globe,
  Hand,
  Languages,
  Lock,
  PauseCircle,
  ShieldCheck,
} from "lucide-react";
import { Art, Ferri, FerriAvatar, FerriLoop } from "@/components/ferri";
import { PlatformLogo } from "@/components/platform";
import { GithubMark } from "../_components/icons";
import { AskButton, CopyCommand, PilingQuestions, RotatingWord } from "../_components/bits";
import { DEMO_DESK, DISCORD, GITHUB, SWITCH, TELEGRAM, VIDEO } from "../_components/links";
import { Playground } from "../_components/playground";
import { Stages } from "../_components/stages";
import { HowItWorks } from "./how-it-works";
import { Spine } from "./spine";

export const metadata: Metadata = {
  title: { absolute: "Ferri: run the event, Ferri runs the group chats" },
  description:
    "Ferri is the open-source AI teammate for people who host community events. It plans with your crew, keeps your community up to date on Discord, Telegram, Slack and WhatsApp, and posts each decision everywhere after one OK. Built on Switch.",
  openGraph: {
    title: "Run the event. Ferri runs the group chats.",
    description: "The AI teammate for people who host community events. It plans with your crew and keeps your community up to date on every app. Open source, built on Switch.",
  },
  // No twitter image here: X then uses this page's share image (opengraph-image.tsx), not the site-wide one.
  twitter: { card: "summary_large_image" },
};

const APPS = [
  { key: "discord", name: "Discord" },
  { key: "telegram", name: "Telegram" },
  { key: "slack", name: "Slack" },
  { key: "whatsapp", name: "WhatsApp" },
  { key: "mattermost", name: "Mattermost" },
];

const EVENTS = ["hackathons", "meetups", "conferences", "festivals", "workshops", "game nights"];

const TRUST = [
  { icon: BookOpenCheck, title: "A source under every answer", line: "Ferri answers only from your event's info and names where each answer came from. The source check is in code, so no prompt can switch it off." },
  { icon: Hand, title: "Nothing goes out without an OK", line: "Announcements, emails, posts and listings each wait on one approval card. A tap posts it. No tap, nothing happens." },
  { icon: ShieldCheck, title: "Shield on every message", line: "Scam links, link floods and leaked API keys are stopped on every app before anyone sees them, in 2 to 9 ms, with no model in the path." },
  { icon: PauseCircle, title: "One pause button", line: "Pause Ferri everywhere with one switch in Desk. Set each group to Off, Listen, Approve or Auto." },
  { icon: Languages, title: "Your tone, their language", line: "Set the tone and language per group. “@ferri reply in Hindi in team-alpha” is enough." },
  { icon: Lock, title: "Your server, your data", line: "Ferri is MIT-licensed and runs on your own machine or server, next to your own Switch." },
];

const USES = [
  { name: "Hackathons", q: "when do submissions close?", a: "7:00 AM on Sunday. Judging starts at 8.", desks: "Judging, mentors, check-in", art: "stage-build" },
  { name: "Meetups", q: "is there parking near the venue?", a: "I don't have that yet. I'm checking with the team.", desks: "Speakers, check-in, food", art: "ferri-wave", ask: true },
  { name: "Conferences", q: "which room is the keynote in?", a: "Hall A on the ground floor. Doors open at 9:30.", desks: "Speakers, sponsors, help", art: "ferri-ticket" },
  { name: "Festivals", q: "where is lost and found?", a: "At the info tent by the main gate, open until midnight.", desks: "Safety, volunteers, lost and found", art: "ferri-party" },
  { name: "Workshops", q: "do I need to install anything first?", a: "Yes: Node 22 and VS Code. The setup guide is pinned in #help.", desks: "Help, tables, check-in", art: "ferri-thinking" },
  { name: "Game nights", q: "can I bring my own deck?", a: "Yes. Sleeves are required at the tournament tables.", desks: "Tables, food, check-in", art: "ferri-main" },
];

const PROOF = [
  { n: "158/158", label: "answer checks pass on the real model" },
  { n: "108/108", label: "care checks pass for stuck or upset members" },
  { n: "255", label: "unit tests, plus a full-stack smoke test in CI" },
  { n: "2–9 ms", label: "for Shield to judge a message" },
];

const FAQ = [
  {
    q: "Does Ferri make things up?",
    a: "No. It answers only from your event's info and the answers your crew gave it, and it prints the source under every answer. When nothing fits, it says “I don't have that yet. I'm checking with the team.” and asks the crew. If nobody answers, it nudges the owner, then the whole crew. It never invents an answer.",
  },
  {
    q: "Do attendees need to install anything?",
    a: "No. Ferri joins the Discord, Telegram, Slack, WhatsApp or Mattermost groups your community already uses. Attendees just ask, the way they already do.",
  },
  {
    q: "How does the crew answer?",
    a: "Each question Ferri can't answer becomes one card for the person who owns that topic: in the crew's private room, in Desk, or on their phone through Ferri Pocket. One answer reaches everyone who asked, on their own app, and Ferri remembers it.",
  },
  {
    q: "Does it only answer questions?",
    a: "No. Answering is one part of the job. Ferri also keeps the crew's plan, posts announcements on every app after one OK, opens care cases for members who are stuck or upset, runs the guest list, blocks scams, and writes a recap with real numbers at the end. Its Builder ships the event site, posters and listings.",
  },
  {
    q: "What do I need to run it?",
    a: "Docker, about 4 GB of free memory and an Anthropic API key. One command, ./ferri up, starts Switch, a Mattermost to try it in, Ferri and Desk with a demo event. Connecting Discord, Telegram, Slack or WhatsApp is one more command each.",
  },
  {
    q: "What does it cost?",
    a: "Ferri is free and open source under the MIT license. You pay only for your own model use: Claude Sonnet answers by default, Claude Haiku handles the quick checks, and you can switch answers to Haiku to spend less.",
  },
  {
    q: "Why Switch?",
    a: "Switch turns every group on every app into a room, lets Ferri be one agent in all of them, gives the crew approval cards, checks every message through Switch Trust, and runs the Builder as a managed agent with a spending cap. Without Switch, Ferri would be five separate bots.",
  },
];

export default function Welcome() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative isolate -mt-[76px] pt-[112px] pb-8 sm:pt-[128px]">
        <div className="hero-sky" aria-hidden>
          <span className="cloud top-[12%] left-[-6%] h-[120px] w-[420px]" />
          <span className="cloud top-[30%] left-[8%] h-[70px] w-[260px] [animation-delay:-12s]" />
          <span className="cloud top-[8%] right-[-4%] h-[130px] w-[460px] [animation-delay:-6s]" />
          <span className="cloud top-[34%] right-[10%] h-[60px] w-[220px] [animation-delay:-20s]" />
        </div>

        <div className="site-section text-center">
          <div className="rise inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 py-1 pr-3.5 pl-1 text-[14px] font-medium text-zinc-700 shadow-[0_2px_12px_-6px_rgba(40,60,60,0.25)] backdrop-blur">
            <FerriAvatar size={26} />
            <span>
              For people who host <RotatingWord words={EVENTS} className="font-semibold text-brand-ink" />
            </span>
          </div>

          <h1 className="rise mx-auto mt-6 max-w-[1100px] text-zinc-900 [animation-delay:80ms]">
            <span className="display block text-[clamp(44px,7.4vw,96px)]">Run the event.</span>
            <span className="font-serif-display block text-[clamp(46px,7.8vw,102px)] leading-[1.02]">Ferri runs the group chats.</span>
          </h1>

          <p className="rise mx-auto mt-6 max-w-[660px] text-[clamp(17px,1.5vw,19px)] leading-[1.6] text-zinc-600 [animation-delay:160ms]">
            Ferri is the AI teammate between your crew and your community. It plans with the crew where they already talk, keeps the community up to date on Discord,
            Telegram, Slack and WhatsApp, and posts each decision everywhere after one OK.
          </p>

          <div className="rise mt-8 flex flex-wrap items-center justify-center gap-3 [animation-delay:240ms]">
            <AskButton className="btn-primary h-[52px] px-7 text-[16px]">
              Try it live <ArrowRight size={17} aria-hidden />
            </AskButton>
            <Link href="/start" className="btn h-[52px] px-7 text-[16px]">
              Set it up free
            </Link>
            {VIDEO ? (
              <a href={VIDEO} className="btn h-[52px] px-7 text-[16px]">
                <CirclePlay size={17} aria-hidden /> Watch the video
              </a>
            ) : null}
          </div>
          <ul className="rise mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13.5px] text-zinc-600 [animation-delay:300ms]">
            <li className="inline-flex items-center gap-1.5">
              <Check size={15} className="text-brand" aria-hidden /> No sign-up to try it
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Check size={15} className="text-brand" aria-hidden /> Open source, MIT
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Check size={15} className="text-brand" aria-hidden /> Built on Switch
            </li>
          </ul>
        </div>

        {/* The playground: the product, live, in the hero */}
        <div id="try" className="relative mx-auto mt-14 max-w-[1120px] scroll-mt-28 px-3 sm:mt-16 sm:px-6">
          <div className="sea-band top-[18%] bottom-[-8%]" aria-hidden />
          <div className="pointer-events-none absolute -top-[86px] right-[4%] z-10 hidden w-[170px] sm:block lg:right-[6%] lg:w-[200px]" aria-hidden>
            <FerriLoop name="hero-loop" width={220} height={220} priority className="w-full" />
          </div>
          <div className="hand pointer-events-none absolute -top-[54px] left-[5%] hidden -rotate-3 text-[26px] leading-tight text-zinc-700 md:block" aria-hidden>
            Ask it anything about the event
            <svg width="44" height="36" viewBox="0 0 44 36" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="mt-0.5 ml-10">
              <path d="M4 3 C8 14 14 24 30 31" />
              <path d="M30 31 l-10 1 M30 31 l-3 -9" />
            </svg>
          </div>
          <div className="hand pointer-events-none absolute right-[3%] -bottom-[58px] hidden rotate-2 text-right text-[24px] leading-tight text-zinc-700 lg:block" aria-hidden>
            <svg width="44" height="36" viewBox="0 0 44 36" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="mb-0.5 ml-auto mr-28">
              <path d="M8 33 C14 22 22 12 36 5" />
              <path d="M36 5 l-10 0 M36 5 l-4 9" />
            </svg>
            …then play the crew here
          </div>
          <Playground />
        </div>
      </section>

      {/* ── Where it works ───────────────────────────────────── */}
      <section className="site-section pt-24 pb-6" aria-label="Where Ferri works">
        <p className="text-center text-[15px] text-zinc-600">Works in the chats your people already use. No new app for anyone.</p>
        <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {APPS.map((p) => (
            <li key={p.key} className="flex items-center gap-2.5 text-[18px] font-semibold text-zinc-700">
              <PlatformLogo platform={p.key} size={26} />
              {p.name}
            </li>
          ))}
        </ul>
      </section>

      {/* ── Across the event ─────────────────────────────────── */}
      <section id="event" className="site-section scroll-mt-24 pt-24 pb-8 lg:pt-28 lg:pb-12">
        <div className="mb-12 max-w-[760px]">
          <p className="kicker">Not another help desk</p>
          <h2 className="display text-[clamp(36px,5vw,62px)] text-zinc-900">From the first idea to the last thank-you.</h2>
          <p className="lede">
            A help desk talks only to outsiders, and only answers. Ferri works with your crew inside and your community outside. It turns the crew&apos;s chatter into plans,
            sites, announcements, answers and a recap.
          </p>
        </div>
        <Stages />
      </section>

      {/* ── The pain ─────────────────────────────────────────── */}
      <section className="site-section grid items-center gap-12 py-24 lg:grid-cols-[1fr_1fr] lg:py-32">
        <div>
          <p className="kicker">Sound familiar?</p>
          <h2 className="display text-[clamp(36px,5vw,62px)] text-zinc-900">
            The same question.
            <br />
            Forty times.
            <br />
            Five apps.
          </h2>
          <p className="lede">Your attendees are on Discord, Telegram, Slack and a WhatsApp group. Your crew is a handful of volunteers. So the event gets run on someone&apos;s phone, at night.</p>
          <ul className="mt-8 space-y-4">
            {[
              ["An answer given in one group never reaches the others.", "So the next person asks again."],
              ["The crew decides “lunch moves to 1:30”.", "Half the people hear the old time."],
              ["A fake “free nitro” link lands in the busiest channel.", "At the worst possible moment."],
            ].map(([a, b]) => (
              <li key={a} className="flex gap-3 text-[16.5px] leading-snug">
                <span className="mt-[7px] h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden />
                <span>
                  <span className="font-semibold text-zinc-900">{a}</span> <span className="text-zinc-600">{b}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <PilingQuestions />
      </section>

      {/* ── How it works ─────────────────────────────────────── */}
      <section id="how" className="scroll-mt-24 border-y border-zinc-200 bg-zinc-100/60 py-24 lg:py-28">
        <div className="site-section">
          <div className="grid items-end gap-8 lg:grid-cols-[1fr_auto]">
            <div className="max-w-[760px]">
              <p className="kicker">How it works</p>
              <h2 className="display text-[clamp(36px,5vw,62px)] text-zinc-900">Your crew answers once. Ferri tells everyone.</h2>
              <p className="lede">
                Ferri sits between the community outside and the crew inside. It answers what it knows, asks the crew what it doesn&apos;t, and carries every decision back out, on
                every app at once.
              </p>
            </div>
          </div>
          <div className="mt-12 mb-10 grid grid-cols-[1fr_1.3fr_1fr] items-end gap-2 sm:gap-6" aria-hidden>
            <figure className="text-center">
              <Art name="shore-community" width={360} height={270} />
              <figcaption className="hand mt-1 text-[20px] text-zinc-700 sm:text-[24px]">the community</figcaption>
            </figure>
            <div className="relative self-center">
              <div className="absolute inset-x-0 top-[62%] h-[3px] rounded-full bg-[repeating-linear-gradient(90deg,var(--brand)_0_14px,transparent_14px_26px)] opacity-40" />
              <FerriLoop name="carry-loop" fallback="carry" width={480} height={240} className="relative w-full" />
            </div>
            <figure className="text-center">
              <Art name="shore-crew" width={360} height={270} />
              <figcaption className="hand mt-1 text-[20px] text-zinc-700 sm:text-[24px]">the crew</figcaption>
            </figure>
          </div>
          <HowItWorks />
        </div>
      </section>

      {/* ── Control room ─────────────────────────────────────── */}
      <section className="overflow-hidden bg-[#0d1b1e] py-24 text-[#eef3f2] lg:py-32">
        <div className="site-section">
          <div className="grid items-end gap-8 lg:grid-cols-[1fr_auto]">
            <div className="max-w-[720px]">
              <p className="mb-3 text-[14px] font-semibold text-[#8fe0da]">Desk and Pocket</p>
              <h2 className="display text-[clamp(36px,5vw,62px)]">A control room for the crew. A buzz on the right phone.</h2>
              <p className="mt-5 max-w-[620px] text-[17.5px] leading-[1.65] text-[#b9cccc]">
                Desk shows everything Ferri is doing, live. Pocket, the crew&apos;s phone app, buzzes only the person who owns the question, with one big box to answer it.
              </p>
            </div>
            <a href={DEMO_DESK} className="btn h-12 border-white/20 bg-white/10 px-6 text-[15px] text-white hover:bg-white/15" style={{ boxShadow: "none" }}>
              Look around the live Desk <ArrowRight size={16} aria-hidden />
            </a>
          </div>
          <div className="relative mt-14 pb-10 lg:pr-[160px]">
            <div className="overflow-hidden rounded-[18px] border border-white/10 bg-white shadow-[0_50px_120px_-40px_rgba(0,0,0,0.8)]">
              <div className="flex items-center gap-1.5 border-b border-zinc-200 bg-[#f2ece2] px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                <span className="mx-auto rounded-md bg-white/70 px-3 py-0.5 text-[11.5px] text-[#6d665e]">desk.your-community.org</span>
              </div>
              <Image src="/site/desk-overview.png" alt="Ferri Desk's overview: the share of questions Ferri answered alone climbs by hour, questions per app, open cards, care cases, Shield blocks and a live feed." width={1440} height={900} className="h-auto w-full" />
            </div>
            <div className="absolute right-0 -bottom-2 hidden w-[230px] overflow-hidden rounded-[34px] border-[6px] border-[#1d3338] bg-white shadow-[0_40px_90px_-30px_rgba(0,0,0,0.9)] sm:block lg:w-[260px]">
              <Image src="/site/pocket-card.png" alt="Ferri Pocket on a phone: a member's question, Ferri's holding reply and one big answer box." width={780} height={1688} className="h-auto w-full" />
            </div>
          </div>
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Answered alone, by hour", "Watch the share Ferri answers alone climb as the crew teaches it."],
              ["Every card in one place", "Questions, announcements, care cases, guest sends and posts."],
              ["Knowledge with versions", "Edit what Ferri knows. Every change is kept."],
              ["Pocket for the crew", "Push only to the owner. Answer, post or pause from the phone."],
            ].map(([t, d]) => (
              <li key={t} className="border-t border-white/15 pt-4">
                <div className="text-[15.5px] font-semibold text-white">{t}</div>
                <div className="mt-1.5 text-[14.5px] leading-relaxed text-[#9db5b6]">{d}</div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Trust ────────────────────────────────────────────── */}
      <section className="site-section py-24 lg:py-32">
        <div className="grid items-end gap-8 lg:grid-cols-[1fr_auto]">
          <div className="max-w-[720px]">
            <p className="kicker">Safe by design</p>
            <h2 className="display text-[clamp(36px,5vw,62px)] text-zinc-900">Helpful when it knows. Quiet when it doesn&apos;t.</h2>
            <p className="lede">An assistant that guesses in front of three hundred attendees is worse than none. The rules that keep Ferri honest are in code, not in a prompt.</p>
          </div>
          <span className="hidden lg:block">
            <Ferri pose="shield" size={200} decorative />
          </span>
        </div>
        <div className="mt-14 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {TRUST.map((t) => (
            <div key={t.title}>
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] bg-brand-soft text-brand-ink">
                <t.icon size={20} aria-hidden />
              </span>
              <h3 className="mt-4 text-[18px] font-semibold tracking-[-0.01em] text-zinc-900">{t.title}</h3>
              <p className="mt-2 text-[15.5px] leading-relaxed text-zinc-600">{t.line}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Use cases ────────────────────────────────────────── */}
      <section className="border-y border-zinc-200 bg-zinc-100/60 py-24 lg:py-28">
        <div className="site-section">
          <div className="grid items-end gap-6 lg:grid-cols-[1fr_auto]">
            <div className="max-w-[720px]">
              <p className="kicker">Use cases</p>
              <h2 className="display text-[clamp(36px,5vw,62px)] text-zinc-900">Made for volunteer crews.</h2>
              <p className="lede">Each kind of event comes with a starter pack: the desks it needs, the questions people ask, and how Ferri should sound.</p>
            </div>
            <Link href="/use-cases" className="btn h-11 px-5 text-[14.5px]">
              See every use case <ArrowRight size={15} aria-hidden />
            </Link>
          </div>
          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {USES.map((u) => (
              <li key={u.name} className="group relative overflow-hidden rounded-[24px] border border-zinc-200 bg-white p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-display text-[24px] font-extrabold tracking-[-0.03em] text-zinc-900">{u.name}</h3>
                    <p className="mt-1 text-[13.5px] text-zinc-500">{u.desks}</p>
                  </div>
                  <Art name={u.art} width={96} height={96} className="-mt-2 -mr-2 w-[84px] shrink-0" />
                </div>
                <div className="mt-5 space-y-1.5 rounded-[16px] bg-zinc-50 p-3 text-[13.5px]">
                  <div className="text-zinc-700">
                    <span className="font-semibold text-zinc-900">Attendee</span> {u.q}
                  </div>
                  <div className="flex items-start gap-1.5 text-zinc-800">
                    <FerriAvatar size={18} className="mt-px" />
                    <span>
                      <span className="font-semibold text-brand-ink">Ferri</span> {u.a}
                      {"ask" in u ? <span className="mt-1 block text-[12px] text-zinc-500">A card goes to the crew. Their answer reaches everyone who asked.</span> : null}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Switch ───────────────────────────────────────────── */}
      <section id="switch" className="site-section scroll-mt-24 py-24 lg:py-32">
        <div className="grid items-end gap-8 lg:grid-cols-[1fr_auto]">
          <div className="max-w-[760px]">
            <p className="kicker">Built on Switch</p>
            <h2 className="display text-[clamp(36px,5vw,62px)] text-zinc-900">Take Switch away, and Ferri is five separate bots.</h2>
            <p className="lede">
              Every group on every app is a Switch room. Ferri is one Switch agent in all of them. Every approval is a card the crew taps, every message passes Switch Trust, and
              the Builder runs as a Switch-managed agent with a spending cap. We also added two things to Switch core that Ferri needed.
            </p>
          </div>
          <span className="hidden lg:block">
            <Ferri pose="switch" size={210} decorative />
          </span>
        </div>
        <div className="mt-12">
          <Spine />
        </div>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/switch" className="btn-primary h-11 px-5 text-[14.5px]">
            How Ferri uses Switch <ArrowRight size={15} aria-hidden />
          </Link>
          <a href={SWITCH} className="btn h-11 px-5 text-[14.5px]">
            Switch on GitHub
          </a>
        </div>
      </section>

      {/* ── Proof ────────────────────────────────────────────── */}
      <section className="border-y border-zinc-200 bg-white">
        <div className="site-section grid gap-px py-4 sm:grid-cols-2 lg:grid-cols-4">
          {PROOF.map((p) => (
            <div key={p.n} className="px-2 py-8 lg:px-6">
              <div className="num text-[44px] leading-none text-zinc-900">{p.n}</div>
              <div className="mt-2 max-w-[220px] text-[14.5px] leading-snug text-zinc-600">{p.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Get started ──────────────────────────────────────── */}
      <section className="site-section grid items-center gap-12 py-24 lg:grid-cols-[0.9fr_1.1fr] lg:py-32">
        <div>
          <p className="kicker">Get started</p>
          <h2 className="display text-[clamp(36px,5vw,62px)] text-zinc-900">Running in one command.</h2>
          <p className="lede">It asks for your Anthropic key once, then starts Switch, a Mattermost to try it in, Ferri and Desk, with a demo event already loaded.</p>
          <ol className="mt-8 space-y-5">
            {[
              ["Start it", "Docker and about 4 GB of free memory. Nothing else to install."],
              ["Connect your apps", "./ferri connect discord, telegram or slack. WhatsApp pairs with a QR code."],
              ["Teach it your event", "Add the schedule, venue and FAQ in Desk. Your crew's answers do the rest."],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-4">
                <span className="num inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-[16px] text-white">{i + 1}</span>
                <div>
                  <div className="text-[17px] font-semibold text-zinc-900">{t}</div>
                  <div className="mt-0.5 text-[15px] text-zinc-600">{d}</div>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/start" className="btn-primary h-12 px-6 text-[15px]">
              Read the setup guide <ArrowRight size={16} aria-hidden />
            </Link>
            <a href={GITHUB} className="btn h-12 px-6 text-[15px]">
              <GithubMark size={16} /> Star on GitHub
            </a>
          </div>
        </div>
        <CopyCommand lines={["git clone https://github.com/RudraO2/Ferri.git", "cd Ferri", "./ferri up"]} />
      </section>

      {/* ── FAQ ──────────────────────────────────────────────── */}
      <section className="border-t border-zinc-200 bg-zinc-100/60 py-24 lg:py-28">
        <div className="site-section grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="kicker">Questions</p>
            <h2 className="display text-[clamp(36px,5vw,58px)] text-zinc-900">Asked once. Answered here.</h2>
            <div className="mt-8 hidden lg:block">
              <Ferri pose="thinking" size={190} decorative />
            </div>
          </div>
          <div className="divide-y divide-zinc-200 border-y border-zinc-200">
            {FAQ.map((f) => (
              <details key={f.q} className="group py-1">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[17.5px] font-semibold text-zinc-900 [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ChevronDown size={19} className="shrink-0 text-zinc-500 transition group-open:rotate-180" aria-hidden />
                </summary>
                <p className="max-w-[640px] pb-5 text-[15.5px] leading-relaxed text-zinc-600">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final call to action ─────────────────────────────── */}
      <section className="px-4 py-20 sm:px-8">
        <div className="relative mx-auto max-w-[1160px] overflow-hidden rounded-[36px] bg-brand px-6 py-14 text-white shadow-[inset_0_-6px_0_var(--brand-lip)] sm:px-14 sm:py-16">
          <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div>
              <h2 className="display text-[clamp(38px,5.4vw,68px)]">Give your crew their nights back.</h2>
              <p className="mt-4 max-w-[580px] text-[17px] leading-relaxed text-white">
                Ferri is live right now for Lantern Build Night, a made-up event. Ask it something on Discord or Telegram, then ask something it can&apos;t know and watch it check
                with the crew.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href={DISCORD} className="btn h-12 border-0 bg-white px-6 text-[15.5px] text-zinc-900 hover:bg-zinc-50">
                  <PlatformLogo platform="discord" size={18} /> Ask on Discord
                </a>
                <a href={TELEGRAM} className="btn h-12 border-0 bg-white px-6 text-[15.5px] text-zinc-900 hover:bg-zinc-50">
                  <PlatformLogo platform="telegram" size={18} /> Ask on Telegram
                </a>
                {VIDEO ? (
                  <a href={VIDEO} className="btn h-12 border-0 bg-white px-6 text-[15.5px] text-zinc-900 hover:bg-zinc-50">
                    <CirclePlay size={18} aria-hidden /> Watch the video
                  </a>
                ) : null}
                <Link href="/start" className="btn h-12 border-white/40 bg-transparent px-6 text-[15.5px] text-white hover:bg-white/10" style={{ boxShadow: "none" }}>
                  <Globe size={16} aria-hidden /> Run your own
                </Link>
              </div>
            </div>
            <div className="hidden lg:block">
              <Ferri pose="party" size={250} alive decorative />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
