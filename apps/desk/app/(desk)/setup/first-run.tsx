import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, ChevronDown, Info } from "lucide-react";
import { Ferri } from "@/components/ferri";
import type { FirstRunChecklist, FirstRunPage, FirstRunStatus, FirstRunTick } from "@/lib/checklist";

/**
 * The first-run checklist at the top of Setup (spec 25): six ticks that fill in from
 * Switch and Ferri's own data, each with what was found, the next step and its guide.
 * Only links, never a button: the guest view stays read-only. Once all six are done it
 * folds into one calm line.
 */

const DOCS = "https://github.com/RudraO2/Ferri/blob/main/docs";
const MAKE_IT_YOURS = `${DOCS}/your-community.md`;
const ATTACH = `${DOCS}/platforms.md#attach-your-groups-and-choose-the-crew-room`;

type Guide = { label: string; href: string };

const PLATFORM_GUIDES: Record<string, Guide> = {
  telegram: { label: "Telegram", href: `${DOCS}/platforms.md#telegram` },
  discord: { label: "Discord", href: `${DOCS}/platforms.md#discord` },
  slack: { label: "Slack", href: `${DOCS}/platforms.md#slack` },
  whatsapp_web: { label: "WhatsApp", href: `${DOCS}/whatsapp.md` },
};
const THREE = ["telegram", "discord", "slack"];

const PAGES: Record<FirstRunPage, Guide> = {
  spaces: { label: "Spaces", href: "/spaces" },
  events: { label: "Events", href: "/events" },
  knowledge: { label: "Knowledge", href: "/knowledge" },
  pocket: { label: "Pocket", href: "/m" },
};

/** The guides for a tick: one per platform for connecting and adding Ferri, else one guide. */
function guidesFor(t: FirstRunTick, connected: string[]): { lead: string; guides: Guide[] } {
  switch (t.id) {
    case "platform":
      return { lead: "How to connect:", guides: [...THREE, "whatsapp_web"].map((p) => PLATFORM_GUIDES[p]!) };
    case "group": {
      const mine = connected.filter((p) => PLATFORM_GUIDES[p]);
      return { lead: "How to add Ferri:", guides: (mine.length ? mine : THREE).map((p) => PLATFORM_GUIDES[p]!) };
    }
    case "event":
    case "crew-room":
      return { lead: "", guides: [{ label: "Guide", href: ATTACH }] };
    case "knowledge":
      return { lead: "", guides: t.status === "demo" ? [{ label: "Make it yours", href: MAKE_IT_YOURS }, { label: "Guide", href: `${DOCS}/knowledge.md` }] : [{ label: "Guide", href: `${DOCS}/knowledge.md` }] };
    case "pocket":
      return { lead: "", guides: [{ label: "Guide", href: `${DOCS}/pocket.md` }] };
  }
}

/** Said to screen readers where no badge shows the state. */
const SAY: Partial<Record<FirstRunStatus, string>> = { done: "Done.", todo: "Not done yet." };

function Mark({ status }: { status: FirstRunStatus }) {
  const box = "mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full";
  if (status === "done") {
    return (
      <span className={`${box} bg-brand text-white`} aria-hidden>
        <Check size={13} strokeWidth={3} />
      </span>
    );
  }
  if (status === "demo") return <span className={`${box} border-2 border-dashed border-accent bg-accent-soft`} aria-hidden />;
  if (status === "unknown") {
    return (
      <span className={`${box} bg-zinc-100 text-[11px] font-bold text-zinc-500`} aria-hidden>
        ?
      </span>
    );
  }
  return <span className={`${box} border-2 border-zinc-300`} aria-hidden />;
}

function Badge({ tick }: { tick: FirstRunTick }) {
  if (tick.status === "demo") return <span className="badge bg-accent-soft text-zinc-800">{tick.id === "knowledge" ? "Demo" : "Test chat"}</span>;
  if (tick.status === "unknown") return <span className="badge">Can&apos;t check</span>;
  return null;
}

const LINK = "inline-flex items-center gap-0.5 font-medium text-brand-ink hover:underline";

