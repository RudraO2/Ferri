"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpen,
  CalendarCheck,
  CalendarDays,
  Flag,
  Hammer,
  HeartHandshake,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  Megaphone,
  Menu,
  MessagesSquare,
  Share2,
  ShieldCheck,
  Sparkles,
  Users,
  UsersRound,
  Wrench,
  X,
  Contact,
  type LucideIcon,
} from "lucide-react";
import { FerriLogo } from "@/components/ferri";
import { ThemeToggle } from "@/components/theme-toggle";

type Item = { href: string; label: string; icon: LucideIcon };

export const NAV_GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Today",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/cards", label: "Cards", icon: Inbox },
      { href: "/care", label: "Care", icon: HeartHandshake },
    ],
  },
  {
    title: "Event",
    items: [
      { href: "/plan", label: "Plan", icon: CalendarCheck },
      { href: "/announcements", label: "Announcements", icon: Megaphone },
      { href: "/guests", label: "Guests", icon: Users },
      { href: "/desks", label: "Desks", icon: LayoutGrid },
      { href: "/wrap", label: "Wrap", icon: Flag },
    ],
  },
  {
    title: "Reach",
    items: [
      { href: "/social", label: "Social", icon: Share2 },
      { href: "/contacts", label: "Contacts", icon: Contact },
      { href: "/builder", label: "Builder", icon: Hammer },
    ],
  },
  {
    title: "Setup",
    items: [
      { href: "/spaces", label: "Spaces", icon: MessagesSquare },
      { href: "/knowledge", label: "Knowledge", icon: BookOpen },
      { href: "/skills", label: "Skills", icon: Sparkles },
      { href: "/shield", label: "Shield", icon: ShieldCheck },
      { href: "/events", label: "Events", icon: CalendarDays },
      { href: "/community", label: "Community", icon: UsersRound },
      { href: "/setup", label: "Setup", icon: Wrench },
    ],
  },
];

const isActive = (href: string, path: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

function Links({ counts, onNavigate }: { counts: Record<string, number>; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Desk" className="space-y-3 px-3">
      {NAV_GROUPS.map((g) => (
        <div key={g.title}>
          <div className="px-2.5 pb-1.5 text-[10.5px] font-semibold tracking-[0.1em] text-zinc-400 uppercase">{g.title}</div>
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const active = isActive(item.href, path);
              const n = counts[item.href] ?? 0;
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`group flex items-center gap-2.5 rounded-[12px] px-2.5 py-[5px] text-[13.5px] transition ${
                      active
                        ? "bg-white font-semibold text-zinc-900 shadow-[0_0_0_1px_var(--n-200),0_2px_0_var(--n-200)]"
                        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                    }`}
                  >
                    <Icon size={17} strokeWidth={2} className={active ? "text-brand" : "text-zinc-400 group-hover:text-zinc-600"} aria-hidden />
                    <span className="flex-1">{item.label}</span>
                    {n ? (
                      <span className="min-w-[20px] rounded-full bg-brand px-1.5 text-center text-[11px] leading-[19px] font-semibold text-white tabular-nums">{n}</span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** The sidebar on wide screens; a top bar with a slide-in menu on phones. */
export function Nav({ counts, community, footer }: { counts: Record<string, number>; community: string; footer: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  const total = (counts["/cards"] ?? 0) + (counts["/care"] ?? 0);
  return (
    <>
      {/* Phone and tablet: top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200 bg-zinc-50/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <Link href="/" aria-label="Overview">
          <FerriLogo size={30} label="Ferri Desk" sub={community} />
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-700 hover:bg-zinc-100"
            aria-label="Open menu"
            aria-expanded={open}
          >
            <Menu size={20} aria-hidden />
            {total ? <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-brand ring-2 ring-zinc-50" /> : null}
          </button>
        </div>
      </div>

      {/* Phone and tablet: drawer */}
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-zinc-950/40" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[min(300px,86vw)] flex-col overflow-y-auto bg-zinc-50 pb-[env(safe-area-inset-bottom)] shadow-[var(--shadow-pop)]">
            <div className="flex items-center justify-between px-5 py-4">
              <FerriLogo size={30} label="Ferri Desk" sub={community} />
              <button type="button" onClick={() => setOpen(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-zinc-100" aria-label="Close menu">
                <X size={18} aria-hidden />
              </button>
            </div>
            <Links counts={counts} onNavigate={() => setOpen(false)} />
            <div className="mt-auto pt-6">{footer}</div>
          </aside>
        </div>
      ) : null}

      {/* Desktop: sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col overflow-y-auto border-r border-zinc-200 bg-zinc-50 lg:flex">
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <Link href="/" aria-label="Overview">
            <FerriLogo size={32} label="Ferri Desk" sub={community} />
          </Link>
          <ThemeToggle />
        </div>
        <Links counts={counts} />
        <div className="mt-auto pt-6">{footer}</div>
      </aside>
    </>
  );
}

