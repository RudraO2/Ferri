import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Check,
  FolderLock,
  Gauge,
  GitBranch,
  LayoutTemplate,
  MessagesSquare,
  Package,
  PencilLine,
  ShieldCheck,
  SquareCheckBig,
  Terminal,
} from "lucide-react";
import { Ferri, FerriAvatar } from "@/components/ferri";
import { PlatformLogo } from "@/components/platform";
import { GithubMark } from "../_components/icons";
import { SWITCH, SWITCH_FORK, doc } from "../_components/links";
import { Spine } from "../welcome/spine";

export const metadata: Metadata = {
  title: "Built on Switch",
  description:
    "How Ferri uses Switch: every group on every app is a Switch room, Ferri is one agent in all of them over the agent protocol, every approval is a Switch card, every message passes Switch Trust, and the Builder is a Switch-managed agent. Plus the two things we added to Switch core.",
};

const ARCH = doc("architecture");
const FORK_COMMIT_EDIT = "https://github.com/RudraO2/switch/commit/2711974943c2e72540e012cb8171c9e59cfd2511";
const FORK_COMMIT_WA = "https://github.com/RudraO2/switch/commit/e5c2fc68e140f26677ab4fbcf2de8eb1479be22b";

type Row = { feature: string; api?: string; does: string; where: string };

