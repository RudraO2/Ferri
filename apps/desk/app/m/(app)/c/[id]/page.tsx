import Link from "next/link";
import { notFound } from "next/navigation";
import { pocketCard, waitedFor } from "@/lib/pocket";
import { requirePocketUser } from "@/lib/session";
import { pocketAnswer, pocketSkip } from "../../../actions";
import { Toast, Where } from "../../bits";
import { ReplyActions } from "./reply-actions";

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

export default async function CardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ note?: string }> }) {
  const { id } = await params;
  const { note } = await searchParams;
  const user = await requirePocketUser(`/m/c/${id}`);
  const card = await pocketCard(user, id);
  if (!card) notFound();
  const open = card.status === "open";
  const title = card.kind === "reply" ? "Reply waiting for your OK" : `${card.topic.charAt(0).toUpperCase()}${card.topic.slice(1)} question`;
  return (
    <>
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-200 bg-zinc-50/95 px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-3 backdrop-blur">
        <Link href="/m" className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 active:bg-zinc-200" aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <div className="text-[15px] font-semibold">{title}</div>
        <span className="ml-auto text-[12px] text-zinc-400">{waitedFor(card.createdAt)}</span>
      </header>
      <Toast note={note} />
      <div className="px-5 pt-4">
        <div className="text-[20px] leading-snug font-semibold tracking-tight">{card.question}</div>
        {open ? (
          <div className="mt-2 text-[13px] text-zinc-500">
            For {card.owners.join(", ") || "the crew"}
            {card.escalatedAt ? " · escalated to everyone" : card.nudgedAt ? " · nudged" : ""}
          </div>
        ) : null}
      </div>

      {open && card.kind === "question" ? (
        <>
          <section className="mt-4 px-4">
            <h2 className="px-1 text-[12px] font-semibold tracking-wide text-zinc-500 uppercase">Waiting · {people(card.waiting.length)}</h2>
            <ul className="mt-2 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
              {card.waiting.map((w) => (
                <li key={w.questionId} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[14px] font-medium">{w.askerName}</span>
                    <span className="text-[12px] text-zinc-400">{waitedFor(w.askedAt)}</span>
                  </div>
                  <div className="mt-0.5 text-[14px] text-zinc-700">“{w.text}”</div>
                  <div className="mt-1">
                    <Where platform={w.platform} space={w.spaceName} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <form action={pocketAnswer} className="mt-5 space-y-3 px-4">
            <input type="hidden" name="cardId" value={card.id} />
            <textarea
              className="textarea-lg"
              name="text"
              rows={4}
              required
              placeholder={
                card.personal ? "Your answer. It goes to this person only." : "Your answer. It goes to everyone who asked, and Ferri saves it for next time."
              }
            />
            <button className="btn-lg-primary w-full">{card.waiting.length ? `Send answer to ${people(card.waiting.length)}` : "Send answer"}</button>
            <button className="btn-lg w-full" formAction={pocketSkip} formNoValidate>
              Don&apos;t answer this one
            </button>
          </form>
        </>
      ) : null}

      {open && card.kind === "reply" ? (
        <section className="mt-4 px-4">
          <div className="px-1">
            <Where platform={card.target?.platform} space={card.target?.name} />
          </div>
          <ReplyActions cardId={card.id} draft={card.draftText ?? ""} />
        </section>
      ) : null}

      {!open ? (
        <section className="mt-4 px-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 text-[14px]">
            <div className="font-medium">
              {card.status === "answered"
                ? `${card.kind === "reply" ? "Reply sent" : "Answered"}${card.answeredBy ? ` by ${card.answeredBy}` : ""}`
                : card.status === "dismissed"
                  ? `${card.kind === "reply" ? "Not sent" : "Not answered"}${card.answeredBy ? ` · ${card.answeredBy}` : ""}`
                  : card.status === "expired"
                    ? "Expired without an answer"
                    : "Closed"}
            </div>
            {card.kind === "reply" ? (
              card.sentText ? <div className="mt-1 text-zinc-700">{card.sentText}</div> : null
            ) : card.answerText ? (
              <div className="mt-1 text-zinc-700">{card.answerText}</div>
            ) : null}
            {"asked" in card && card.asked.length ? (
              <div className="mt-2 text-[12.5px] text-zinc-500">
                {card.asked.filter((a) => a.resolution === "answered").length} of {people(card.asked.length)} reached
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </>
  );
}
