"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, BookmarkCheck, CheckCircle2, Lock, RotateCcw, Search, ShieldAlert, Smartphone, Sparkles, Users } from "lucide-react";
import { FerriAvatar } from "@/components/ferri";
import { PlatformLogo } from "@/components/platform";
import { decide, NOTES, SUGGESTIONS, words, type Learned } from "./playground-kb";

/**
 * The hero's live playground. A visitor asks Ferri about the demo event as a member,
 * on the chat app of their choice; the right side shows the crew room: what Ferri
 * looked up, and, when it doesn't know, the one card the crew answers. The visitor
 * answers it as the crew, and Ferri carries the answer back and remembers it.
 */

type App = "discord" | "telegram" | "slack" | "whatsapp";
const APPS: { key: App; name: string; room: string; style: "rows" | "bubbles" }[] = [
  { key: "discord", name: "Discord", room: "# build-night", style: "rows" },
  { key: "telegram", name: "Telegram", room: "Lantern Build Night", style: "bubbles" },
  { key: "slack", name: "Slack", room: "# build-night", style: "rows" },
  { key: "whatsapp", name: "WhatsApp", room: "Build Night group", style: "bubbles" },
];
const OTHER_APP: Record<App, string> = { discord: "Telegram", telegram: "Discord", slack: "WhatsApp", whatsapp: "Slack" };

// Ferri's real holding reply (HOLDING_REPLY in packages/knowledge/src/answer.ts).
const HOLD = "I don't have that yet. I'm checking with the team.";

type Msg = { id: number; who: string; you?: boolean; ferri?: boolean; text: string; source?: string; blocked?: string; typing?: boolean };
type Step = { id: number; icon: "read" | "search" | "found" | "done" | "shield" | "card" | "people" | "saved" | "phone"; text: string; tone?: "ok" | "warn" | "bad" };
type Card = { id: number; q: string; owner: string; topic: string; waiting: string[]; state: "open" | "sent"; answer?: string };

const ICONS = { read: Sparkles, search: Search, found: BookmarkCheck, done: CheckCircle2, shield: ShieldAlert, card: Lock, people: Users, saved: BookmarkCheck, phone: Smartphone };

let uid = 100;
const next = () => ++uid;

