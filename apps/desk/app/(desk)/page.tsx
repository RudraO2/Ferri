import Link from "next/link";
import { ago, overview } from "@/lib/data";
import { Empty, Outcome, PageHead, Section } from "./ui";

export default async function OverviewPage() {
  const o = await overview();
  const stats = [
    { label: "Questions waiting for the crew", value: o.openQuestions, href: "/cards" },
    { label: "Replies waiting for approval", value: o.repliesWaiting, href: "/cards" },
    { label: "Unanswered (expired)", value: o.unanswered, href: "/cards#unanswered" },
    { label: "New spaces to review", value: o.discovered, href: "/spaces" },
    { label: "Knowledge entries", value: o.entries, href: "/knowledge" },
  ];
  return (
    <>
      <PageHead title="Overview" sub={o.community.paused ? "Ferri is paused." : "Ferri is live in the spaces you attached."} />
      <div className="mb-8 grid grid-cols-5 gap-3">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card p-4 transition hover:border-zinc-300">
            <div className="text-[24px] font-semibold tabular-nums tracking-tight">{s.value}</div>
            <div className="mt-1 text-[12px] leading-snug text-zinc-500">{s.label}</div>
          </Link>
        ))}
      </div>
      <Section title="Recent questions">
        {o.recent.length ? (
          <div className="card divide-y divide-zinc-100">
            {o.recent.map((q) => (
              <div key={q.id} className="flex items-start gap-3 px-4 py-2.5">
                <div className="w-[88px] shrink-0 pt-0.5 text-[12px] text-zinc-400">{ago(q.askedAt)}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px]">{q.text}</div>
                  <div className="text-[12px] text-zinc-500">
                    {q.askerName} in {q.spaceName ?? "an unknown space"}
                  </div>
                </div>
                <Outcome outcome={q.outcome} resolution={q.resolution} />
              </div>
            ))}
          </div>
        ) : (
          <Empty>No questions yet.</Empty>
        )}
      </Section>
    </>
  );
}
