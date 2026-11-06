import Link from "next/link";
import { PLATFORM_LABEL, myCrew, openCards, waitedFor, type PocketCard } from "@/lib/pocket";
import { requirePocketUser } from "@/lib/session";
import { Empty, Header, Toast, Where } from "./bits";
import { PushNudge } from "./push";
import { BuilderCards } from "./builder-cards";
import { builderRequests } from "@/lib/builder";
import { SEND_KIND_LABEL } from "@/lib/ferri";
import { audienceLine } from "@/lib/guests";

export default async function NeedsYou({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  const { note } = await searchParams;
  const user = await requirePocketUser("/m");
  const [cards, me, builderAsks] = await Promise.all([openCards(user), myCrew(user), builderRequests(user).catch(() => [])]);
  const mine = cards.filter((c) => c.forMe);
  const others = cards.filter((c) => !c.forMe);
  const waitingPeople = mine.reduce((n, c) => n + (c.kind === "question" ? c.waiting.length : c.kind === "reply" || c.kind === "care" ? 1 : 0), 0);
  return (
    <>
      <Header
        title="Needs you"
        sub={
          mine.length + builderAsks.length
            ? `${mine.length + builderAsks.length} card${mine.length + builderAsks.length === 1 ? "" : "s"}${waitingPeople ? ` · ${waitingPeople} ${waitingPeople === 1 ? "person" : "people"} waiting` : ""}`
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
      <div className="mx-4 mt-3 flex justify-end gap-2">
        <Link href="/m/guests" className="btn-lg h-9 px-3 text-[14px]">
          + Email guests
        </Link>
        <Link href="/m/new" className="btn-lg h-9 px-3 text-[14px]">
          + Announce
        </Link>
      </div>
      <BuilderCards requests={builderAsks} />
      {mine.length ? (
        <div className="mt-3 space-y-3 px-4">
          {mine.map((c) => (
            <CardRow key={c.id} card={c} />
          ))}
        </div>
      ) : builderAsks.length ? null : (
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
        <span
          className={
            card.kind === "announce"
              ? "pill bg-violet-100 text-violet-800"
              : card.kind === "plan"
                ? "pill bg-emerald-100 text-emerald-800"
                : card.kind === "outreach"
                  ? "pill bg-sky-100 text-sky-800"
                  : card.kind === "care"
                    ? "pill bg-rose-100 text-rose-800"
                    : card.kind === "guests"
                      ? "pill bg-indigo-100 text-indigo-800"
                      : card.kind === "spot"
                        ? "pill bg-teal-100 text-teal-800"
                        : "pill"
          }
        >
          {card.kind === "announce"
            ? (card.announcementVersion ?? 1) > 1
              ? "announcement edit"
              : "announcement"
            : card.kind === "reply"
              ? "reply to approve"
              : card.kind === "plan"
                ? "plan decision"
                : card.kind === "outreach"
                  ? "email to approve"
                  : card.kind === "guests"
                    ? "email to guests"
                    : card.kind === "spot"
                      ? "spot to offer"
                      : card.topic}
        </span>
        {card.kind === "care" && card.care?.urgent ? <span className="pill bg-red-600 text-white">urgent</span> : null}
        {card.escalatedAt ? (
          <span className="pill bg-amber-100 text-amber-800">escalated</span>
        ) : card.nudgedAt ? (
          <span className="pill bg-sky-100 text-sky-800">nudged</span>
        ) : null}
        <span className="ml-auto text-[12px] text-zinc-400">{waitedFor(card.createdAt)}</span>
      </div>
      <div className="mt-2 text-[16px] leading-snug font-medium">{card.question}</div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {card.kind === "announce" ? (
          <span className="text-[12.5px] text-zinc-500">
            to {card.announcement?.targets.length ?? 0} spaces · {[...new Set((card.announcement?.targets ?? []).map((t) => PLATFORM_LABEL[t.platform ?? ""] ?? t.platform ?? "Switch"))].join(", ")}
          </span>
        ) : card.kind === "reply" ? (
          <Where platform={card.target?.platform} space={card.target?.name} />
        ) : card.kind === "plan" ? (
          <span className="text-[12.5px] text-zinc-500">{card.topic} · from the agenda draft</span>
        ) : card.kind === "outreach" ? (
          <span className="text-[12.5px] text-zinc-500">from partners@rudratechie.xyz</span>
        ) : card.kind === "guests" ? (
          <span className="text-[12.5px] text-zinc-500">
            {card.guestCard?.send ? `${SEND_KIND_LABEL[card.guestCard.send.kind] ?? card.guestCard.send.kind} · ` : ""}to {audienceLine(card.guestCard?.send?.audience ?? "going", card.guestCard?.count ?? null)}
          </span>
        ) : card.kind === "spot" ? (
          <span className="text-[12.5px] text-zinc-500">{card.guestCard?.guest ? `for ${card.guestCard.guest.name}, on the waitlist` : "for the next person on the waitlist"}</span>
        ) : card.kind === "care" ? (
          card.care ? (
            <>
              <Where platform={card.care.platform} space={card.care.spaceName} />
              <span className="text-[12.5px] text-zinc-500">{card.care.personName}</span>
            </>
          ) : (
            <span className="text-[12.5px] text-zinc-500">a member needs the crew</span>
          )
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