/** The rows of docs/architecture.md's "Why Switch is the spine" table, grouped. */
const GROUPS: { title: string; icon: typeof Bot; rows: Row[] }[] = [
  {
    title: "Switch Rooms and the agent protocol",
    icon: MessagesSquare,
    rows: [
      {
        feature: "Switch Rooms, bridged to Mattermost, Slack, Discord, Telegram and WhatsApp",
        api: "collaboration bridges",
        does: "Every channel becomes a room. One agent connection serves every platform, and one answer fans out to askers on four apps with native mentions.",
        where: "apps/ferri/src/flow.ts, rooms.ts",
      },
      {
        feature: "The always-on agent protocol",
        api: "SSE down, HTTP up",
        does: "Our own small TypeScript client: the event stream with a string cursor, heartbeat, typing, posting, ops, and catch-up after a restart.",
        where: "packages/switch",
      },
      {
        feature: "Addressing and follow_the_conversation",
        does: "Ferri tells a real mention from a follow-up, and runs a fast triage model on room chatter it was not addressed in.",
        where: "apps/ferri/src/mentions.ts, packages/knowledge/src/triage.ts",
      },
      {
        feature: "Gateway",
        api: "auth, rooms, agents, collaborations",
        does: "Desk and Pocket sign in with Switch accounts. Desk adds Ferri to rooms, discovers spaces and connects Shield. ./ferri connect adds platform connections.",
        where: "apps/desk, scripts/",
      },
    ],
  },
  {
    title: "Question and approval cards",
    icon: SquareCheckBig,
    rows: [
      {
        feature: "Question cards",
        api: "/agent-sessions/{sid}/approvals",
        does: "Every step that needs a person is a card: unknown questions, replies waiting in Approve spaces, announcements, plan decisions, care cases, guest emails, social posts, desk packs, outreach emails and closing an event. The ladder (nudge, escalate, close) runs on them. Buttons on Slack, Discord and Telegram; a typed A1 \"text\" works everywhere, WhatsApp included.",
        where: "apps/ferri/src/loop.ts, launch.ts, care.ts, guests.ts, social.ts, desks.ts, wrap.ts",
      },
      {
        feature: "The card text limit",
        does: "Switch's text renderer shows at most 800 characters of a card's prompt. Ferri posts any longer prompt as a message just above the card, so long drafts stay answerable.",
        where: "packages/switch/src/client.ts (openQuestionsCard)",
      },
      {
        feature: "Answering a card as a person",
        api: "/gateway/agent-sessions/.../answer",
        does: "Desk and Pocket answer cards through Switch, under the signed-in organizer's name.",
        where: "apps/desk/lib/cards.ts",
      },
    ],
  },
  {
    title: "Switch Trust",
    icon: ShieldCheck,
    rows: [
      {
        feature: "Switch Trust",
        api: "/guardrails/check",
        does: "Shield is our own Trust endpoint inside the Ferri service. It blocks scam links and floods, redacts leaked secrets and alerts the crew, in 2 to 9 ms with no model in the path.",
        where: "packages/shield, apps/ferri/src/shield.ts",
      },
    ],
  },
  {
    title: "Room templates, documents and media",
    icon: LayoutTemplate,
    rows: [
      {
        feature: "Room templates (Templates v2)",
        api: "create_room_from_yaml",
        does: "“Make team rooms” and “make a judging desk” create real channels on the platform, private or public, with the people asked for, Ferri and a kickoff, attached to the event at once.",
        where: "apps/ferri/src/launch.ts, desks.ts, packages/knowledge/src/desks.ts",
      },
      {
        feature: "Library documents",
        does: "The live knowledge is mirrored into a Switch library document attached to the event's rooms. The plan, the recap, the starter kit and every desk sheet are documents too, and follow every change.",
        where: "packages/knowledge/src/mirror.ts, apps/ferri/src/plan.ts",
      },
      {
        feature: "Agent media and read_context",
        api: "/agents/{id}/rooms/{room}/media",
        does: "Posters go out as native images on every platform after one OK. Ferri reads the Builder's files from the room with read_context.",
        where: "packages/switch/src/client.ts (sendMedia), apps/ferri/src/builder.ts",
      },
    ],
  },
  {
    title: "Managed agents",
    icon: Bot,
    rows: [
      {
        feature: "Agent management and the headless agent controller",
        api: "create_agent",
        does: "Ferri creates its own Builder through Switch: a managed Claude Code agent on a Switch agent controller on the organizer's machine. Switch starts a session whenever it is addressed and gives it the Switch tools over MCP.",
        where: "scripts/builder-setup.ts, apps/ferri/src/builder.ts",
      },
      {
        feature: "Handing work to a coding agent",
        api: "invite_agent_to_room, send_targeted_message",
        does: "Ferri puts the Builder in the crew room and hands each job over as a targeted message bound to that room. The Builder reports back to Ferri the same way.",
        where: "packages/switch/src/client.ts (roomOp), apps/ferri/src/care.ts",
      },
      {
        feature: "Addressing policy",
        api: "PUT /gateway/agents/{id}/addressing-policy",
        does: "Decides who may address the Builder and answer its cards: the owner everywhere, the crew in crew rooms, and a member's room only while the Builder is helping that member.",
        where: "apps/ferri/src/builder.ts (syncPolicy)",
      },
      {
        feature: "Session activity and the agent's own cards",
        does: "The Builder's progress shows as Switch activity cards. Its Claude Code permission prompts become Switch cards in the room, answered there, in Desk or in Pocket. Public steps always ask.",
        where: "builder/.claude/settings.json, apps/desk/lib/builder.ts",
      },
      {
        feature: "Shipping to production behind a card",
        does: "The Builder creates the event site's Supabase project and deploys on Vercel. Claude Code's prompt for vercel deploy --prod is the Switch card the crew answers.",
        where: "builder/kits/event-site, builder/.claude/skills/ship-event-site",
      },
      {
        feature: "Budgets",
        api: "/gateway/tenants/{tid}/budgets",
        does: "The Builder has its own output-token and turn budget per 24 hours. Switch stops it when it is spent; Ferri holds new jobs until the reset, and Desk shows the spend.",
        where: "scripts/builder-setup.ts, apps/desk/app/(desk)/builder",
      },
      {
        feature: "Room documents as shared context",
        api: "load_internal_documents",
        does: "The hand-off points the Builder at the knowledge and plan documents attached to the crew room, so the brief stays short.",
        where: "packages/knowledge/src/builder.ts",
      },
    ],
  },
];

