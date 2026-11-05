import Link from "next/link";
import { stuck, waitedFor } from "@/lib/pocket";
import { requirePocketUser } from "@/lib/session";
import { Empty, Header, Where } from "../bits";

export default async function WhoIsStuck() {
  await requirePocketUser("/m/stuck");
  const s = await stuck();
  const total = s.waiting.length + s.replies.length;
  return (
    <>
      <Header
        title="Who is stuck"
        sub={total ? `${total} ${total === 1 ? "person is" : "people are"} waiting on the crew, longest first` : "Nobody is waiting on the crew"}
      />
      {total ? (
        <ul className="mx-4 mt-3 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
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
      ) : (
        <Empty title="Everyone has an answer">When Ferri cannot answer someone, they show up here until the crew does.</Empty>
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
