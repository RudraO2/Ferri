"use client";

import { useState } from "react";
import { CalendarCheck, Check, Flag, Hammer, Megaphone, Radio } from "lucide-react";
import { Art } from "@/components/ferri";

const STAGES = [
  {
    icon: CalendarCheck,
    name: "Plan",
    when: "Weeks before",
    title: "Crew chatter becomes a plan.",
    line: "Ferri follows the crew's own chat and keeps a living plan: what's decided, who owns what, what's still open. Owners it hears about take over the questions on their topic.",
    say: "@ferri draft the agenda",
    gets: ["A run of show, plus one approval card per key decision", "“Priya will handle food” sends every food question to Priya", "Reminders: “@ferri remind me at 5 to order the pizza”"],
    art: "stage-plan",
  },
  {
    icon: Hammer,
    name: "Build",
    when: "The week before",
    title: "The Builder ships what you'd stay up making.",
    line: "Ferri Builder is a coding agent that Switch runs on your machine, with its own budget. It builds the event site, posters in six sizes and the Luma listing, and asks before anything goes public.",
    say: "@ferri get the builder to make a site for Build Night",
    gets: ["A live event site, deployed for you", "Posters with a QR code that is checked to scan", "The Luma listing filled in, submitted only after your OK"],
    art: "stage-build",
  },
  {
    icon: Megaphone,
    name: "Launch",
    when: "Days before",
    title: "One announcement, every app, one OK.",
    line: "Say it once in the crew room. Ferri drafts it, shows every group it will reach, and posts it everywhere after one tap. Plans change? It edits the posts in place.",
    say: "@ferri tell everyone lunch moves to 1:30",
    gets: ["Posted to Discord, Telegram, Slack, WhatsApp and Mattermost", "Edited in place, never a confusing second post", "Translated for groups that speak another language"],
    art: "stage-launch",
  },
  {
    icon: Radio,
    name: "Live",
    when: "On the day",
    title: "Answers with sources. Help for anyone stuck.",
    line: "Ferri answers on every app from your event's info, asks the crew only what it doesn't know, notices people who are stuck or upset, and blocks scam links before anyone clicks.",
    say: "does anyone know the wifi password?",
    by: "attendee",
    gets: ["Sourced answers in about a second", "Care cases with an owner for members who need a person", "Shield on every message, in 2 to 9 ms"],
    art: "stage-live",
  },
  {
    icon: Flag,
    name: "Wrap",
    when: "The day after",
    title: "A recap with real numbers. A head start for next time.",
    line: "Ferri counts what actually happened, drafts the thank-you, saves your partners and builds a starter kit, so the next event starts from everything this one learned.",
    say: "@ferri how did build night go?",
    gets: ["Questions answered, cards, care cases, top topics", "Partners and contacts saved for next time", "A starter kit with the knowledge your crew taught"],
    art: "stage-wrap",
  },
];

export function Stages() {
  const [i, setI] = useState(3);
  const s = STAGES[i]!;
  return (
    <div>
      <div className="relative mb-6 overflow-x-auto pb-1" role="tablist" aria-label="Stages of an event">
        <div className="flex min-w-max gap-2 sm:grid sm:min-w-0 sm:grid-cols-5">
          {STAGES.map((x, k) => {
            const on = k === i;
            return (
              <button
                key={x.name}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls="stage-panel"
                onClick={() => setI(k)}
                className={`group flex items-center gap-2.5 rounded-[18px] border px-4 py-3 text-left transition ${
                  on ? "border-brand bg-white shadow-[var(--shadow-card)]" : "border-zinc-200 bg-white/50 hover:bg-white"
                }`}
              >
                <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${on ? "bg-brand text-white" : "bg-zinc-100 text-zinc-500"}`}>
                  <x.icon size={15} aria-hidden />
                </span>
                <span className="leading-tight">
                  <span className="block text-[15px] font-semibold text-zinc-900">{x.name}</span>
                  <span className="block text-[12px] text-zinc-500">{x.when}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div id="stage-panel" role="tabpanel" key={s.name} className="hiw-pop grid items-center gap-8 rounded-[28px] border border-zinc-200 bg-white p-6 sm:p-10 lg:grid-cols-[1fr_300px]">
        <div>
          <h3 className="display text-[clamp(26px,3.2vw,38px)] text-zinc-900">{s.title}</h3>
          <p className="mt-4 max-w-[600px] text-[16.5px] leading-relaxed text-zinc-600">{s.line}</p>
          <div className="mt-6 inline-flex max-w-full items-center gap-2 rounded-[14px] border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 font-mono text-[13.5px] text-zinc-800">
            <span className="shrink-0 text-zinc-400" aria-hidden>
              {"by" in s ? s.by : "crew"}
            </span>
            <span className="truncate">{s.say}</span>
          </div>
          <ul className="mt-6 space-y-2.5">
            {s.gets.map((g) => (
              <li key={g} className="flex items-start gap-2.5 text-[15px] text-zinc-700">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-ink">
                  <Check size={12} aria-hidden />
                </span>
                {g}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-center rounded-[24px] bg-brand-soft/60 p-4">
          <Art name={s.art} width={280} height={280} className="w-[220px] sm:w-[260px]" />
        </div>
      </div>
    </div>
  );
}
