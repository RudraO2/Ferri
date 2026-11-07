"use client";

import { useEffect, useState } from "react";
import { Check, Copy, MessageCircleQuestion } from "lucide-react";
import { PlatformLogo } from "@/components/platform";

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const set = () => setReduced(mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);
  return reduced;
}

/** One word that changes every couple of seconds ("hackathons", "meetups", ...). */
export function RotatingWord({ words, className = "" }: { words: string[]; className?: string }) {
  const [i, setI] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setI((x) => (x + 1) % words.length), 2200);
    return () => clearInterval(t);
  }, [reduced, words.length]);
  const longest = words.reduce((a, b) => (b.length > a.length ? b : a), "");
  return (
    <span className={`relative inline-grid align-bottom ${className}`}>
      {/* Reserves the width of the longest word so nothing around it jumps. */}
      <span className="invisible col-start-1 row-start-1" aria-hidden>
        {longest}
      </span>
      <span key={words[i]} className="rot-in col-start-1 row-start-1 text-left">
        {words[i]}
      </span>
      <span className="sr-only">{words.join(", ")}</span>
    </span>
  );
}

/** Scrolls to the playground and puts the cursor in its box. */
export function AskButton({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        document.getElementById("try")?.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => document.getElementById("ferri-ask-input")?.focus({ preventScroll: true }), 450);
      }}
    >
      {children}
    </button>
  );
}

/** A terminal line with a copy button. */
export function CopyCommand({ lines }: { lines: string[] }) {
  const [done, setDone] = useState(false);
  return (
    <div className="relative overflow-hidden rounded-[20px] bg-[#0d1b1e] text-[#e6f2f1] shadow-[0_30px_80px_-40px_rgba(10,40,40,0.8)]">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="ml-2 text-[12px] text-white/50">Terminal</span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(lines.join("\n")).then(
              () => {
                setDone(true);
                setTimeout(() => setDone(false), 1800);
              },
              () => {},
            );
          }}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-medium text-white/80 hover:bg-white/15"
          aria-label="Copy the commands"
        >
          {done ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />} {done ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-5 py-4 font-mono text-[13.5px] leading-[1.9]">
        {lines.map((l) => (
          <div key={l}>
            <span className="text-[#5fd3cb] select-none">$ </span>
            {l}
          </div>
        ))}
      </pre>
    </div>
  );
}

const PAIN = [
  { app: "whatsapp", who: "Ishaan", text: "whats the wifi pass??" },
  { app: "discord", who: "neha.dev", text: "does anyone know the wifi password" },
  { app: "telegram", who: "Rahul", text: "wifi?" },
  { app: "slack", who: "Zoya", text: "Hey! Is there Wi-Fi at the venue?" },
  { app: "discord", who: "kiran", text: "where is the venue exactly" },
  { app: "whatsapp", who: "Aman", text: "what time is lunch" },
  { app: "telegram", who: "Sana", text: "when does hacking start" },
  { app: "discord", who: "dev_arjun", text: "wifi password pls 🙏" },
  { app: "slack", who: "Tara", text: "is lunch at 1 or 1:30??" },
  { app: "whatsapp", who: "Kabir", text: "hello?? wifi" },
] as const;

/** The pain, shown: the same few questions piling up across apps, with a counter. */
export function PilingQuestions() {
  const reduced = useReducedMotion();
  const [n, setN] = useState(reduced ? PAIN.length : 4);
  useEffect(() => {
    if (reduced) {
      setN(PAIN.length);
      return;
    }
    const t = setInterval(() => setN((x) => (x >= PAIN.length + 3 ? 4 : x + 1)), 900);
    return () => clearInterval(t);
  }, [reduced]);
  const shown = PAIN.slice(0, Math.min(n, PAIN.length));
  const count = 37 + Math.min(n, PAIN.length) * 4;
  return (
    <div className="relative">
      <div className="absolute -top-4 right-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1.5 text-[13px] font-bold text-white shadow-[0_10px_30px_-10px_rgba(200,40,30,0.7)]">
        <MessageCircleQuestion size={15} aria-hidden /> <span className="tabular-nums">{count}</span> unread
      </div>
      <div className="relative h-[380px] overflow-hidden rounded-[24px] border border-zinc-200 bg-white p-4 [mask-image:linear-gradient(to_bottom,transparent,black_18%,black)]">
        <ul className="absolute inset-x-4 bottom-4 space-y-2" aria-label="Messages piling up">
          {shown.map((m, i) => (
            <li key={`${i}-${m.text}`} className="hiw-pop flex items-start gap-2.5 rounded-[14px] border border-zinc-200 bg-zinc-50 px-3 py-2">
              <PlatformLogo platform={m.app} size={16} />
              <div className="min-w-0 text-[13.5px] leading-snug">
                <span className="font-semibold text-zinc-900">{m.who}</span> <span className="text-zinc-700">{m.text}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
