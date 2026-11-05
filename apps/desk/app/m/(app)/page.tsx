import Link from "next/link";
import { myCrew, openCards, waitedFor, type PocketCard } from "@/lib/pocket";
import { requirePocketUser } from "@/lib/session";
import { Empty, Header, Toast, Where } from "./bits";
import { PushNudge } from "./push";

export default async function NeedsYou({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  const { note } = await searchParams;
  const user = await requirePocketUser("/m");
  const [cards, me] = await Promise.all([openCards(user), myCrew(user)]);
  const mine = cards.filter((c) => c.forMe);
  const others = cards.filter((c) => !c.forMe);
  const waitingPeople = mine.reduce((n, c) => n + (c.kind === "reply" ? 1 : c.waiting.length), 0);
  return (
    <>
      <Header
        title="Needs you"
        sub={
          mine.length
            ? `${mine.length} card${mine.length === 1 ? "" : "s"} · ${waitingPeople} ${waitingPeople === 1 ? "person" : "people"} waiting`
            : `Hi ${me[0]?.name ?? user.name}`
        }
      />
      <Toast note={note} />
      {!me.length ? (
        <Link href="/m/me" className="mx-4 mt-3 block rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[14px] text-amber-800">
          Tell Pocket who you are on the crew, so it only buzzes you for your cards. →
        </Link>
      ) : null}
      <PushNudge />
      {mine.length ? (
        <div className="mt-3 space-y-3 px-4">
          {mine.map((c) => (
            <CardRow key={c.id} card={c} />
          ))}
        </div>
      ) : (
        <Empty title="Nothing needs you">Ferri knows the answers so far. New questions for you buzz this phone.</Empty>
      )}
      {others.length ? (
        <>
          <h2 className="mt-7 px-5 text-[12px] font-semibold tracking-wide text-zinc-500 uppercase">Also open, for others</h2>
          <div className="mt-2 space-y-3 px-4 opacity-80">
            {others.map((c) => (
              <CardRow key={c.id} card={c} />
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}

function CardRow({ card }: { card: PocketCard }) {
  const first = card.waiting[0];
  const n = card.waiting.length;
  return (
    <Link href={`/m/c/${card.id}`} className="block rounded-xl border border-zinc-200 bg-white p-4 shadow-xs active:bg-zinc-50">
      <div className="flex items-center gap-2">
        <span className="pill">{card.kind === "reply" ? "reply to approve" : card.topic}</span>
        {card.escalatedAt ? (
          <span className="pill bg-amber-100 text-amber-800">escalated</span>
        ) : card.nudgedAt ? (
          <span className="pill bg-sky-100 text-sky-800">nudged</span>
        ) : null}
        <span className="ml-auto text-[12px] text-zinc-400">{waitedFor(card.createdAt)}</span>
      </div>
      <div className="mt-2 text-[16px] leading-snug font-medium">{card.question}</div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {card.kind === "reply" ? (
          <Where platform={card.target?.platform} space={card.target?.name} />
        ) : first ? (
          <>
            <Where platform={first.platform} space={first.spaceName} />
            <span className="text-[12.5px] text-zinc-500">
              {first.askerName}
              {n > 1 ? ` and ${n - 1} more` : ""}
            </span>
          </>
        ) : (
          <span className="text-[12.5px] text-zinc-500">nobody waiting any more</span>
        )}
        <span className="text-[12.5px] text-zinc-400">· {card.why}</span>
      </div>
    </Link>
  );
}
