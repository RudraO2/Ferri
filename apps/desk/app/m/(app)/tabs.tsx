"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox, LifeBuoy, UserRound } from "lucide-react";

const TABS = [
  { href: "/m", label: "Needs you", icon: Inbox },
  { href: "/m/stuck", label: "Who is stuck", icon: LifeBuoy },
  { href: "/m/me", label: "Me", icon: UserRound },
];

export function Tabs({ needsYou, stuck }: { needsYou: number; stuck: number }) {
  const path = usePathname();
  const count: Record<string, number> = { "/m": needsYou, "/m/stuck": stuck };
  return (
    <nav className="pocket-tabs fixed inset-x-0 bottom-0 z-20 px-3" aria-label="Pocket">
      <div className="mx-auto mb-2 grid max-w-[500px] grid-cols-3 rounded-[24px] border border-zinc-200 bg-white/95 p-1.5 shadow-[var(--shadow-pop)] backdrop-blur">
        {TABS.map((t) => {
          const active =
            t.href === "/m" ? path === "/m" || path.startsWith("/m/c/") : t.href === "/m/stuck" ? path.startsWith(t.href) || path.startsWith("/m/case/") : path.startsWith(t.href);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`flex h-[54px] flex-col items-center justify-center gap-0.5 rounded-[18px] text-[11.5px] font-semibold transition ${
                active ? "bg-brand-soft text-brand-ink" : "text-zinc-500"
              }`}
            >
              <span className="relative">
                <Icon size={21} strokeWidth={active ? 2.3 : 1.9} aria-hidden />
                {count[t.href] ? (
                  <span className="absolute -top-1.5 -right-3 min-w-[18px] rounded-full bg-accent px-1 text-center text-[10.5px] leading-[18px] font-bold text-[#1d1b18]">
                    {count[t.href]}
                  </span>
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
