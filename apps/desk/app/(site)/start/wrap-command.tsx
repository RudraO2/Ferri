"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Like CopyCommand, but long lines wrap instead of scrolling, for narrow cards. */
export function WrapCommand({ lines, label = "Terminal" }: { lines: string[]; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="relative overflow-hidden rounded-[16px] bg-[#0d1b1e] text-[#e6f2f1]">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-3.5 py-2">
        <span className="text-[12px] text-white/50">{label}</span>
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
          aria-label={lines.length > 1 ? "Copy the commands" : "Copy the command"}
        >
          {done ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />} {done ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="space-y-1 px-4 py-3 font-mono text-[13px] leading-[1.7]">
        {lines.map((l) => (
          <div key={l} className="flex gap-2">
            <span className="shrink-0 text-[#5fd3cb] select-none" aria-hidden>
              $
            </span>
            <span className="min-w-0 [overflow-wrap:anywhere] whitespace-pre-wrap">{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