function Row({ tick, connected }: { tick: FirstRunTick; connected: string[] }) {
  const { lead, guides } = guidesFor(tick, connected);
  const page = tick.page ? PAGES[tick.page] : null;
  return (
    <li className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
      <Mark status={tick.status} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`text-[14px] font-medium ${tick.status === "done" ? "text-zinc-700" : "text-zinc-900"}`}>{tick.title}</span>
          <Badge tick={tick} />
          {SAY[tick.status] ? <span className="sr-only">{SAY[tick.status]}</span> : null}
        </div>
        <p className="mt-0.5 text-[13px] leading-snug text-zinc-500">{tick.detail}</p>
        {/* A tick that can't be checked has one shared next step, in the header. */}
        {tick.next && tick.status !== "done" && tick.status !== "unknown" ? (
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-zinc-700">
            <span className="font-medium text-zinc-900">Next:</span> {tick.next}
            {tick.cmd ? (
              <>
                {" "}
                <code className="rounded-[6px] bg-zinc-100 px-1.5 py-0.5 text-[12px] break-all text-zinc-800">{tick.cmd}</code>
              </>
            ) : null}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px]">
          {lead ? <span className="text-zinc-500">{lead}</span> : null}
          {guides.map((g) => (
            <a key={g.href + g.label} href={g.href} target="_blank" rel="noreferrer" className={LINK}>
              {g.label}
              <ArrowUpRight size={13} aria-hidden />
              <span className="sr-only"> (opens on GitHub)</span>
            </a>
          ))}
          {page && tick.page === "pocket" ? (
            // Pocket is its own app (manifest, service worker): a full page load, not a client hop.
            <a href={page.href} className={LINK}>
              {page.label}
              <ArrowRight size={13} aria-hidden />
            </a>
          ) : page ? (
            <Link href={page.href} className={LINK}>
              {page.label}
              <ArrowRight size={13} aria-hidden />
            </Link>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function Rows({ list }: { list: FirstRunChecklist }) {
  return (
    <ol className="divide-y divide-zinc-100 border-t border-zinc-100">
      {list.ticks.map((t) => (
        <Row key={t.id} tick={t} connected={list.connected} />
      ))}
    </ol>
  );
}

export function FirstRun({ list }: { list: FirstRunChecklist }) {
  const progress = `${list.done} of ${list.total} done`;
  const unknown = list.ticks.filter((t) => t.status === "unknown").length;

  if (list.done === list.total) {
    // All done: one calm line that opens to the ticks (native <details>, works without JS).
    return (
      <section aria-labelledby="first-run-title" className="mb-10">
        <h2 id="first-run-title" className="sr-only">
          First run
        </h2>
        <details className="group card-flat overflow-hidden">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 select-none sm:px-5 [&::-webkit-details-marker]:hidden">
            <Ferri pose="party" size={40} decorative className="shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold text-zinc-900">First run: all set</span>
              <span className="block text-[12.5px] text-zinc-500">Ferri is ready for your community. {progress}.</span>
            </span>
            <ChevronDown size={16} className="shrink-0 text-zinc-400 transition group-open:rotate-180" aria-hidden />
          </summary>
          <Rows list={list} />
        </details>
      </section>
    );
  }

  return (
    <section aria-labelledby="first-run-title" className="card mb-10 overflow-hidden">
      <div className="flex items-start gap-3.5 px-4 pt-4 pb-3.5 sm:px-5 sm:pt-5">
        <Ferri pose={list.done ? "carry" : "wave"} size={52} decorative className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <h2 id="first-run-title" className="h2">
              First run
            </h2>
            <span className="text-[12.5px] font-medium text-zinc-500 tabular-nums">{progress}</span>
          </div>
          <p className="mt-0.5 text-[13px] leading-snug text-zinc-500">
            Six steps to run Ferri for your own community.{" "}
            <a href={MAKE_IT_YOURS} target="_blank" rel="noreferrer" className={LINK}>
              Make it yours
              <ArrowUpRight size={13} aria-hidden />
              <span className="sr-only"> (opens on GitHub)</span>
            </a>
          </p>
          <div className="mt-2.5 flex gap-1" aria-hidden>
            {list.ticks.map((t) => (
              <span key={t.id} className={`h-1.5 flex-1 rounded-full ${t.status === "done" ? "bg-brand" : t.status === "demo" ? "bg-accent/50" : "bg-zinc-200"}`} />
            ))}
          </div>
          {unknown ? (
            <p className="mt-2.5 flex items-start gap-1.5 text-[12.5px] leading-snug text-zinc-600">
              <Info size={14} className="mt-px shrink-0 text-zinc-400" aria-hidden />
              <span>
                {unknown === 1 ? "One step" : `${unknown} steps`} can&apos;t be checked right now. Fix the Core checks below, then reload this page.
              </span>
            </p>
          ) : null}
        </div>
      </div>
      <Rows list={list} />
    </section>
  );
}
