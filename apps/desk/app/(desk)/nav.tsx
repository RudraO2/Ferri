"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/cards", label: "Cards" },
  { href: "/announcements", label: "Announcements" },
  { href: "/spaces", label: "Spaces" },
  { href: "/events", label: "Events" },
  { href: "/knowledge", label: "Knowledge" },
  { href: "/community", label: "Community" },
];

export function Nav({ counts }: { counts: Record<string, number> }) {
  const path = usePathname();
  return (
    <nav className="space-y-0.5 px-2">
      {ITEMS.map((item) => {
        const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
        const n = counts[item.href] ?? 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] ${
              active ? "bg-zinc-100 font-medium text-zinc-900" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
            }`}
          >
            <span>{item.label}</span>
            {n ? <span className="rounded-full bg-zinc-900 px-1.5 text-[11px] font-medium text-white">{n}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
