import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarCheck, Flag, Hammer, Megaphone, Play, Radio } from "lucide-react";
import { Art, Ferri, FerriAvatar, FerriLogo, FerriLoop } from "@/components/ferri";
import { PlatformLogo } from "@/components/platform";
import { ThemeToggle } from "@/components/theme-toggle";
import { HowItWorks } from "./how-it-works";
import { Spine } from "./spine";

// Rendered per request, so newly added character art shows without a rebuild.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ferri: every question, answered once",
  description:
    "Ferri answers your community on Discord, Telegram, Slack, WhatsApp and Mattermost. When it doesn't know, it asks your crew once and carries the answer back to everyone. Built on Switch.",
};

const GITHUB = "https://github.com/RudraO2/Ferri";
const DISCORD = "https://discord.gg/5FWRzfCcNa";
const TELEGRAM = "https://t.me/+-7EpwBLi8QxlNDJl";

const STAGES = [
  { icon: CalendarCheck, name: "Plan", line: "Crew chatter becomes decisions, owners and deadlines. One card per decision.", art: "stage-plan" },
  { icon: Hammer, name: "Build", line: "The Builder ships the event site, posters and listings, each after your OK.", art: "stage-build" },
  { icon: Megaphone, name: "Launch", line: "One announcement on every app. Partners emailed, guests reminded.", art: "stage-launch" },
  { icon: Radio, name: "Live", line: "Answers with sources, cards for the crew, care for stuck members, Shield on every message.", art: "stage-live" },
  { icon: Flag, name: "Wrap", line: "A recap with real numbers, partners saved, a starter kit for next time.", art: "stage-wrap" },
];

