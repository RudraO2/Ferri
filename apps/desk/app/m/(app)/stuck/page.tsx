import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { JOB_STATUS_LABEL, openCaseList } from "@/lib/care";
import { CARE_STATUS_LABEL } from "@/lib/ferri";
import { shortSpace, stuck, waitedFor } from "@/lib/pocket";
import { requirePocketUser } from "@/lib/session";
import { PlatformLogo } from "@/components/platform";
import { Empty, Header, Label } from "../bits";

const ROW = "block px-4 py-3.5 active:bg-zinc-50";
const LIST = "mx-4 mt-2 divide-y divide-zinc-100 overflow-hidden rounded-[20px] border border-zinc-200 bg-white";

/** "[logo] build-night" in one quiet line. */
function Place({ platform, space, extra }: { platform: string | null | undefined; space: string | null | undefined; extra?: React.ReactNode }) {
  return (
    <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[12.5px] text-zinc-500">
      <PlatformLogo platform={platform} size={13} />
      <span className="truncate">{shortSpace(space)}</span>
      {extra}
    </div>
  );
}

export default async function WhoIsStuck() {
  await requirePocketUser("/m/stuck");
  const [s, cases] = await Promise.all([stuck(), openCaseList()]);
  const total = s.waiting.length + s.replies.length;
  const sub = [cases.length ? `${cases.length} open ${cases.length === 1 ? "case" : "cases"}` : "", total ? `${total} waiting on an answer` : ""]
    .filter(Boolean)
    .join(" · ");
  return (
    <>
      <Header title="Who is stuck" sub={sub || "Nobody is waiting on the crew"} />
      {cases.length ? (
        <section className="mt-3">
          <Label className="px-5">Care cases</Label>
          <ul className={LIST}>
            {cases.map((v) => (
              <li key={v.id}>
                <Link href={`/m/case/${v.id}`} className={ROW}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[15px] font-semibold text-zinc-900">
                      {v.personName}
                      {v.urgent ? <span className="ml-2 align-middle text-[12px] font-semibold text-red-700">urgent</span> : null}
                    </span>
                    <span className={`shrink-0 text-[13px] font-medium ${v.status === "open" ? "text-amber-700" : "text-zinc-500"}`}>{waitedFor(v.createdAt)}</span>
                  </div>
                  <div className="mt-0.5 text-[14px] leading-snug text-zinc-700">{v.reason}</div>
                  <Place
                    platform={v.platform}
                    space={v.spaceName}
                    extra={
                      <span className="truncate">
                        ·{" "}
                        {v.job
                          ? `Builder ${JOB_STATUS_LABEL[v.job.status] ?? v.job.status}`
                          : v.status === "builder"
                            ? CARE_STATUS_LABEL.builder
                            : v.ownerName
                              ? `${v.ownerName} is on it`
                              : <span className="font-medium text-amber-700">nobody on it yet</span>}
                      </span>
                    }
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {total ? (
        <section className="mt-6">
          <Label className="px-5">Waiting on an answer, longest first</Label>
          <ul className={LIST}>
            {s.waiting.map((w) => (
              <li key={w.questionId}>
                <Link href={`/m/c/${w.cardId}`} className={ROW}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[15px] font-semibold text-zinc-900">{w.askerName}</span>
                    <span className={`shrink-0 text-[13px] font-medium ${Date.now() - w.askedAt.getTime() > 10 * 60_000 ? "text-amber-700" : "text-zinc-500"}`}>
                      {waitedFor(w.askedAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[14px] leading-snug text-zinc-700">“{w.text}”</div>
                  <Place platform={w.platform} space={w.spaceName} extra={w.card.escalatedAt ? <span>· escalated</span> : null} />
                </Link>
              </li>
            ))}
            {s.replies.map((r) => (
              <li key={r.id}>
                <Link href={`/m/c/${r.id}`} className={ROW}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[15px] font-semibold text-zinc-900">{r.asker?.askerName ?? "Someone"}</span>
                    <span className="shrink-0 text-[13px] text-zinc-500">{waitedFor(r.asker?.askedAt ?? r.createdAt)}</span>
                  </div>
                  <div className="mt-0.5 text-[14px] leading-snug text-zinc-700">“{r.question}”</div>
                  <Place platform={r.asker?.platform} space={r.asker?.spaceName} extra={<span>· reply needs an OK</span>} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : cases.length ? null : (
        <Empty title="Everyone has an answer" pose="party">
          People Ferri cannot help show up here until the crew does.
        </Empty>
      )}

      {s.expired.length ? (
        <details className="group mt-6">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 px-5 text-[13px] font-semibold text-zinc-500 [&::-webkit-details-marker]:hidden">
            <ChevronRight size={16} className="transition group-open:rotate-90" aria-hidden />
            Never got an answer, last 24 h
            <span className="font-medium text-zinc-400 tabular-nums">{s.expired.length}</span>
          </summary>
          <ul className={LIST}>
            {s.expired.map((e, i) => (
              <li key={i} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[14px] font-medium">{e.askerName}</span>
                  <span className="shrink-0 text-[12px] text-zinc-500">{waitedFor(e.askedAt)} ago</span>
                </div>
                <div className="mt-0.5 text-[14px] text-zinc-700">“{e.text}”</div>
                <Place platform={e.platform} space={e.spaceName} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}
