"use client";

import { useEffect, useRef, useState } from "react";
import { BookmarkCheck, Check, Megaphone, Pencil, ShieldCheck, Users } from "lucide-react";
import { Ferri, FerriAvatar, type Pose } from "@/components/ferri";
import { PlatformLogo } from "@/components/platform";

/**
 * The landing page's story of how Ferri works, in four beats:
 *  1. two members ask on Telegram and Slack, Ferri asks the crew once, one answer reaches both;
 *  2. the answer is saved, so the next asker gets it at once with its source;
 *  3. a crew decision becomes an announcement on every app, then is edited in place;
 *  4. Shield blocks a scam link.
 * Plays while on screen; a beat button restarts that beat. With reduced motion it shows
 * each beat's end state, and the beat buttons step through it.
 */

type Msg = { who: string; text: string; ferri?: boolean; source?: string; edited?: boolean; blocked?: boolean; fresh?: boolean };
type Rows = Record<string, Msg[]>;
type Crew = { lines: { who: string; text: string }[]; card?: { title: string; meta: string; state: "open" | "done"; action: string } ; note?: string };
type Frame = { rows: Rows; crew: Crew; status: string; pose: Pose; fly?: "out" | "back"; chip?: string };

const APPS = [
  { key: "discord", name: "Discord", space: "#build-night" },
  { key: "telegram", name: "Telegram", space: "Lantern Build Night" },
  { key: "slack", name: "Slack", space: "#build-night" },
  { key: "whatsapp", name: "WhatsApp", space: "Build Night group" },
  { key: "mattermost", name: "Mattermost", space: "ferri-lab" },
] as const;

const Q1 = { who: "Priya", text: "@ferri can we bring our own monitor?" };
const Q2 = { who: "Arjun", text: "@ferri are monitors allowed at the venue?" };
// Ferri's real holding reply (HOLDING_REPLY in packages/knowledge/src/answer.ts).
const HOLD: Msg = { who: "Ferri", text: "I don't have that yet. I'm checking with the team.", ferri: true };
const ANSWER = "Yes, bring it. There are power strips at every table.";
const LUNCH1 = "Lunch is at 1:00 PM today, on the 3rd floor.";
const LUNCH2 = "Lunch moves to 1:30 PM today, on the 3rd floor.";
const all = (m: Msg): Rows => Object.fromEntries(APPS.map((a) => [a.key, [m]]));