export default function Welcome() {
  const video = process.env.FERRI_VIDEO_URL || `${GITHUB}#readme`;
  return (
    <div className="overflow-x-clip">
      <header className="sticky top-3 z-30 px-4">
        <nav className="mx-auto flex max-w-[1000px] items-center justify-between rounded-full border border-zinc-200 bg-white/85 py-2 pr-2 pl-4 shadow-[var(--shadow-card)] backdrop-blur" aria-label="Main">
          <Link href="/welcome" aria-label="Ferri home">
            <FerriLogo size={30} />
          </Link>
          <div className="hidden items-center gap-7 text-[14.5px] font-medium text-zinc-600 md:flex">
            <a href="#how" className="hover:text-zinc-900">
              How it works
            </a>
            <a href="#switch" className="hover:text-zinc-900">
              Switch
            </a>
            <a href="#event" className="hover:text-zinc-900">
              Across the event
            </a>
            <a href={GITHUB} className="hover:text-zinc-900">
              GitHub
            </a>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Link href="/login" className="btn-primary h-10 px-4 text-[14px]">
              Open Desk
            </Link>
          </div>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-[1160px] items-center gap-10 px-5 pt-16 pb-14 sm:px-8 lg:grid-cols-[1.2fr_0.8fr] lg:pt-24 [&>*]:min-w-0">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[13px] font-medium text-zinc-600 shadow-[0_2px_0_var(--n-200)]">
              <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-brand px-2 text-[11px] font-semibold whitespace-nowrap text-white">Built on Switch</span>
              for the WeMakeDevs Flip the Switch hackathon
            </div>
            <h1 className="display text-[clamp(44px,6.4vw,78px)] text-zinc-900">
              Every question,
              <br />
              <span className="text-brand">answered once.</span>
            </h1>
            <p className="mt-6 max-w-[560px] text-[18px] leading-[1.65] text-zinc-600">
              Ferri is the teammate that answers your community on <span className="hl text-zinc-900">every app</span>. When it doesn&apos;t know, it asks your crew once and carries the answer
              back to everyone who asked.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={DISCORD} className="btn-primary h-12 px-6 text-[15.5px]">
                Ask Ferri on Discord <ArrowRight size={17} aria-hidden />
              </a>
              <a href={video} className="btn h-12 bg-zinc-900 px-6 text-[15.5px] text-zinc-50 hover:bg-zinc-800" style={{ boxShadow: "inset 0 -4px 0 var(--n-950)" }}>
                <Play size={16} aria-hidden /> Watch the video
              </a>
              <a href={GITHUB} className="btn h-12 px-5 text-[15.5px]">
                <PlatformLogo platform="github" size={17} /> GitHub
              </a>
            </div>
            <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-zinc-500">
              Or try it on
              <a href={TELEGRAM} className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 font-medium text-zinc-800 hover:border-zinc-300">
                <PlatformLogo platform="telegram" size={14} /> Telegram
              </a>
              , or
              <Link href="/login" className="font-medium text-zinc-800 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-800">
                look around its Desk
              </Link>
            </p>
          </div>
          <div className="relative flex justify-center">
            <div className="absolute inset-x-6 bottom-6 h-24 rounded-[50%] bg-brand-soft blur-2xl" aria-hidden />
            <FerriLoop name="hero-loop" width={460} height={460} priority alt="Ferri, a friendly sea otter, floating with a message card" className="relative w-[min(460px,84vw)]" />
            <div className="hand absolute top-2 left-0 -rotate-6 text-[28px] leading-none text-zinc-800 sm:text-[32px]">
              Ferri.
              <br />
              <span className="text-[24px] sm:text-[28px]">Never lets a question drift.</span>
              <svg width="56" height="44" viewBox="0 0 56 44" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="mt-1 ml-24" aria-hidden>
                <path d="M4 4 C14 18 26 30 46 38" />
                <path d="M46 38 l-12 0 M46 38 l-5 -11" />
              </svg>
            </div>
          </div>
        </section>

        {/* Platforms */}
        <section className="mx-auto max-w-[1000px] px-5 pb-20 sm:px-8" aria-label="Where Ferri works">
          <p className="mb-5 text-center text-[13px] font-semibold tracking-[0.1em] text-zinc-400 uppercase">Lives where your community already is</p>
          <ul className="flex flex-wrap items-center justify-center gap-x-9 gap-y-4">
            {["discord", "telegram", "slack", "whatsapp", "mattermost"].map((p) => (
              <li key={p} className="flex items-center gap-2 text-[17px] font-semibold text-zinc-700">
                <PlatformLogo platform={p} size={24} />
                {p === "whatsapp" ? "WhatsApp" : p.charAt(0).toUpperCase() + p.slice(1)}
              </li>
            ))}
          </ul>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-24 border-y border-zinc-200 bg-zinc-100/60 py-20">
          <div className="mx-auto max-w-[1160px] px-5 sm:px-8">
            <div className="mb-8 max-w-[720px]">
              <div className="mb-3 text-[13px] font-semibold tracking-[0.1em] text-brand-ink uppercase">How it works</div>
              <h2 className="display text-[clamp(34px,4.6vw,56px)] text-zinc-900">
                The crew inside. The community outside. <span className="text-brand">Ferri carries it across.</span>
              </h2>
            </div>
            <div className="mb-10 grid grid-cols-[1fr_1.3fr_1fr] items-end gap-2 sm:gap-6" aria-hidden>
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

        {/* Switch */}
        <section id="switch" className="mx-auto max-w-[1160px] scroll-mt-24 px-5 py-24 sm:px-8">
          <div className="mb-12 grid items-end gap-8 lg:grid-cols-[1fr_auto]">
            <div className="max-w-[720px]">
              <div className="mb-3 text-[13px] font-semibold tracking-[0.1em] text-brand-ink uppercase">Why Switch is the spine</div>
              <h2 className="display text-[clamp(34px,4.6vw,56px)] text-zinc-900">
                One stream, every app, <span className="hl">real approvals.</span>
              </h2>
              <p className="mt-5 text-[17px] leading-relaxed text-zinc-600">
                Switch bridges every platform into rooms, gives Ferri cards the crew can tap, checks every message with Trust, runs the Builder as a managed agent and keeps its budget. We
                added two things Ferri needed.
              </p>
            </div>
            <span className="hidden lg:block"><Ferri pose="switch" size={220} decorative /></span>
          </div>
          <Spine />
        </section>

        {/* Across the event */}
        <section id="event" className="scroll-mt-24 border-t border-zinc-200 bg-zinc-100/60 py-24">
          <div className="mx-auto max-w-[1160px] px-5 sm:px-8">
            <div className="mb-12 max-w-[720px]">
              <div className="mb-3 text-[13px] font-semibold tracking-[0.1em] text-brand-ink uppercase">Across the event</div>
              <h2 className="display text-[clamp(34px,4.6vw,56px)] text-zinc-900">From the first idea to the last thank-you.</h2>
            </div>
            <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {STAGES.map((s, i) => (
                <li key={s.name} className="card flex flex-col p-5">
                  <div className="-mx-2 -mt-2 mb-1 flex justify-center rounded-[16px] bg-brand-soft/60">
                    <Art name={s.art} width={180} height={180} className="w-[150px]" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] bg-brand-soft text-brand">
                      <s.icon size={18} aria-hidden />
                    </span>
                    <span className="num text-[13px] text-zinc-400">0{i + 1}</span>
                  </div>
                  <h3 className="mt-4 font-display text-[22px] font-extrabold tracking-[-0.03em] text-zinc-900">{s.name}</h3>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-zinc-600">{s.line}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Call to action */}
        <section className="px-4 py-20 sm:px-8">
          <div className="relative mx-auto max-w-[1160px] overflow-hidden rounded-[36px] bg-brand px-6 py-14 text-white shadow-[inset_0_-6px_0_var(--brand-lip)] sm:px-14">
            <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
              <div>
                <h2 className="display text-[clamp(36px,5vw,64px)]">Ask Ferri something.</h2>
                <p className="mt-4 max-w-[560px] text-[17px] leading-relaxed text-white/85">
                  It runs live for Lantern Build Night, a made-up event. Try “@ferri when does hacking start?”, then ask something it can&apos;t know and watch it ask the crew.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <a href={DISCORD} className="btn h-12 border-0 bg-white px-6 text-[15.5px] text-zinc-900 hover:bg-zinc-50">
                    <PlatformLogo platform="discord" size={18} /> Discord
                  </a>
                  <a href={TELEGRAM} className="btn h-12 border-0 bg-white px-6 text-[15.5px] text-zinc-900 hover:bg-zinc-50">
                    <PlatformLogo platform="telegram" size={18} /> Telegram
                  </a>
                  <Link href="/login" className="btn h-12 border-white/40 bg-transparent px-6 text-[15.5px] text-white hover:bg-white/10" style={{ boxShadow: "none" }}>
                    Look around the Desk <ArrowRight size={17} aria-hidden />
                  </Link>
                </div>
              </div>
              <div className="hidden lg:block">
                <Ferri pose="party" size={240} alive decorative />
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-[1160px] flex-col items-center justify-between gap-4 border-t border-zinc-200 px-5 py-8 text-[13.5px] text-zinc-500 sm:flex-row sm:px-8">
        <span className="flex items-center gap-2">
          <FerriAvatar size={24} /> Ferri, built on Switch. Open source.
        </span>
        <span className="flex gap-5">
          <a href={GITHUB} className="hover:text-zinc-900">
            GitHub
          </a>
          <a href="https://github.com/sandbox-quantum/switch" className="hover:text-zinc-900">
            Switch
          </a>
          <Link href="/login" className="hover:text-zinc-900">
            Desk
          </Link>
          <Link href="/m" className="hover:text-zinc-900">
            Pocket
          </Link>
        </span>
      </footer>
    </div>
  );
}
