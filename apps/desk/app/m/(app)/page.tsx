import Link from "next/link";
import { ChevronRight, Mail, Megaphone } from "lucide-react";
import { myCrew, openCards, shortSpace, waitedFor, type PocketCard } from "@/lib/pocket";
import { requirePocketUser } from "@/lib/session";
import { PlatformLogo } from "@/components/platform";
import { Empty, Header, Toast } from "./bits";
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
        <Link href="/m/me" className="mx-4 mt-2 flex min-h-11 items-center gap-2 rounded-[14px] bg-amber-50 px-3.5 py-2 text-[14px] text-amber-800">
          <span className="flex-1">Tell Pocket who you are, so it buzzes you only for your cards.</span>
          <ChevronRight size={17} className="shrink-0" aria-hidden />
        </Link>
      ) : null}
      {/* A read-only guest cannot save a push subscription (every write is refused). */}
      {user.readonly ? null : <PushNudge />}
      <BuilderCards requests={builderAsks} />
      {mine.length ? (
        <div className="mt-3 space-y-2.5 px-4">
          {mine.map((c) => (
            <CardRow key={c.id} card={c} />
          ))}
        </div>
      ) : builderAsks.length ? null : (
        <Empty title="Nothing needs you" pose="sleep">
          New questions for you buzz this phone.
        </Empty>
      )}
      {others.length ? (
        <details className="group mt-6 px-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 px-1 text-[14px] font-semibold text-zinc-500 [&::-webkit-details-marker]:hidden">
            <ChevronRight size={16} className="transition group-open:rotate-90" aria-hidden />
            Open for others
            <span className="font-medium text-zinc-400 tabular-nums">{others.length}</span>
          </summary>
          <div className="mt-2 space-y-2.5">
            {others.map((c) => (
              <CardRow key={c.id} card={c} others />
            ))}
          </div>
        </details>
      ) : null}
      <div className="mt-6 flex items-center justify-center gap-1 px-4">
        <Link href="/m/new" className="inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-[14.5px] font-medium text-zinc-600 active:bg-zinc-200">
          <Megaphone size={16} aria-hidden /> Announce
        </Link>
        <span className="text-zinc-300" aria-hidden>
          ·
        </span>
        <Link href="/m/guests" className="inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-[14.5px] font-medium text-zinc-600 active:bg-zinc-200">
          <Mail size={16} aria-hidden /> Email guests
        </Link>
      </div>
    </>
  );
}

const KIND_LABEL: Record<string, string> = {
  reply: "Reply to approve",
  plan: "Plan decision",
  outreach: "Email to approve",
  guests: "Email to guests",
  spot: "Spot to offer",
  care: "Care",
  wrap: "Close the event",
  desk: "Desks to make",
  social: "Social post",
};

/** One line of who and where: "[logo] Kabir +1 · build-night", or the card's kind and its detail. */
function meta(card: PocketCard): { platform?: string | null; text: string } {
  const first = card.waiting[0];
  const n = card.waiting.length;
  switch (card.kind) {
    case "question":
      return first
        ? { platform: first.platform, text: `${first.askerName}${n > 1 ? ` +${n - 1}` : ""} · ${shortSpace(first.spaceName)}` }
        : { text: "Nobody waiting any more" };
    case "announce":
      return {
        text: `${(card.announcementVersion ?? 1) > 1 ? "Announcement edit" : "Announcement"} · ${card.announcement?.targets.length ?? 0} spaces`,
      };
    case "reply":
      return { platform: card.target?.platform, text: `${KIND_LABEL.reply} · ${shortSpace(card.target?.name)}` };
    case "plan":
      return { text: `${KIND_LABEL.plan} · ${card.topic}` };
    case "guests":
      return {
        text: `${card.guestCard?.send ? (SEND_KIND_LABEL[card.guestCard.send.kind] ?? card.guestCard.send.kind) : KIND_LABEL.guests} · ${audienceLine(card.guestCard?.send?.audience ?? "going", card.guestCard?.count ?? null)}`,
      };
    case "spot":
      return { text: `${KIND_LABEL.spot}${card.guestCard?.guest ? ` · ${card.guestCard.guest.name}` : ""}` };
    case "care":
      return card.care ? { platform: card.care.platform, text: `${card.care.personName} · ${shortSpace(card.care.spaceName)}` } : { text: "A member needs the crew" };
    default:
      return { text: KIND_LABEL[card.kind] ?? card.topic };
  }
}

/** A card in the list: one quiet line of who, where and how long, then the question large. */
function CardRow({ card, others }: { card: PocketCard; others?: boolean }) {
  const m = meta(card);
  const urgent = card.kind === "care" && card.care?.urgent;
  return (
    <Link
      href={`/m/c/${card.id}`}
      className="block rounded-[20px] border border-zinc-200 bg-white px-4 py-3.5 transition active:scale-[0.99] active:bg-zinc-50"
    >
      <div className="flex items-center gap-1.5 text-[13px] text-zinc-500">
        {m.platform !== undefined ? <PlatformLogo platform={m.platform} size={14} /> : null}
        <span className="min-w-0 truncate">{m.text}</span>
        <span className={`ml-auto shrink-0 pl-2 font-medium ${card.kind === "question" || urgent ? "text-amber-700" : "text-zinc-500"}`}>
          {urgent ? "urgent · " : card.escalatedAt ? "escalated · " : ""}
          {waitedFor(card.createdAt)}
        </span>
      </div>
      <div className="mt-1.5 font-display text-[18px] leading-snug font-bold tracking-[-0.02em] text-zinc-900">{card.question}</div>
      {others && card.owners.length ? <div className="mt-1 text-[12.5px] text-zinc-500">for {card.owners.join(", ")}</div> : null}
    </Link>
  );
}