/** One message, end to end. */
const TRIP = [
  {
    title: "A member asks on Telegram",
    body: "“@ferri can I bring my dog?” in the event's Telegram group. Switch's Telegram bridge makes that group a Switch room, like every other group on every other app.",
    tag: "Telegram → Switch room",
    logo: "telegram",
  },
  {
    title: "Switch Trust checks it",
    body: "Before anyone sees it, Switch sends the message to Shield at /guardrails/check. Scam links and floods are blocked, leaked keys become [redacted]. 2 to 9 ms, no model.",
    tag: "Switch Trust → Shield",
    icon: ShieldCheck,
  },
  {
    title: "Ferri reads it over the agent protocol",
    body: "One SSE stream brings Ferri every room's events. Addressing tells it this was a real mention. Posts, typing, heartbeat and ops go back up over HTTP.",
    tag: "SSE down, HTTP up",
    icon: Terminal,
  },
  {
    title: "It doesn't know, so it asks once",
    body: "The member hears “I'm checking with the team” at once. A Switch question card opens in the crew room for whoever owns that topic, and their phone buzzes through Pocket.",
    tag: "Card in the crew room",
    icon: SquareCheckBig,
  },
  {
    title: "The crew answers the card",
    body: "A button on Slack, Discord or Telegram, a typed A1 “Yes, dogs are welcome” anywhere, or Desk and Pocket, which answer through Switch under the organizer's name.",
    tag: "One answer",
    icon: Check,
  },
  {
    title: "Everyone who asked gets it",
    body: "The answer reaches every member who asked the same thing, in their own room on their own app, with a real mention. Ferri saves it, so the next person gets it at once.",
    tag: "Fanned out to every room",
    icon: MessagesSquare,
  },
];

function ApiTag({ children }: { children: React.ReactNode }) {
  return <code className="inline-block rounded-md bg-brand-soft px-1.5 py-0.5 font-mono text-[12px] leading-snug break-all text-brand-ink">{children}</code>;
}

