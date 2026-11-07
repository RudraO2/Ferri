import {
  BookOpen,
  CalendarCheck,
  CalendarDays,
  Contact,
  Flag,
  Hammer,
  HeartHandshake,
  Inbox,
  Info,
  LayoutDashboard,
  LayoutGrid,
  Megaphone,
  MessagesSquare,
  Share2,
  ShieldCheck,
  Sparkles,
  Users,
  UsersRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Ferri, type Pose } from "@/components/ferri";

const PAGE_ICON: Record<string, LucideIcon> = {
  Overview: LayoutDashboard,
  Cards: Inbox,
  Care: HeartHandshake,
  Plan: CalendarCheck,
  Announcements: Megaphone,
  Guests: Users,
  Desks: LayoutGrid,
  Wrap: Flag,
  Social: Share2,
  Contacts: Contact,
  Builder: Hammer,
  Spaces: MessagesSquare,
  Knowledge: BookOpen,
  "New knowledge entry": BookOpen,
  Skills: Sparkles,
  Shield: ShieldCheck,
  Events: CalendarDays,
  Community: UsersRound,
  Setup: Wrench,
};

export function PageHead({ title, sub, action, eyebrow }: { title: string; sub?: string; action?: React.ReactNode; eyebrow?: string }) {
  const Icon = PAGE_ICON[title];
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow || Icon ? (
          <div className="mb-2 flex items-center gap-2 text-[12.5px] font-medium text-zinc-500">
            {Icon ? (
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-[9px] bg-brand-soft text-brand">
                <Icon size={15} strokeWidth={2.2} aria-hidden />
              </span>
            ) : null}
            {eyebrow}
          </div>
        ) : null}
        <h1 className="h1 break-words">{title}</h1>
        {sub ? <p className="mt-1.5 max-w-[680px] text-[14.5px] leading-relaxed text-zinc-500">{sub}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

export function Note({ note }: { note?: string }) {
  if (!note) return null;
  return (
    <div role="status" className="mb-6 flex items-start gap-2.5 rounded-[14px] border border-brand-line bg-brand-soft px-4 py-2.5 text-[13.5px] text-zinc-800">
      <Info size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden />
      <span>{note}</span>
    </div>
  );
}

const OUTCOME_STYLE: Record<string, string> = {
  answered: "border-emerald-200 bg-emerald-50 text-emerald-700",
  unknown: "border-amber-200 bg-amber-50 text-amber-700",
  held: "border-sky-200 bg-sky-50 text-sky-700",
  listened: "border-zinc-200 bg-zinc-50 text-zinc-600",
  skipped: "border-zinc-200 bg-zinc-50 text-zinc-500",
  chat: "border-zinc-200 bg-zinc-50 text-zinc-500",
  error: "border-red-200 bg-red-50 text-red-700",
  declined: "border-red-200 bg-red-50 text-red-700",
};

const OUTCOME_LABEL: Record<string, string> = {
  answered: "Answered",
  unknown: "Asked the crew",
  held: "Waiting for OK",
  listened: "Listened",
  skipped: "Skipped",
  chat: "Chat",
  error: "Error",
  declined: "Declined",
  pending: "Working",
  dismissed: "Dismissed",
  expired: "Expired",
};

export function Outcome({ outcome, resolution }: { outcome: string; resolution?: string | null }) {
  const label = resolution
    ? `${OUTCOME_LABEL[outcome] ?? outcome} → ${OUTCOME_LABEL[resolution] ?? resolution}`
    : (OUTCOME_LABEL[outcome] ?? outcome);
  const dot = resolution === "answered" || outcome === "answered" ? "bg-emerald-500" : outcome === "unknown" ? "bg-amber-500" : outcome === "held" ? "bg-sky-500" : outcome === "error" || outcome === "declined" ? "bg-red-500" : "bg-zinc-400";
  return (
    <span className={`badge ${OUTCOME_STYLE[resolution === "answered" ? "answered" : outcome] ?? ""}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  );
}

/**
 * An empty state that teaches: what will show up here, and how to make it happen.
 * `title` is optional; the children say the rest. `pose` picks Ferri's mood.
 */
export function Empty({ children, title, action, pose = "sleep" }: { children: React.ReactNode; title?: string; action?: React.ReactNode; pose?: Pose }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-zinc-300 bg-white/60 px-6 py-8 text-center sm:flex-row sm:text-left">
      <Ferri pose={pose} size={72} decorative className="shrink-0" />
      <div className="min-w-0">
        {title ? <div className="text-[15px] font-semibold text-zinc-900">{title}</div> : null}
        <div className="text-[13.5px] leading-relaxed text-zinc-500">{children}</div>
        {action ? <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">{action}</div> : null}
      </div>
    </div>
  );
}

export function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="mb-10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="h2">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** A big number tile. */
export function Stat({
  label,
  value,
  hint,
  icon: Icon,
  href,
  tone = "brand",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  href?: string;
  tone?: "brand" | "warn" | "bad" | "ok";
}) {
  const toneText = tone === "warn" ? "text-amber-700" : tone === "bad" ? "text-red-700" : tone === "ok" ? "text-emerald-700" : "text-brand-ink";
  const body = (
    <>
      <div className="flex items-center gap-2 text-[12.5px] font-medium text-zinc-500">
        {Icon ? <Icon size={15} aria-hidden className="text-zinc-400" /> : null}
        {label}
      </div>
      <div className="num mt-2 text-[34px] leading-none text-zinc-900">{value}</div>
      {hint ? <div className={`mt-2 text-[12px] font-medium ${toneText}`}>{hint}</div> : null}
    </>
  );
  const cls = "card block p-4 sm:p-5";
  return href ? (
    <a href={href} className={`${cls} transition hover:-translate-y-0.5 hover:border-zinc-300`}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}
