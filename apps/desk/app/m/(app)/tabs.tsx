"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/m", label: "Needs you", icon: "M4 12l5 5L20 6" },
  { href: "/m/stuck", label: "Who is stuck", icon: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" },
  { href: "/m/me", label: "Me", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" },
];

export function Tabs({ needsYou, stuck }: { needsYou: number; stuck: number }) {
  const path = usePathname();
  const count: Record<string, number> = { "/m": needsYou, "/m/stuck": stuck };
  return (
    <nav className="pocket-tabs fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white/95 backdrop-blur">
      <div className="mx-auto grid max-w-[520px] grid-cols-3">
        {TABS.map((t) => {
          const active = t.href === "/m" ? path === "/m" || path.startsWith("/m/c/") : path.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href} className={`flex h-[60px] flex-col items-center justify-center gap-1 text-[11.5px] font-medium ${active ? "text-zinc-900" : "text-zinc-400"}`}>
              <span className="relative">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={t.icon} />
                </svg>
                {count[t.href] ? (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[18px] rounded-full bg-zinc-900 px-1 text-center text-[10.5px] leading-[18px] text-white">{count[t.href]}</span>
                ) : null}
              </span>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