const BEATS: { title: string; line: string; icon: typeof Users; frames: Frame[] }[] = [
  {
    title: "Ask once",
    line: "Two people ask on two apps. Ferri asks the crew once, and one answer reaches both.",
    icon: Users,
    frames: [
      { rows: { telegram: [Q1] }, crew: { lines: [] }, status: "Listening on every app.", pose: "main" },
      { rows: { telegram: [Q1], slack: [Q2] }, crew: { lines: [] }, status: "Same question, two apps.", pose: "thinking" },
      { rows: { telegram: [Q1, HOLD], slack: [Q2, HOLD] }, crew: { lines: [] }, status: "Not in my notes. I'll ask the crew once.", pose: "thinking" },
      {
        rows: { telegram: [Q1, HOLD], slack: [Q2, HOLD] },
        crew: { lines: [], card: { title: "Can we bring our own monitor?", meta: "2 people waiting · Telegram, Slack", state: "open", action: "Answer" } },
        status: "Card sent to the crew room.",
        pose: "carry",
        fly: "out",
      },
      {
        rows: { telegram: [Q1, HOLD], slack: [Q2, HOLD] },
        crew: { lines: [{ who: "Sam", text: ANSWER }], card: { title: "Can we bring our own monitor?", meta: "Answered by Sam", state: "done", action: "Answered" } },
        status: "Sam answered. Carrying it back.",
        pose: "carry",
        fly: "back",
      },
      {
        rows: {
          telegram: [Q1, { who: "Ferri", text: ANSWER, ferri: true, source: "Source: Build Night crew answers (Bringing a monitor)", fresh: true }],
          slack: [Q2, { who: "Ferri", text: ANSWER, ferri: true, source: "Source: Build Night crew answers (Bringing a monitor)", fresh: true }],
        },
        crew: { lines: [{ who: "Sam", text: ANSWER }], card: { title: "Can we bring our own monitor?", meta: "Sent to 2 people", state: "done", action: "Answered" } },
        status: "Both answered at once.",
        pose: "party",
      },
    ],
  },
  {
    title: "Learns it",
    line: "The answer is saved. The next person gets it at once, with its source, and nobody is pinged.",
    icon: BookmarkCheck,
    frames: [
      { rows: {}, crew: { lines: [], note: "Saved to knowledge: “Bringing a monitor”" }, status: "Saved for next time.", pose: "main", chip: "Bringing a monitor" },
      { rows: { discord: [{ who: "Meera", text: "@ferri is it ok to bring a monitor?" }] }, crew: { lines: [], note: "Saved to knowledge: “Bringing a monitor”" }, status: "I know this one now.", pose: "main", chip: "Bringing a monitor" },
      {
        rows: { discord: [{ who: "Meera", text: "@ferri is it ok to bring a monitor?" }, { who: "Ferri", text: ANSWER, ferri: true, source: "Source: Build Night crew answers (Bringing a monitor)", fresh: true }] },
        crew: { lines: [], note: "Nobody was pinged." },
        status: "Answered in 1.2 s, with its source.",
        pose: "party",
        chip: "Bringing a monitor",
      },
    ],
  },
  {
    title: "Tells everyone",
    line: "A crew decision becomes one announcement on every app, and an edit updates it in place.",
    icon: Megaphone,
    frames: [
      { rows: {}, crew: { lines: [{ who: "Sam", text: "lunch is at 1 btw" }] }, status: "That sounds like news for everyone.", pose: "thinking" },
      {
        rows: {},
        crew: { lines: [{ who: "Sam", text: "lunch is at 1 btw" }], card: { title: "Announce on 5 apps?", meta: LUNCH1, state: "open", action: "Approve" } },
        status: "Asking before I post.",
        pose: "announce",
      },
      {
        rows: all({ who: "Ferri", text: LUNCH1, ferri: true, fresh: true }),
        crew: { lines: [{ who: "Sam", text: "lunch is at 1 btw" }], card: { title: "Announce on 5 apps?", meta: "Posted on 5 apps", state: "done", action: "Approved" } },
        status: "Posted everywhere.",
        pose: "announce",
      },
      {
        rows: all({ who: "Ferri", text: LUNCH1, ferri: true }),
        crew: { lines: [{ who: "Sam", text: "actually make it 1:30" }], card: { title: "Edit the announcement?", meta: LUNCH2, state: "open", action: "Approve" } },
        status: "Plans changed.",
        pose: "thinking",
      },
      {
        rows: all({ who: "Ferri", text: LUNCH2, ferri: true, edited: true, fresh: true }),
        crew: { lines: [{ who: "Sam", text: "actually make it 1:30" }], card: { title: "Edit the announcement?", meta: "Edited on 5 apps", state: "done", action: "Approved" } },
        status: "Edited in place. No second post.",
        pose: "party",
      },
    ],
  },
  {
    title: "Keeps it safe",
    line: "Shield checks every message. A scam link is blocked before anyone clicks it, and the crew hears about it.",
    icon: ShieldCheck,
    frames: [
      { rows: { whatsapp: [{ who: "unknown", text: "free nitro for hackers 👉 disc0rd-gift.xyz" }] }, crew: { lines: [] }, status: "Checking every message.", pose: "shield" },
      {
        rows: { whatsapp: [{ who: "unknown", text: "free nitro for hackers 👉 disc0rd-gift.xyz", blocked: true }] },
        crew: { lines: [], note: "Shield blocked a lookalike link in WhatsApp." },
        status: "Blocked a lookalike link.",
        pose: "shield",
      },
    ],
  },
];

const STEP_MS = 1900;
const HOLD_MS = 3200;