export default function BuiltOnSwitch() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative isolate -mt-[76px] pt-[128px] pb-16 sm:pb-20">
        <div className="hero-sky" aria-hidden>
          <span className="cloud top-[12%] left-[-6%] h-[120px] w-[420px]" />
          <span className="cloud top-[34%] left-[10%] h-[70px] w-[260px] [animation-delay:-12s]" />
          <span className="cloud top-[8%] right-[-4%] h-[130px] w-[460px] [animation-delay:-6s]" />
        </div>

        <div className="site-section text-center">
          <div className="rise inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 py-1 pr-3.5 pl-1 text-[14px] font-medium text-zinc-700 shadow-[0_2px_12px_-6px_rgba(40,60,60,0.25)] backdrop-blur">
            <FerriAvatar size={26} />
            <span>
              Built on <span className="font-semibold text-brand-ink">Switch</span>, by SandboxAQ
            </span>
          </div>

          <h1 className="rise mx-auto mt-6 max-w-[1100px] text-zinc-900 [animation-delay:80ms]">
            <span className="display block text-[clamp(40px,6.6vw,88px)]">Take Switch away,</span>
            <span className="font-serif-display block text-[clamp(40px,6.8vw,92px)] leading-[1.04]">and Ferri is five separate bots.</span>
          </h1>

          <p className="rise mx-auto mt-6 max-w-[680px] text-[clamp(17px,1.5vw,19px)] leading-[1.6] text-zinc-600 [animation-delay:160ms]">
            Every group on every app is a Switch room. Ferri is one Switch agent in all of them. Every approval is a Switch card, every message passes Switch Trust, and the
            Builder is a Switch-managed agent. Ferri has no code for any chat app: it speaks only to Switch.
          </p>

          <div className="rise mt-8 flex flex-wrap items-center justify-center gap-3 [animation-delay:240ms]">
            <a href={SWITCH} className="btn-primary h-[52px] px-7 text-[16px]">
              <GithubMark size={17} /> Switch on GitHub
            </a>
            <a href={ARCH} className="btn h-[52px] px-7 text-[16px]">
              Read architecture.md <ArrowRight size={17} aria-hidden />
            </a>
          </div>
          <ul className="rise mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13.5px] text-zinc-600 [animation-delay:300ms]">
            <li className="inline-flex items-center gap-1.5">
              <Check size={15} className="text-brand" aria-hidden /> One agent connection, five apps
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Check size={15} className="text-brand" aria-hidden /> No chat-app SDK in Ferri
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Check size={15} className="text-brand" aria-hidden /> Two additions to Switch core
            </li>
          </ul>
        </div>
      </section>

      {/* ── The spine ────────────────────────────────────────── */}
      <section className="site-section pb-24 lg:pb-32">
        <div className="grid items-end gap-8 lg:grid-cols-[1fr_auto]">
          <div className="max-w-[760px]">
            <p className="kicker">The spine</p>
            <h2 className="display text-[clamp(34px,4.6vw,58px)] text-zinc-900">Apps on one side. Ferri on the other. Switch in the middle.</h2>
            <p className="lede">
              Members and crew stay on their own apps. Switch turns each of their groups into a room and hands Ferri one stream of all of them. Ferri, the Builder and the crew&apos;s
              Desk and Pocket all work through it.
            </p>
          </div>
          <span className="hidden lg:block">
            <Ferri pose="switch" size={200} decorative />
          </span>
        </div>
        <div className="mt-12">
          <Spine />
        </div>
      </section>

      {/* ── Feature map ──────────────────────────────────────── */}
      <section id="features" className="scroll-mt-24 border-y border-zinc-200 bg-zinc-100/60 py-24 lg:py-28">
        <div className="site-section">
          <div className="max-w-[760px]">
            <p className="kicker">Every Switch feature Ferri uses</p>
            <h2 className="display text-[clamp(34px,4.6vw,58px)] text-zinc-900">What Ferri does with each part of Switch.</h2>
            <p className="lede">
              This is the table from{" "}
              <a href={ARCH} className="font-medium text-brand-ink underline decoration-brand-line underline-offset-4 hover:decoration-brand">
                docs/architecture.md
              </a>
              , with the file in the repo where each one lives.
            </p>
          </div>

          <div className="mt-12 space-y-6">
            {GROUPS.map((g) => (
              <div key={g.title} className="overflow-hidden rounded-[24px] border border-zinc-200 bg-white">
                <div className="flex items-center gap-3 border-b border-zinc-200 px-5 py-4 sm:px-6">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-brand-soft text-brand-ink">
                    <g.icon size={18} aria-hidden />
                  </span>
                  <h3 className="font-display text-[20px] font-extrabold tracking-[-0.02em] text-zinc-900 sm:text-[22px]">{g.title}</h3>
                </div>
                <div className="hidden grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] gap-8 border-b border-zinc-200 bg-zinc-50 px-6 py-2 text-[12.5px] font-medium text-zinc-500 md:grid">
                  <span>Switch feature</span>
                  <span>What Ferri does with it</span>
                </div>
                <ul className="divide-y divide-zinc-200">
                  {g.rows.map((r) => (
                    <li key={r.feature} className="grid gap-2 px-5 py-4 sm:px-6 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] md:gap-8 md:py-5">
                      <div className="min-w-0">
                        <div className="text-[15.5px] leading-snug font-semibold text-zinc-900">{r.feature}</div>
                        {r.api ? (
                          <div className="mt-1.5">
                            <ApiTag>{r.api}</ApiTag>
                          </div>
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[15px] leading-relaxed text-zinc-700">{r.does}</p>
                        <p className="mt-1.5 font-mono text-[12px] leading-snug break-words text-zinc-500">{r.where}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── One message, end to end ──────────────────────────── */}
      <section id="trip" className="site-section scroll-mt-24 py-24 lg:py-32">
        <div className="max-w-[760px]">
          <p className="kicker">One message, end to end</p>
          <h2 className="display text-[clamp(34px,4.6vw,58px)] text-zinc-900">From a Telegram group to every room, through Switch.</h2>
          <p className="lede">The whole stack in one picture, then one question&apos;s trip through it.</p>
        </div>

        <figure className="mt-12 overflow-hidden rounded-[24px] border border-zinc-200 bg-white shadow-[var(--shadow-card)]">
          <Image
            src="/site/how-it-fits.png"
            alt="How Ferri fits together: Discord, Telegram, Slack, WhatsApp and Mattermost on top; Switch, our fork, as the spine with rooms and bridges, approval cards, Trust, templates, library documents, media, managed agents, budgets, plus agent message edit and the WhatsApp bridge; below it the Ferri service with Shield, Ferri Builder and Claude; then outside services, Postgres with pgvector, and Desk and Pocket."
            width={1600}
            height={1019}
            sizes="(min-width: 1160px) 1100px, 100vw"
            className="h-auto w-full"
          />
        </figure>
        <p className="mt-3 text-[13.5px] text-zinc-500">
          The same picture as text is in{" "}
          <a href={`${ARCH}#how-it-fits-together`} className="underline underline-offset-2 hover:text-zinc-700">
            architecture.md
          </a>
          .
        </p>

        <ol className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TRIP.map((s, i) => (
            <li key={s.title} className="relative flex flex-col rounded-[22px] border border-zinc-200 bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="num inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-[16px] text-white">{i + 1}</span>
                <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-[12px] font-medium text-zinc-600">
                  {s.logo ? <PlatformLogo platform={s.logo} size={13} /> : s.icon ? <s.icon size={13} className="shrink-0 text-brand" aria-hidden /> : null}
                  <span className="truncate">{s.tag}</span>
                </span>
              </div>
              <h3 className="mt-4 text-[17px] font-semibold tracking-[-0.01em] text-zinc-900">{s.title}</h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-zinc-600">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── What we added to Switch core ─────────────────────── */}
      <section id="added" className="scroll-mt-24 overflow-hidden bg-[#0d1b1e] py-24 text-[#eef3f2] lg:py-32">
        <div className="site-section">
          <div className="max-w-[760px]">
            <p className="mb-3 text-[14px] font-semibold text-[#8fe0da]">What we added to Switch core</p>
            <h2 className="display text-[clamp(34px,4.6vw,58px)]">Two things Ferri needed that Switch didn&apos;t have yet.</h2>
            <p className="mt-5 max-w-[640px] text-[17.5px] leading-[1.65] text-[#b9cccc]">
              Both live in our fork,{" "}
              <a href={SWITCH_FORK} className="font-medium text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">
                RudraO2/switch, branch ferri/agent-message-edit
              </a>
              , and ship in Ferri&apos;s Switch core image, <code className="font-mono text-[15px] text-[#8fe0da]">ghcr.io/rudrao2/ferri-switch-core</code>, which{" "}
              <code className="font-mono text-[15px] text-[#8fe0da]">./ferri up</code> runs.
            </p>
          </div>

          <div className="mt-12 grid gap-5 lg:grid-cols-2">
            {/* Agent message edit */}
            <article className="flex min-w-0 flex-col rounded-[24px] border border-white/10 bg-white/[0.04] p-6 sm:p-7">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#ff9b72]/15 text-[#ffb896]">
                  <PencilLine size={19} aria-hidden />
                </span>
                <h3 className="font-display text-[24px] font-extrabold tracking-[-0.02em] text-white">Agent message edit</h3>
              </div>
              <p className="mt-4 text-[15.5px] leading-relaxed text-[#b9cccc]">
                &ldquo;Fix the announcement everywhere&rdquo; needs an agent that can edit its own post. Switch had no op and no route for it, though every platform adapter already had{" "}
                <code className="font-mono text-[13.5px] text-white">update_message</code>. So we added the route:
              </p>
              <pre className="mt-5 overflow-x-auto rounded-[14px] bg-black/30 px-4 whitespace-pre-wrap [overflow-wrap:anywhere] sm:whitespace-pre sm:[overflow-wrap:normal] py-3.5 font-mono text-[12.5px] leading-[1.8] text-[#e6f2f1]">
                <span className="text-[#5fd3cb]">POST</span> /agents/{"{agent_id}"}/messages/{"{event_id}"}/edit{"\n"}
                {'{ "room_id": "...", "content": "..." }'}
                {"\n"}
                <span className="text-white/45">→</span> {'{ "ok": true, "edited": true }'}
              </pre>
              <ul className="mt-5 space-y-2.5 text-[14.5px] leading-relaxed text-[#b9cccc]">
                {[
                  "Checks room membership and budget like a post, and refuses any message that is not the agent's own (403).",
                  "Runs the new text through Switch Trust, so Shield checks edits too.",
                  "The room's bridge finds the platform post in its message map and redraws it in place on Mattermost, Slack, Discord and Telegram.",
                  "Without the image Ferri still works: an edit falls back to a new post that starts with “Update:”.",
                ].map((t) => (
                  <li key={t} className="flex gap-2.5">
                    <Check size={16} className="mt-[3px] shrink-0 text-[#5fd3cb]" aria-hidden />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex flex-wrap gap-x-5 gap-y-2 pt-6 text-[14px] font-medium">
                <a href={`${ARCH}#what-we-added-to-switch-agent-message-edit`} className="inline-flex items-center gap-1.5 text-[#8fe0da] hover:text-white">
                  How it works <ArrowRight size={14} aria-hidden />
                </a>
                <a href={FORK_COMMIT_EDIT} className="inline-flex items-center gap-1.5 text-[#8fe0da] hover:text-white">
                  <GitBranch size={14} aria-hidden /> Commit 2711974
                </a>
              </div>
            </article>

            {/* WhatsApp bridge */}
            <article className="flex min-w-0 flex-col rounded-[24px] border border-white/10 bg-white/[0.04] p-6 sm:p-7">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-white/10">
                  <PlatformLogo platform="whatsapp" size={20} />
                </span>
                <h3 className="font-display text-[24px] font-extrabold tracking-[-0.02em] text-white">
                  The <code className="font-mono text-[20px] font-semibold">whatsapp_web</code> bridge
                </h3>
              </div>
              <p className="mt-4 text-[15.5px] leading-relaxed text-[#b9cccc]">
                Community groups often live on WhatsApp, and the Switch release we build on had no WhatsApp bridge. We added a messaging platform the way Switch&apos;s own guide adds
                one: one adapter folder, one line in <code className="font-mono text-[13.5px] text-white">platforms.py</code>, and a docs page.
              </p>
              <pre className="mt-5 overflow-x-auto rounded-[14px] bg-black/30 px-4 whitespace-pre-wrap [overflow-wrap:anywhere] sm:whitespace-pre sm:[overflow-wrap:normal] py-3.5 font-mono text-[12.5px] leading-[1.8] text-[#e6f2f1]">
                core/switch_core/bridges/collaboration/{"\n"}
                {"  "}whatsapp_web/adapter.py
              </pre>
              <ul className="mt-5 space-y-2.5 text-[14.5px] leading-relaxed text-[#b9cccc]">
                {[
                  "Talks to a WAHA sidecar linked to the organizer's own number by QR code or pairing code. It dials out, so no public address is needed.",
                  "Only the chats named in the connection become rooms. The organizer's other chats never reach Switch.",
                  "Posts are paced like a person: typing first, at least 3 seconds apart in one chat, at most 30 an hour.",
                  "Quote replies are threads; edits, deletes and attachments go both ways; cards are answered by typing. 26 adapter tests in the fork.",
                ].map((t) => (
                  <li key={t} className="flex gap-2.5">
                    <Check size={16} className="mt-[3px] shrink-0 text-[#5fd3cb]" aria-hidden />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex flex-wrap gap-x-5 gap-y-2 pt-6 text-[14px] font-medium">
                <a href={`${ARCH}#what-we-added-to-switch-a-whatsapp-bridge`} className="inline-flex items-center gap-1.5 text-[#8fe0da] hover:text-white">
                  How it works <ArrowRight size={14} aria-hidden />
                </a>
                <a href={FORK_COMMIT_WA} className="inline-flex items-center gap-1.5 text-[#8fe0da] hover:text-white">
                  <GitBranch size={14} aria-hidden /> Commit e5c2fc6
                </a>
              </div>
            </article>
          </div>

          <div className="mt-6 flex flex-col gap-4 rounded-[20px] border border-white/10 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex min-w-0 items-start gap-3">
              <Package size={20} className="mt-0.5 shrink-0 text-[#8fe0da]" aria-hidden />
              <p className="text-[14.5px] leading-relaxed text-[#b9cccc]">
                <span className="font-semibold text-white">One thin image, nothing else changes.</span> Switch&apos;s published core{" "}
                <code className="font-mono text-[13px] break-all text-white">0.31.1-dev.339.g86d5928</code> plus the two additions, built for amd64 and arm64.
              </p>
            </div>
            <a
              href={SWITCH_FORK}
              className="btn h-11 shrink-0 self-start border-white/20 bg-white/10 px-5 text-[14.5px] text-white hover:bg-white/15 sm:self-auto"
              style={{ boxShadow: "none" }}
            >
              <GithubMark size={15} /> See the fork
            </a>
          </div>
        </div>
      </section>

      {/* ── The Builder ──────────────────────────────────────── */}
      <section id="builder" className="site-section grid scroll-mt-24 items-center gap-12 py-24 lg:grid-cols-[1.1fr_0.9fr] lg:py-32">
        <div className="min-w-0">
          <p className="kicker">A Switch-managed agent</p>
          <h2 className="display text-[clamp(34px,4.6vw,58px)] text-zinc-900">The Builder: Claude Code, run by Switch.</h2>
          <p className="lede">
            Some event work is making things: the event site, posters, listings. Ferri hands that to Ferri Builder, a Claude Code agent that Switch itself runs on the
            organizer&apos;s machine.
          </p>
          <ul className="mt-8 space-y-5">
            {[
              {
                icon: Bot,
                t: "Created and run through Switch",
                d: "Ferri creates the Builder with Switch's agent management. It runs on Switch's headless agent controller, and Switch starts a session whenever it is addressed.",
              },
              {
                icon: FolderLock,
                t: "Its own folder, its own Claude home",
                d: "It works in ~/.ferri/builder, seeded from builder/ in the repo, so the organizer's personal Claude settings never reach it.",
              },
              {
                icon: Gauge,
                t: "Its own budget in Switch",
                d: "400k output tokens and 60 turns per 24 hours by default. When it is spent Switch stops the Builder, and Ferri holds new jobs until the reset.",
              },
              {
                icon: SquareCheckBig,
                t: "Permission prompts become Switch cards",
                d: "Every public step (deploy, push, email, post) is a Claude Code permission prompt, which Switch shows as a card. A no means nothing is published.",
              },
            ].map((x) => (
              <li key={x.t} className="flex gap-4">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-brand-soft text-brand-ink">
                  <x.icon size={19} aria-hidden />
                </span>
                <div className="min-w-0">
                  <div className="text-[17px] font-semibold text-zinc-900">{x.t}</div>
                  <div className="mt-0.5 text-[15px] leading-relaxed text-zinc-600">{x.d}</div>
                </div>
              </li>
            ))}
          </ul>
          <a href={doc("builder")} className="btn mt-9 h-11 px-5 text-[14.5px]">
            Read builder.md <ArrowRight size={15} aria-hidden />
          </a>
        </div>

        {/* An illustration of a Builder permission card in the crew room. */}
        <figure className="min-w-0">
          <div className="rounded-[24px] border border-zinc-200 bg-white p-4 shadow-[var(--shadow-pop)] sm:p-5">
            <div className="flex items-center gap-2 border-b border-zinc-200 pb-3 text-[13px] text-zinc-500">
              <PlatformLogo platform="discord" size={15} />
              <span className="font-medium text-zinc-700">#crew</span>
              <span aria-hidden>·</span>
              <span>a Switch room</span>
            </div>

            <div className="mt-4 flex gap-2.5">
              <FerriAvatar size={30} />
              <div className="min-w-0 text-[14px] leading-snug">
                <span className="font-semibold text-brand-ink">Ferri</span>{" "}
                <span className="text-zinc-700">Job B1 is with the Builder: ship the Build Night site.</span>
              </div>
            </div>

            <div className="mt-3 rounded-[16px] bg-zinc-50 p-3">
              <div className="flex items-center gap-2 text-[12.5px] font-medium text-zinc-500">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft text-zinc-800">
                  <Bot size={13} aria-hidden />
                </span>
                Builder · activity
              </div>
              <ul className="mt-2 space-y-1 font-mono text-[12px] text-zinc-600">
                <li>✓ read knowledge and plan from the room</li>
                <li>✓ created the Supabase project</li>
                <li>✓ set the Vercel environment</li>
              </ul>
            </div>

            <div className="mt-3 rounded-[16px] border-2 border-brand bg-white p-4">
              <div className="flex items-center gap-2 text-[12.5px] font-semibold text-brand-ink">
                <SquareCheckBig size={15} aria-hidden /> Permission card
              </div>
              <p className="mt-2 text-[14px] leading-snug text-zinc-800">The Builder wants to run:</p>
              <code className="mt-1.5 block rounded-[10px] bg-[#0d1b1e] px-3 py-2 font-mono text-[12.5px] break-all text-[#e6f2f1]">vercel deploy --prod</code>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="btn-primary pointer-events-none h-9 px-4 text-[13px]">Allow once</span>
                <span className="btn pointer-events-none h-9 px-4 text-[13px]">Decline</span>
              </div>
              <p className="mt-3 text-[12.5px] text-zinc-500">Answer here, in Desk or in Pocket.</p>
            </div>
          </div>
          <figcaption className="hand mt-3 text-center text-[21px] text-zinc-600">nothing goes live without the crew&apos;s yes</figcaption>
        </figure>
      </section>

      {/* ── Final call to action ─────────────────────────────── */}
      <section className="px-4 pb-20 sm:px-8">
        <div className="relative mx-auto max-w-[1160px] overflow-hidden rounded-[36px] bg-brand px-6 py-14 text-white shadow-[inset_0_-6px_0_var(--brand-lip)] sm:px-14 sm:py-16">
          <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <h2 className="display text-[clamp(36px,5.2vw,64px)]">Run Switch and Ferri yourself.</h2>
              <p className="mt-4 max-w-[600px] text-[17px] leading-relaxed text-white">
                One command starts Switch with our two additions, a Mattermost to try it in, Ferri and Desk, with a demo event already loaded.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/start" className="btn h-12 border-0 bg-white px-6 text-[15.5px] text-zinc-900 hover:bg-zinc-50">
                  Get started <ArrowRight size={16} aria-hidden />
                </Link>
                <a href={SWITCH} className="btn h-12 border-white/40 bg-transparent px-6 text-[15.5px] text-white hover:bg-white/10" style={{ boxShadow: "none" }}>
                  <GithubMark size={16} /> Switch on GitHub
                </a>
                <a href={SWITCH_FORK} className="btn h-12 border-white/40 bg-transparent px-6 text-[15.5px] text-white hover:bg-white/10" style={{ boxShadow: "none" }}>
                  Our Switch fork
                </a>
              </div>
            </div>
            <div className="hidden lg:block">
              <Ferri pose="party" size={230} alive decorative />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
