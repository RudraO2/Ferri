import Link from "next/link";
import { JOB_STATUS_LABEL, openCaseList } from "@/lib/care";
import { CARE_STATUS_LABEL } from "@/lib/ferri";
import { stuck, waitedFor } from "@/lib/pocket";
import { requirePocketUser } from "@/lib/session";
import { Empty, Header, Where } from "../bits";

export default async function WhoIsStuck() {
  await requirePocketUser("/m/stuck");
  const [s, cases] = await Promise.all([stuck(), openCaseList()]);
  const total = s.waiting.length + s.replies.length;
  const sub = [
    cases.length ? `${cases.length} open ${cases.length === 1 ? "case" : "cases"}` : "",
    total ? `${total} ${total === 1 ? "person is" : "people are"} waiting on an answer, longest first` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <>
      <Header title="Who is stuck" sub={sub || "Nobody is waiting on the crew"} />
      {cases.length ? (
        <>
          <h2 className="mt-5 px-5 text-[12px] font-semibold tracking-wide text-zinc-500 uppercase">Open cases · {cases.length}</h2>
          <ul className="mx-4 mt-2 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
            {cases.map((v) => (
              <li key={v.id}>
                <Link href={`/m/case/${v.id}`} className="block px-4 py-3 active:bg-zinc-50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[15px] font-medium">{v.personName}</span>
                    <span className={`text-[13px] font-medium ${v.status === "open" ? "text-amber-700" : "text-zinc-500"}`}>
                      {v.status === "open" ? "waiting" : "open for"} {waitedFor(v.createdAt)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="pill bg-rose-100 text-rose-800">
                      {v.ref} · {v.kind}
                    </span>
                    {v.urgent ? <span className="pill bg-red-600 text-white">urgent</span> : null}
                    {v.job ? (
                      <span className="pill bg-violet-100 text-violet-800">
                        Builder {v.job.ref} · {JOB_STATUS_LABEL[v.job.status] ?? v.job.status}
                      </span>
                    ) : v.status === "builder" ? (
                      <span className="pill bg-violet-100 text-violet-800">{CARE_STATUS_LABEL.builder}</span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-[14px] text-zinc-700">{v.reason}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2">
                    <Where platform={v.platform} space={v.spaceName} />
                    {v.ownerName ? (
                      <span className="text-[12.5px] text-zinc-500">· {v.ownerName} is on it</span>
                    ) : (
                      <span className="text-[12.5px] font-medium text-amber-700">· nobody on it yet</span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {total ? <h2 className="mt-7 px-5 text-[12px] font-semibold tracking-wide text-zinc-500 uppercase">Waiting on an answer · {total}</h2> : null}
        </>
      ) : null}
      {total ? (
        <ul className={`mx-4 ${cases.length ? "mt-2" : "mt-3"} divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white`}>
          {s.waiting.map((w) => (
            <li key={w.questionId}>
              <Link href={`/m/c/${w.cardId}`} className="block px-4 py-3 active:bg-zinc-50">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-medium">{w.askerName}</span>
                  <span className={`text-[13px] font-medium ${Date.now() - w.askedAt.getTime() > 10 * 60_000 ? "text-amber-700" : "text-zinc-500"}`}>
                    waiting {waitedFor(w.askedAt)}
                  </span>
                </div>
                <div className="mt-0.5 text-[14px] text-zinc-700">“{w.text}”</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2">
                  <Where platform={w.platform} space={w.spaceName} />
                  <span className="text-[12.5px] text-zinc-400">· {w.card.escalatedAt ? "escalated" : `${w.card.topic} card`}</span>
                </div>
              </Link>
            </li>
          ))}
          {s.replies.map((r) => (
            <li key={r.id}>
              <Link href={`/m/c/${r.id}`} className="block px-4 py-3 active:bg-zinc-50">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-medium">{r.asker?.askerName ?? "Someone"}</span>
                  <span className="text-[13px] text-zinc-500">waiting {waitedFor(r.asker?.askedAt ?? r.createdAt)}</span>
                </div>
                <div className="mt-0.5 text-[14px] text-zinc-700">“{r.question}”</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2">
                  <Where platform={r.asker?.platform} space={r.asker?.spaceName} />
                  <span className="text-[12.5px] text-zinc-400">· reply drafted, needs an OK</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : cases.length ? null : (
        <Empty title="Everyone has an answer">When Ferri cannot answer someone, or a member needs the crew, they show up here until the crew helps.</Empty>
      )}

      {s.expired.length ? (
        <>
          <h2 className="mt-7 px-5 text-[12px] font-semibold tracking-wide text-zinc-500 uppercase">Never got an answer · last 24 h</h2>
          <ul className="mx-4 mt-2 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
            {s.expired.map((e, i) => (
              <li key={i} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-medium">{e.askerName}</span>
                  <span className="text-[12px] text-zinc-400">asked {waitedFor(e.askedAt)} ago</span>
                </div>
                <div className="mt-0.5 text-[14px] text-zinc-700">“{e.text}”</div>
                <div className="mt-1">
                  <Where platform={e.platform} space={e.spaceName} />
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}
