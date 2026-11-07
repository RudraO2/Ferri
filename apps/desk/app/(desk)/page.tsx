import Link from "next/link";
import { ArrowRight, CheckCircle2, HeartHandshake, Inbox, Megaphone, MessageCircleQuestion, ShieldCheck, Sparkles } from "lucide-react";
import { ago, overview } from "@/lib/data";
import { controlRoom, type FeedItem } from "@/lib/control-room";
import { FerriAvatar, Ferri } from "@/components/ferri";
import { PlatformLogo, platformName } from "@/components/platform";
import { AutoRefresh } from "./refresh";
import { ShareChart } from "./share-chart";
import { Empty, Outcome, Section, Stat } from "./ui";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

function greeting(tz: string) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return h < 5 ? "Late night, crew." : h < 12 ? "Good morning, crew." : h < 17 ? "Good afternoon, crew." : "Good evening, crew.";
}

const FEED_ICON: Record<FeedItem["kind"], typeof Inbox> = {
  answered: Sparkles,
  "asked-crew": MessageCircleQuestion,
  "crew-answered": CheckCircle2,
  announced: Megaphone,
  shield: ShieldCheck,
  care: HeartHandshake,
};

export default async function OverviewPage() {
  const [o, r] = await Promise.all([overview(), controlRoom()]);
  const waiting = o.openQuestions + o.repliesWaiting;
  const maxPlatform = Math.max(1, ...r.platforms.map((p) => p.n));
  const live = !o.community.paused;
  return (
    <>
      <AutoRefresh seconds={15} />
      <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="hidden shrink-0 sm:block"><Ferri pose={waiting ? "thinking" : "main"} size={64} alive priority /></span>
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-[13px] text-zinc-500">
              <span className="relative flex h-2 w-2" aria-hidden>
                {live ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" /> : null}
                <span className={`relative inline-flex h-2 w-2 rounded-full ${live ? "bg-emerald-500" : "bg-red-500"}`} />
              </span>
              {o.community.name} · {live ? "Ferri is live" : "Ferri is paused"}
            </div>
            <h1 className="h1">{greeting(r.tz)}</h1>
          </div>
        </div>
        <Link href="/cards" className={waiting ? "btn-primary h-10 px-5" : "btn h-10 px-5"}>
          {waiting ? `${waiting} card${waiting === 1 ? "" : "s"} need${waiting === 1 ? "s" : ""} you` : "Open cards"}
          <ArrowRight size={16} aria-hidden />
        </Link>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Answered alone"
          icon={Sparkles}
          value={pct(r.shareNow)}
          hint={r.shareStart !== null && r.shareNow !== null && r.startLabel ? `from ${pct(r.shareStart)} at ${r.startLabel}` : `${r.totals.alone} of ${r.totals.asked} questions`}
        />
        <Stat label="Open cards" icon={Inbox} value={waiting} href="/cards" hint={waiting ? "people are waiting" : "nobody waiting"} tone={waiting ? "warn" : "ok"} />
        <Stat label="Care cases" icon={HeartHandshake} value={o.casesOpen} href="/care" hint={o.casesOpen ? "open now" : "all calm"} tone={o.casesOpen ? "warn" : "ok"} />
        <Stat label="Shield blocks" icon={ShieldCheck} value={r.shieldBlocks} href="/shield" hint="last 24 hours" />
      </div>

      <div className="mb-10 grid gap-4 lg:grid-cols-[1.65fr_1fr] [&>*]:min-w-0">
        <section className="card p-5" aria-labelledby="share-title">
          <h2 id="share-title" className="h3">
            Answered alone, by hour
          </h2>
          <p className="muted mt-0.5">
            {r.totals.asked} question{r.totals.asked === 1 ? "" : "s"} · it climbs as the crew teaches it
          </p>
          <div className="mt-3">
            {r.totals.asked ? (
              <ShareChart points={r.hours} />
            ) : (
              <Empty quiet>No member questions in the last 12 hours.</Empty>
            )}
          </div>
        </section>

        <section className="card p-5" aria-labelledby="platform-title">
          <h2 id="platform-title" className="h3">
            Questions by app
          </h2>
          <p className="muted mt-0.5">Last 12 hours</p>
          {r.platforms.length ? (
            <ul className="mt-4 space-y-3">
              {r.platforms.map((p) => (
                <li key={p.platform} className="grid grid-cols-[22px_92px_1fr_auto] items-center gap-2.5 text-[13px]">
                  <PlatformLogo platform={p.platform} size={18} />
                  <span className="truncate text-zinc-700">{platformName(p.platform)}</span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-zinc-100" aria-hidden>
                    <span className="block h-full rounded-full bg-chart" style={{ width: `${Math.max(4, (p.n / maxPlatform) * 100)}%` }} />
                  </span>
                  <span className="w-8 text-right font-semibold text-zinc-900 tabular-nums">{p.n}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-6 text-[13.5px] text-zinc-500">Nothing yet. Attach a space on Spaces.</p>
          )}
        </section>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_1fr] [&>*]:min-w-0">
        <Section title="Live">
          {r.feed.length ? (
            <ol className="card-flat divide-y divide-zinc-100">
              {r.feed.slice(0, 7).map((f, i) => {
                const Icon = FEED_ICON[f.kind];
                const ferri = f.kind === "answered" || f.kind === "asked-crew" || f.kind === "announced";
                return (
                  <li key={i} className="flex items-start gap-3 px-4 py-3">
                    {ferri ? (
                      <FerriAvatar size={28} pose={f.kind === "asked-crew" ? "thinking" : f.kind === "announced" ? "announce" : "main"} />
                    ) : (
                      <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${f.kind === "shield" ? "bg-red-50 text-red-700" : f.kind === "care" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                        <Icon size={15} aria-hidden />
                      </span>
                    )}
                    <div className="min-w-0 flex-1 text-[13px] leading-snug">
                      <span className="text-zinc-800">
                        {f.kind === "crew-answered" ? <b className="font-semibold">{f.who ?? "The crew"} </b> : ferri ? <b className="font-semibold">Ferri </b> : null}
                        {f.text}
                      </span>
                      <div className="mt-1 flex items-center gap-1.5 text-[12px] text-zinc-500">
                        {f.platform ? <PlatformLogo platform={f.platform} size={12} /> : null}
                        {ago(f.at)}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <Empty pose="sleep">Quiet so far. Answers, cards and announcements appear here as they happen.</Empty>
          )}
        </Section>

        <Section
          title="Recent questions"
          aside={
            <Link href="/cards" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-ink hover:underline">
              All cards <ArrowRight size={13} aria-hidden />
            </Link>
          }
        >
          {o.recent.length ? (
            <ul className="card-flat divide-y divide-zinc-100">
              {o.recent.slice(0, 7).map((q) => (
                <li key={q.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-zinc-800">
                    {q.askerName.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] text-zinc-900">{q.text}</div>
                    <div className="mt-0.5 truncate text-[12px] text-zinc-500">
                      {q.askerName} · {ago(q.askedAt)}
                    </div>
                  </div>
                  <Outcome outcome={q.outcome} resolution={q.resolution} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty quiet>No questions yet. Try “@ferri when does hacking start?” in an attached space.</Empty>
          )}
        </Section>
      </div>
    </>
  );
}
