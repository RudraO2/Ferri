import { ChevronDown, ChevronRight, Info, Plus, type LucideIcon } from "lucide-react";
import { Ferri, type Pose } from "@/components/ferri";

/**
 * The page title. One short line under it at most; anything longer goes in
 * `about`, folded behind "How it works" so the first view stays calm.
 */
export function PageHead({
  title,
  sub,
  action,
  eyebrow,
  about,
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
  eyebrow?: string;
  about?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1.5 text-[12.5px] font-medium text-zinc-500">{eyebrow}</div> : null}
        <h1 className="h1 break-words">{title}</h1>
        {sub ? <p className="mt-1 max-w-[620px] text-[14px] leading-relaxed text-zinc-500">{sub}</p> : null}
        {about ? (
          <details className="group mt-1.5 max-w-[620px]">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[12.5px] font-medium text-zinc-500 hover:text-zinc-800 [&::-webkit-details-marker]:hidden">
              <Info size={13} aria-hidden />
              How it works
              <ChevronDown size={13} className="transition group-open:rotate-180" aria-hidden />
            </summary>
            <div className="mt-2 space-y-1.5 text-[13.5px] leading-relaxed text-zinc-600">{about}</div>
          </details>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

/** A note after an action ("Sent.", "Saved."): quiet, and it says what happened. */
export function Note({ note }: { note?: string }) {
  if (!note) return null;
  return (
    <div role="status" className="mb-6 flex items-start gap-2.5 rounded-[14px] bg-brand-soft px-4 py-2.5 text-[13.5px] text-zinc-800">
      <Info size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden />
      <span>{note}</span>
    </div>
  );
}

/**
 * Progressive disclosure: a quiet row that opens to show what is behind it
 * (history, settings, long lists). Native <details>, so it works without JS.
 */
export function Fold({
  title,
  count,
  hint,
  children,
  open,
  className = "mb-10",
}: {
  title: string;
  count?: number;
  hint?: React.ReactNode;
  children: React.ReactNode;
  open?: boolean;
  className?: string;
}) {
  return (
    <details className={`group ${className}`} open={open}>
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-[12px] py-2 text-[14.5px] font-semibold text-zinc-700 select-none hover:text-zinc-900 [&::-webkit-details-marker]:hidden">
        <ChevronRight size={16} className="shrink-0 text-zinc-400 transition group-open:rotate-90" aria-hidden />
        {title}
        {count !== undefined ? <span className="text-[13px] font-medium text-zinc-400 tabular-nums">{count}</span> : null}
        {hint ? <span className="ml-auto truncate text-[12.5px] font-normal text-zinc-400">{hint}</span> : null}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

/**
 * A secondary form kept out of the way: a pill that opens the form below it
 * ("New announcement", "Add a contact"). Native <details>, so it works without JS.
 */
export function Composer({ label, children, className = "mb-10", open }: { label: string; children: React.ReactNode; className?: string; open?: boolean }) {
  return (
    <details className={`group ${className}`} open={open}>
      <summary className="btn cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <Plus size={15} className="transition group-open:rotate-45" aria-hidden />
        {label}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

const OUTCOME_STYLE: Record<string, string> = {
  answered: "bg-emerald-50 text-emerald-700",
  unknown: "bg-amber-50 text-amber-700",
  held: "bg-sky-50 text-sky-700",
  listened: "bg-zinc-100 text-zinc-600",
  skipped: "bg-zinc-100 text-zinc-500",
  chat: "bg-zinc-100 text-zinc-500",
  error: "bg-red-50 text-red-700",
  declined: "bg-red-50 text-red-700",
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
 * `quiet` is one muted line, for secondary lists (one otter per page is plenty).
 */
export function Empty({
  children,
  title,
  action,
  pose = "sleep",
  quiet,
}: {
  children: React.ReactNode;
  title?: string;
  action?: React.ReactNode;
  pose?: Pose;
  quiet?: boolean;
}) {
  if (quiet) return <p className="py-1 text-[13.5px] leading-relaxed text-zinc-500">{children}</p>;
  return (
    <div className="flex flex-col items-center gap-4 rounded-[20px] bg-zinc-100/60 px-6 py-7 text-center sm:flex-row sm:text-left">
      <Ferri pose={pose} size={64} decorative className="shrink-0" />
      <div className="min-w-0 max-w-[560px]">
        {title ? <div className="text-[15px] font-semibold text-zinc-900">{title}</div> : null}
        <div className="text-[13.5px] leading-relaxed text-zinc-500">{children}</div>
        {action ? <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">{action}</div> : null}
      </div>
    </div>
  );
}

export function Section({ title, children, aside, count }: { title: string; children: React.ReactNode; aside?: React.ReactNode; count?: number }) {
  return (
    <section className="mb-10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="h2">
          {title}
          {count !== undefined ? <span className="ml-2 text-[13px] font-medium text-zinc-400 tabular-nums">{count}</span> : null}
        </h2>
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
  const toneText = tone === "warn" ? "text-amber-700" : tone === "bad" ? "text-red-700" : tone === "ok" ? "text-emerald-700" : "text-zinc-500";
  const body = (
    <>
      <div className="flex items-center gap-2 text-[12.5px] font-medium text-zinc-500">
        {Icon ? <Icon size={15} aria-hidden className="text-zinc-400" /> : null}
        {label}
      </div>
      <div className="num mt-2 text-[34px] leading-none text-zinc-900">{value}</div>
      {hint ? <div className={`mt-2 text-[12px] ${toneText}`}>{hint}</div> : null}
    </>
  );
  const cls = "card-flat block p-4 sm:p-5";
  return href ? (
    <a href={href} className={`${cls} transition hover:border-zinc-300 hover:bg-zinc-50`}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}