export function HowItWorks() {
  const [beat, setBeat] = useState(0);
  const [frame, setFrame] = useState(0);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const set = () => setReduced(mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // Reduced motion: each beat's end state, no autoplay.
  useEffect(() => {
    if (reduced) setFrame(BEATS[beat]!.frames.length - 1);
  }, [reduced, beat]);
  useEffect(() => {
    if (reduced || !visible) return;
    const last = BEATS[beat]!.frames.length - 1;
    const t = setTimeout(
      () => {
        if (frame < last) setFrame(frame + 1);
        else {
          setBeat((beat + 1) % BEATS.length);
          setFrame(0);
        }
      },
      frame < last ? STEP_MS : HOLD_MS,
    );
    return () => clearTimeout(t);
  }, [beat, frame, visible, reduced]);

  const b = BEATS[beat]!;
  const f = b.frames[Math.min(frame, b.frames.length - 1)]!;

  return (
    <div ref={ref}>
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist" aria-label="How Ferri works">
        {BEATS.map((x, i) => {
          const Icon = x.icon;
          const on = i === beat;
          return (
            <button
              key={x.title}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => {
                setBeat(i);
                setFrame(reduced ? x.frames.length - 1 : 0);
              }}
              className={`relative overflow-hidden rounded-[16px] border px-4 py-3 text-left transition ${
                on ? "border-brand bg-white shadow-[var(--shadow-card)]" : "border-zinc-200 bg-white/50 hover:bg-white"
              }`}
            >
              <span className="flex items-center gap-2 text-[14px] font-semibold text-zinc-900">
                <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] ${on ? "bg-brand text-white" : "bg-zinc-100 text-zinc-500"}`}>{i + 1}</span>
                {x.title}
                <Icon size={15} className={on ? "ml-auto text-brand" : "ml-auto text-zinc-400"} aria-hidden />
              </span>
              {on && !reduced ? (
                <span
                  key={`${beat}-${visible}-${frame === 0}`}
                  className="absolute bottom-0 left-0 h-[3px] bg-brand"
                  style={{
                    animation: visible ? `hiw-progress ${(b.frames.length - 1) * STEP_MS + HOLD_MS}ms linear forwards` : undefined,
                    width: visible ? undefined : "0%",
                  }}
                  aria-hidden
                />
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="mb-5 text-[16px] leading-relaxed text-zinc-600" aria-live="polite">
        {b.line}
      </p>

      <div className="relative grid gap-4 rounded-[28px] border border-zinc-200 bg-white/70 p-3 sm:p-5 lg:grid-cols-[1fr_200px_1fr] lg:gap-6">
        {/* The community, on five apps */}
        <div className="space-y-2.5">
          <div className="px-1 text-[11px] font-semibold tracking-[0.1em] text-zinc-500 uppercase">The community, on five apps</div>
          {APPS.map((a) => {
            const msgs = f.rows[a.key] ?? [];
            return (
              <div key={a.key} className="rounded-[16px] border border-zinc-200 bg-white px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[11.5px] text-zinc-500">
                  <PlatformLogo platform={a.key} size={13} />
                  <span className="font-medium text-zinc-700">{a.name}</span>
                  <span className="truncate">· {a.space}</span>
                </div>
                <div className="mt-1.5 min-h-[38px] space-y-1.5">
                  {msgs.length ? (
                    msgs.map((m, i) => <Bubble key={`${beat}-${a.key}-${i}-${m.text}`} m={m} />)
                  ) : (
                    <div className="h-[30px] rounded-[10px] border border-dashed border-zinc-200" aria-hidden />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Ferri, between them */}
        <div className="flex flex-col items-center justify-center gap-3 py-2 text-center">
          <Ferri pose={f.pose} size={150} alive decorative />
          <div key={`${beat}-${frame}`} className="hiw-pop max-w-[220px] rounded-[16px] bg-brand px-3.5 py-2 text-[13px] leading-snug font-medium text-white shadow-[inset_0_-3px_0_var(--brand-lip)]">
            {f.status}
          </div>
          {f.chip ? (
            <div className="hiw-pop inline-flex items-center gap-1.5 rounded-full border border-brand-line bg-brand-soft px-3 py-1 text-[12px] font-medium text-brand-ink">
              <BookmarkCheck size={13} aria-hidden /> {f.chip}
            </div>
          ) : null}
        </div>

        {/* The crew, inside */}
        <div className="flex flex-col">
          <div className="px-1 text-[11px] font-semibold tracking-[0.1em] text-zinc-500 uppercase">The crew, inside</div>
          <div className="mt-2.5 flex-1 rounded-[20px] border border-zinc-200 bg-zinc-50 p-3">
            <div className="mb-2 flex items-center gap-2 text-[12px] text-zinc-500">
              <PlatformLogo platform="mattermost" size={13} />
              <span className="font-medium text-zinc-700">ferri-crew</span>
              <span>· private</span>
            </div>
            <div className="space-y-2">
              {f.crew.lines.map((l, i) => (
                <div key={`${beat}-c-${i}-${l.text}`} className="hiw-pop flex items-start gap-2">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-zinc-800">{l.who.charAt(0)}</span>
                  <div className="rounded-[12px] rounded-tl-[4px] bg-white px-2.5 py-1.5 text-[12.5px] text-zinc-800 shadow-[0_1px_0_var(--n-200)]">
                    <b className="font-semibold">{l.who}</b> {l.text}
                  </div>
                </div>
              ))}
              {f.crew.card ? (
                <div key={`${beat}-card-${f.crew.card.title}`} className={`rounded-[16px] border bg-white p-3 ${f.fly === "out" ? "hiw-fly-in" : "hiw-pop"} ${f.crew.card.state === "done" ? "border-emerald-200" : "border-brand-line"}`}>
                  <div className="flex items-center gap-2">
                    <FerriAvatar size={22} pose="thinking" />
                    <span className="text-[11.5px] font-medium text-zinc-500">Ferri · card</span>
                  </div>
                  <div className="mt-1.5 text-[13.5px] font-semibold text-zinc-900">{f.crew.card.title}</div>
                  <div className="mt-0.5 text-[12px] text-zinc-500">{f.crew.card.meta}</div>
                  <div
                    className={`mt-2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-semibold ${
                      f.crew.card.state === "done" ? "bg-emerald-50 text-emerald-700" : "bg-brand text-white shadow-[inset_0_-2px_0_var(--brand-lip)]"
                    }`}
                  >
                    {f.crew.card.state === "done" ? <Check size={13} aria-hidden /> : f.crew.card.action === "Answer" ? <Pencil size={12} aria-hidden /> : null}
                    {f.crew.card.action}
                  </div>
                </div>
              ) : null}
              {f.crew.note ? (
                <div key={`${beat}-note-${f.crew.note}`} className="hiw-pop rounded-[12px] border border-dashed border-zinc-300 px-2.5 py-2 text-[12.5px] text-zinc-600">
                  {f.crew.note}
                </div>
              ) : null}
              {!f.crew.lines.length && !f.crew.card && !f.crew.note ? <div className="py-6 text-center text-[12.5px] text-zinc-400">Quiet. Ferri only pings when it has to.</div> : null}
            </div>
          </div>
        </div>

        {/* The card crossing between Ferri and the crew (wide screens) */}
        {f.fly && !reduced ? (
          <div key={`${beat}-${frame}-fly`} className={`pointer-events-none absolute top-1/2 hidden lg:block ${f.fly === "out" ? "hiw-fly-out" : "hiw-fly-back"}`} aria-hidden>
            <div className="flex items-center gap-1.5 rounded-[12px] border border-brand-line bg-white px-2.5 py-1.5 text-[12px] font-semibold text-zinc-800 shadow-[var(--shadow-pop)]">
              <span className="h-2 w-2 rounded-full bg-accent" />
              {f.fly === "out" ? "Card: monitor?" : "Answer"}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Bubble({ m }: { m: Msg }) {
  if (m.ferri) {
    return (
      <div className={`flex items-start gap-1.5 ${m.fresh ? "hiw-pop" : ""}`}>
        <FerriAvatar size={20} />
        <div className="min-w-0 rounded-[10px] rounded-tl-[3px] bg-brand-soft px-2 py-1 text-[12.5px] leading-snug text-zinc-900">
          <b className="font-semibold">Ferri</b> {m.text}
          {m.edited ? <span className="ml-1 rounded bg-accent-soft px-1 text-[10.5px] font-semibold text-zinc-700">edited</span> : null}
          {m.source ? <div className="mt-0.5 text-[11px] text-zinc-500">{m.source}</div> : null}
        </div>
      </div>
    );
  }
  return (
    <div className="hiw-pop flex items-start gap-1.5">
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-semibold text-zinc-600">{m.who.charAt(0).toUpperCase()}</span>
      <div className={`min-w-0 text-[12.5px] leading-snug ${m.blocked ? "text-zinc-400" : "text-zinc-800"}`}>
        <b className="font-semibold">{m.who}</b> <span className={m.blocked ? "line-through" : ""}>{m.text}</span>
        {m.blocked ? (
          <div className="hiw-pop mt-1 inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
            <ShieldCheck size={12} aria-hidden /> Blocked by Shield: lookalike link
          </div>
        ) : null}
      </div>
    </div>
  );
}