const firstNote = NOTES.find((n) => n.id === "start")!;
const START_MSGS: Msg[] = [
  { id: 1, who: "Meera", text: "@ferri when does hacking start?" },
  { id: 2, who: "Ferri", ferri: true, text: firstNote.answer, source: `Source: ${firstNote.source}` },
];
const START_STEPS: Step[] = [
  { id: 1, icon: "search", text: "Meera asked on Discord. Searched the event's 20 notes." },
  { id: 2, icon: "found", text: `Found it in ${firstNote.found}.` },
  { id: 3, icon: "done", text: "Answered in 1.1 s with its source. Nobody on the crew was pinged.", tone: "ok" },
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function suggestAnswer(q: string) {
  const t = q.toLowerCase();
  if (/\b(dogs?|pets?)\b/.test(t)) return "Yes, well-behaved dogs are welcome. Keep them on a lead and out of the quiet room.";
  if (/\bcats?\b/.test(t)) return "Sorry, only dogs on a lead. A busy hacking room is no fun for a cat.";
  if (/\b(park|parking|bikes?|cars?)\b/.test(t)) return "Yes, there's free bike parking in the basement. Cars should use the paid lot next door.";
  if (/certificate/.test(t)) return "Yes, every participant gets a certificate by email after the event.";
  if (/t.?shirt|merch|\bsizes?\b/.test(t)) return "Yes, everyone gets a T-shirt at check-in. Sizes S to XXL.";
  if (/\b(friends?|plus.?one)\b/.test(t)) return "Yes, if they register too. Registration is open until 18 November.";
  if (/\b(kids?|child|children)\b/.test(t)) return "Build Night is for 18 and over, so kids can't join this time.";
  if (/wheelchair|accessib|\blift\b|elevator/.test(t)) return "Yes. There's a lift to every floor and step-free entry next to the blue bakery.";
  if (/shower|locker/.test(t)) return "There are no showers, but there are free lockers next to the quiet room.";
  if (/record|stream|photo/.test(t)) return "Yes, the opening talk and the demos are recorded and shared after the event.";
  if (/alcohol|beer|smok/.test(t)) return "No alcohol at the venue. Smoking is fine outside, away from the entrance.";
  if (/refund|transfer/.test(t)) return "Registration is free, so there's nothing to refund. To pass your spot on, email hello@lanternlabs.example.";
  return "Yes, that's fine. Ask at the front desk on the 3rd floor if you need anything.";
}

export function Playground() {
  const [app, setApp] = useState<App>("discord");
  const [msgs, setMsgs] = useState<Msg[]>(START_MSGS);
  const [steps, setSteps] = useState<Step[]>(START_STEPS);
  const [cards, setCards] = useState<Card[]>([]);
  const [learned, setLearned] = useState<Learned[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [tried, setTried] = useState<string | null>(null);
  const chat = useRef<HTMLDivElement>(null);
  const crew = useRef<HTMLDivElement>(null);
  const a = APPS.find((x) => x.key === app)!;

  useEffect(() => {
    const el = chat.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [msgs]);
  useEffect(() => {
    const el = crew.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [steps, cards]);

  const step = (s: Omit<Step, "id">) => setSteps((x) => [...x.slice(-7), { ...s, id: next() }]);
  const say = (m: Omit<Msg, "id">) => {
    const id = next();
    setMsgs((x) => [...x.filter((y) => !y.typing).slice(-11), { ...m, id }]);
    return id;
  };
  const typing = () => setMsgs((x) => [...x, { id: next(), who: "Ferri", ferri: true, text: "", typing: true }]);

  async function ask(raw: string) {
    const q = raw.trim();
    if (!q || busy) return;
    setBusy(true);
    setText("");
    const mine = say({ who: "You", you: true, text: q });
    const v = decide(q, learned);
    await wait(350);

    if (v.kind === "shield") {
      step({ icon: "shield", text: `Shield checked your message: ${v.reason}.`, tone: "bad" });
      await wait(450);
      setMsgs((x) => x.map((m) => (m.id === mine ? { ...m, blocked: v.reason } : m)));
      step({ icon: "done", text: "Hidden before anyone could click it, in 4 ms. The crew was told.", tone: "ok" });
      setBusy(false);
      return;
    }
    if (v.kind === "greeting") {
      typing();
      await wait(800);
      say({ who: "Ferri", ferri: true, text: "Hi! I'm Ferri. Ask me anything about Lantern Build Night: the schedule, food, Wi-Fi, the venue, teams or prizes." });
      step({ icon: "done", text: "Said hello. Ferri only answers event questions from its notes.", tone: "ok" });
      setBusy(false);
      return;
    }
    if (v.kind === "quiet") {
      step({ icon: "done", text: "Nothing to answer here, so Ferri stayed quiet. Nobody on the crew was pinged.", tone: "ok" });
      setBusy(false);
      return;
    }

    step({ icon: "search", text: `You asked on ${a.name}. Searched the event's 20 notes${learned.length ? ` and ${learned.length} crew answer${learned.length > 1 ? "s" : ""}` : ""}.` });
    typing();
    await wait(700);

    if (v.kind === "known" || v.kind === "learned") {
      const found = v.kind === "known" ? `Found it in ${v.note.found}.` : `Found what ${v.learned.by} taught me earlier.`;
      step({ icon: "found", text: found });
      await wait(450);
      const answer = v.kind === "known" ? v.note.answer : v.learned.answer;
      const source = v.kind === "known" ? v.note.source : `Build Night crew answers (${v.learned.q})`;
      say({ who: "Ferri", ferri: true, text: answer, source: `Source: ${source}` });
      const secs = (0.9 + Math.random() * 0.6).toFixed(1);
      step({ icon: "done", text: `Answered in ${secs} s with its source. Nobody on the crew was pinged.`, tone: "ok" });
      if (v.kind === "learned") setTried(null);
      setBusy(false);
      return;
    }

    // Unknown: never guess. Hold, open one card for the topic's owner, collect the others who ask.
    step({ icon: "search", text: "Nothing in the notes answers this. Ferri won't guess.", tone: "warn" });
    await wait(400);
    say({ who: "Ferri", ferri: true, text: HOLD });
    const short = q.replace(/@ferri/gi, "").trim().replace(/^./, (c) => c.toUpperCase());
    const id = next();
    setCards((x) => [...x.filter((c) => c.state === "open").slice(-1), { id, q: short, owner: v.owner, topic: v.topic, waiting: [`you on ${a.name}`], state: "open" }]);
    setDrafts((d) => ({ ...d, [id]: suggestAnswer(q) }));
    step({ icon: "card", text: `Opened one card in the crew room for ${v.owner} (${v.topic}).` });
    await wait(700);
    step({ icon: "phone", text: `${v.owner}'s phone buzzed through Ferri Pocket.` });
    setBusy(false);
    await wait(1500);
    setCards((x) => x.map((c) => (c.id === id ? { ...c, waiting: [...c.waiting, `Arjun on ${OTHER_APP[app]}`] } : c)));
    step({ icon: "people", text: `Arjun asked the same thing on ${OTHER_APP[app]}. He joined the same card, so the crew answers once.` });
  }

  async function answer(card: Card) {
    const reply = (drafts[card.id] ?? "").trim();
    if (!reply) return;
    setCards((x) => x.map((c) => (c.id === card.id ? { ...c, state: "sent", answer: reply } : c)));
    step({ icon: "done", text: `${card.owner} answered on the card.`, tone: "ok" });
    typing();
    await wait(900);
    say({ who: "Ferri", ferri: true, text: `@you ${reply}`, source: `Source: Build Night crew answers (${card.q})` });
    step({ icon: "people", text: `Sent to ${card.waiting.length} ${card.waiting.length > 1 ? "people" : "person"}: ${card.waiting.join(", ")}.`, tone: "ok" });
    await wait(500);
    setLearned((l) => [...l, { q: card.q, words: words(card.q), answer: reply, by: card.owner }]);
    step({ icon: "saved", text: "Saved to the event's knowledge. Next time, nobody gets pinged.", tone: "ok" });
    setTried(card.q);
  }

  function reset() {
    setMsgs(START_MSGS);
    setSteps(START_STEPS);
    setCards([]);
    setLearned([]);
    setTried(null);
    setBusy(false);
  }

  return (
    <div className="pg relative overflow-hidden rounded-[26px] border border-zinc-200 bg-white text-left shadow-[0_40px_120px_-50px_rgba(20,60,60,0.55)]">
      {/* Window chrome */}
      <div className="flex items-center gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </span>
        <span className="min-w-0 flex-1 truncate text-center text-[12.5px] font-medium text-zinc-500">Lantern Build Night, a demo hackathon</span>
        <button type="button" onClick={reset} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">
          <RotateCcw size={12} aria-hidden /> Reset
        </button>
      </div>

      <div className="grid lg:grid-cols-[1.12fr_0.88fr]">
        {/* The community side */}
        <section aria-label="The community chat" className="flex min-w-0 flex-col border-zinc-200 lg:border-r">
          <div className="flex items-center gap-1 overflow-x-auto border-b border-zinc-200 px-2 py-1.5" role="tablist" aria-label="Chat app">
            {APPS.map((x) => (
              <button
                key={x.key}
                type="button"
                role="tab"
                aria-selected={x.key === app}
                onClick={() => setApp(x.key)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition ${
                  x.key === app ? "bg-zinc-900 text-[var(--paper)]" : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                <PlatformLogo platform={x.key} size={14} />
                {x.name}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 px-4 pt-3 pb-1 text-[12px] text-zinc-500">
            <PlatformLogo platform={app} size={14} />
            <span className="font-semibold text-zinc-800">{a.room}</span>
            <span>142 members, Ferri in Auto mode</span>
          </div>

          <div ref={chat} className={`h-[320px] space-y-3 overflow-y-auto px-4 py-3 sm:h-[350px] ${a.style === "bubbles" ? "pg-bubbles" : ""}`} role="log" aria-live="polite" aria-label="Messages">
            {msgs.map((m) => (a.style === "rows" ? <Row key={m.id} m={m} app={app} /> : <Bubble key={m.id} m={m} />))}
          </div>

          <div className="border-t border-zinc-200 px-3 pt-2.5 pb-3">
            <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5">
              {(tried ? [{ label: `Ask again: ${tried}`, text: `@ferri ${tried.toLowerCase()}`, hint: "Ferri learned it" }, ...SUGGESTIONS.slice(0, 2)] : SUGGESTIONS).map((s) => (
                <button
                  key={s.label}
                  type="button"
                  disabled={busy}
                  onClick={() => ask(s.text)}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium transition disabled:opacity-50 ${
                    "hint" in s && s.hint === "Ferri learned it" ? "border-brand bg-brand-soft text-brand-ink" : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
                  }`}
                  title={"hint" in s ? s.hint : undefined}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                ask(text);
              }}
              className="flex items-center gap-2 rounded-[14px] border border-zinc-200 bg-zinc-50 py-1.5 pr-1.5 pl-3 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand-soft"
            >
              <label htmlFor="ferri-ask-input" className="sr-only">
                Ask Ferri a question about Lantern Build Night
              </label>
              <input
                id="ferri-ask-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={`Message ${a.room} as a member…`}
                autoComplete="off"
                maxLength={200}
                className="min-w-0 flex-1 bg-transparent text-[16px] text-zinc-900 outline-none placeholder:text-zinc-400 focus-visible:outline-none sm:text-[14.5px]"
              />
              <button type="submit" disabled={busy || !text.trim()} aria-label="Send" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-brand text-white transition disabled:opacity-40">
                <ArrowUp size={16} aria-hidden />
              </button>
            </form>
          </div>
        </section>

        {/* The crew side */}
        <section aria-label="The crew room" className="flex min-w-0 flex-col border-t border-zinc-200 bg-zinc-50 lg:border-t-0">
          <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-2.5 text-[12.5px]">
            <Lock size={13} className="text-zinc-500" aria-hidden />
            <span className="font-semibold text-zinc-800">ferri-crew</span>
            <span className="text-zinc-500">private crew room</span>
            <span className="ml-auto inline-flex items-center gap-1.5 text-[11.5px] font-medium text-emerald-700">
              <span className="pg-live h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live
            </span>
          </div>
          <div ref={crew} className="h-[300px] space-y-2.5 overflow-y-auto px-4 py-3 sm:h-[340px] lg:h-auto lg:flex-1">
            <ol className="space-y-2" aria-label="What Ferri did" aria-live="polite">
              {steps.map((s) => {
                const Icon = ICONS[s.icon];
                return (
                  <li key={s.id} className="hiw-pop flex items-start gap-2 text-[12.5px] leading-snug text-zinc-700">
                    <span
                      className={`mt-px inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                        s.tone === "ok" ? "bg-emerald-100 text-emerald-700" : s.tone === "bad" ? "bg-red-100 text-red-700" : s.tone === "warn" ? "bg-amber-100 text-amber-800" : "bg-white text-zinc-500 shadow-[0_0_0_1px_var(--n-200)]"
                      }`}
                    >
                      <Icon size={11} aria-hidden />
                    </span>
                    <span>{s.text}</span>
                  </li>
                );
              })}
            </ol>
            {!cards.length ? (
              <div className="rounded-[14px] border border-dashed border-zinc-300 px-3 py-3 text-[12.5px] leading-snug text-zinc-500">
                Quiet. Ferri only pings the crew when it has to. Ask something it can&apos;t know, like{" "}
                <span className="font-medium text-zinc-700">“can I bring my dog?”</span>, and the card lands here for you to answer.
              </div>
            ) : null}
            {cards.map((c) => (
              <div key={c.id} className={`hiw-pop rounded-[16px] border bg-white p-3 shadow-[var(--shadow-card)] ${c.state === "sent" ? "border-emerald-200" : "border-brand-line"}`}>
                <div className="flex items-center gap-2">
                  <FerriAvatar size={22} />
                  <span className="text-[11.5px] font-medium text-zinc-500">Ferri asks {c.owner}</span>
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${c.state === "sent" ? "bg-emerald-50 text-emerald-700" : "bg-accent-soft text-zinc-800"}`}>
                    {c.state === "sent" ? "Answered" : `${c.waiting.length} waiting`}
                  </span>
                </div>
                <div className="mt-1.5 text-[14px] font-semibold text-zinc-900">{c.q}</div>
                <div className="mt-0.5 text-[11.5px] text-zinc-500">Waiting: {c.waiting.join(", ")}</div>
                {c.state === "open" ? (
                  <form
                    className="mt-2.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      answer(c);
                    }}
                  >
                    <label htmlFor={`card-${c.id}`} className="mb-1 block text-[11.5px] font-medium text-brand-ink">
                      You&apos;re the crew now. Answer once:
                    </label>
                    <textarea
                      id={`card-${c.id}`}
                      rows={2}
                      value={drafts[c.id] ?? ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                      className="w-full resize-none rounded-[10px] border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-[13px] leading-snug text-zinc-900 outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft"
                    />
                    <button type="submit" className="btn-primary mt-2 h-8 w-full text-[12.5px]">
                      Send to everyone waiting
                    </button>
                  </form>
                ) : (
                  <div className="mt-2 rounded-[10px] bg-emerald-50 px-2.5 py-1.5 text-[12.5px] text-emerald-800">{c.answer}</div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Source({ s }: { s?: string }) {
  return s ? <div className="mt-1 text-[11.5px] text-zinc-500">{s}</div> : null;
}

function Typing() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="Ferri is typing">
      <span className="pg-dot h-1.5 w-1.5 rounded-full bg-zinc-400" />
      <span className="pg-dot h-1.5 w-1.5 rounded-full bg-zinc-400 [animation-delay:150ms]" />
      <span className="pg-dot h-1.5 w-1.5 rounded-full bg-zinc-400 [animation-delay:300ms]" />
    </span>
  );
}

function Blocked({ reason }: { reason: string }) {
  return (
    <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
      <ShieldAlert size={12} aria-hidden /> Hidden by Shield: {reason}
    </div>
  );
}

/** Discord and Slack: flat rows with an avatar and a name. */
function Row({ m, app }: { m: Msg; app: App }) {
  return (
    <div className="hiw-pop flex items-start gap-2.5">
      {m.ferri ? (
        <FerriAvatar size={34} />
      ) : (
        <span className={`inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${m.you ? "bg-brand-soft text-brand-ink" : "bg-accent-soft text-zinc-800"}`}>
          {m.who.charAt(0)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[13px]">
          <span className={`font-semibold ${m.ferri ? "text-brand-ink" : "text-zinc-900"}`}>{m.who}</span>
          {m.ferri ? <span className="rounded bg-[#5865f2] px-1 text-[9.5px] leading-[15px] font-bold text-white">{app === "slack" ? "APP" : "BOT"}</span> : null}
        </div>
        {m.typing ? (
          <Typing />
        ) : (
          <div className={`text-[14px] leading-snug ${m.blocked ? "text-zinc-400 line-through" : "text-zinc-800"}`}>{m.text}</div>
        )}
        {m.blocked ? <Blocked reason={m.blocked} /> : null}
        <Source s={m.source} />
      </div>
    </div>
  );
}

/** Telegram and WhatsApp: bubbles, yours on the right. */
function Bubble({ m }: { m: Msg }) {
  return (
    <div className={`hiw-pop flex ${m.you ? "justify-end" : "justify-start"} items-end gap-1.5`}>
      {m.ferri ? <FerriAvatar size={26} /> : null}
      <div
        className={`max-w-[82%] rounded-[16px] px-3 py-2 shadow-[0_1px_0_var(--n-200)] ${
          m.you ? "rounded-br-[5px] bg-brand-soft" : "rounded-bl-[5px] bg-white"
        }`}
      >
        {!m.you ? <div className={`text-[12px] font-semibold ${m.ferri ? "text-brand-ink" : "text-[#c2410c]"}`}>{m.who}</div> : null}
        {m.typing ? <Typing /> : <div className={`text-[14px] leading-snug ${m.blocked ? "text-zinc-400 line-through" : "text-zinc-900"}`}>{m.text}</div>}
        {m.blocked ? <Blocked reason={m.blocked} /> : null}
        <Source s={m.source} />
      </div>
    </div>
  );
}
