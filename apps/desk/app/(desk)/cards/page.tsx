import Link from "next/link";
import { ago, cardLists, fmt, spacesWithSettings } from "@/lib/data";
import { community } from "@/lib/db";
import { shortSpace } from "@/lib/pocket";
import { PlatformLogo, platformName } from "@/components/platform";
import { answerCard, sendReply, skipCard, skipReply } from "../actions";
import { AutoRefresh } from "../refresh";
import { Empty, Fold, Note, PageHead, Section } from "../ui";

export default async function CardsPage({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  const { note } = await searchParams;
  const [c, spaces] = await Promise.all([cardLists(), community().then((x) => spacesWithSettings(x.id))]);
  const spaceByRoom = new Map(spaces.map((sp) => [sp.switchRoomId, sp]));
  const nothingWaiting = !c.openQuestions.length && !c.repliesWaiting.length;
  return (
    <>
      <AutoRefresh seconds={8} />
      <PageHead
        title="Cards"
        sub="Questions Ferri could not answer. One answer reaches everyone who asked."
        about={
          <>
            <p>Your answer goes out through Switch under your name, to every person who asked, on their own app. It is saved, so Ferri answers the next person alone.</p>
            <p>Spaces in Approve mode also put Ferri&apos;s drafted replies here for your OK.</p>
          </>
        }
      />
      <Note note={note} />

      {nothingWaiting ? (
        <div className="mb-10">
          <Empty pose="party" title="All caught up">
            Nobody is waiting. When Ferri does not know an answer, the question lands here and in Pocket.
          </Empty>
        </div>
      ) : null}

      {c.openQuestions.length ? (
        <Section title="Waiting for an answer" count={c.openQuestions.length}>
          <div className="space-y-4">
            {c.openQuestions.map((card) => {
              const waiting = card.askers.filter((a) => !a.resolution);
              return (
                <article key={card.id} className="card p-5 sm:p-6">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-zinc-500">
                    <span>{card.topic}</span>
                    <span aria-hidden>·</span>
                    <span>for {card.ownerNames.join(", ") || "the crew"}</span>
                    {card.personal ? (
                      <>
                        <span aria-hidden>·</span>
                        <span>personal</span>
                      </>
                    ) : null}
                    <span className="ml-auto font-medium text-amber-700" title={`Expires ${fmt(card.expiresAt)}`}>
                      waiting {ago(card.createdAt).replace(" ago", "")}
                    </span>
                  </div>
                  <h3 className="mt-2 font-display text-[21px] leading-snug font-extrabold tracking-[-0.02em] text-zinc-900">{card.question}</h3>
                  <ul className="mt-4 space-y-2.5">
                    {waiting.map((a, i) => {
                      const sp = spaceByRoom.get(a.roomId);
                      return (
                        <li key={i} className="flex items-start gap-2.5">
                          <span className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12.5px] font-semibold text-zinc-800">
                            {a.askerName.charAt(0).toUpperCase()}
                            {sp ? (
                              <span className="absolute -right-1 -bottom-1 inline-flex rounded-full bg-white p-[2px]" title={`${platformName(sp.platform)} · ${shortSpace(sp.name)}`}>
                                <PlatformLogo platform={sp.platform} size={12} />
                              </span>
                            ) : null}
                          </span>
                          <div className="min-w-0">
                            <div className="text-[12px] text-zinc-500">
                              <b className="font-semibold text-zinc-800">{a.askerName}</b>
                              {sp ? ` · ${shortSpace(sp.name)}` : ""}
                            </div>
                            <div className="mt-0.5 inline-block rounded-[14px] rounded-tl-[4px] bg-zinc-100 px-3 py-1.5 text-[13.5px] text-zinc-800">{a.text}</div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <form action={answerCard} className="mt-5 space-y-2.5">
                    <input type="hidden" name="cardId" value={card.id} />
                    <textarea
                      className="textarea"
                      name="text"
                      rows={2}
                      aria-label={`Answer to: ${card.question}`}
                      placeholder={waiting.length === 1 ? "Your answer" : `Your answer, for all ${waiting.length} people`}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <button className="btn-primary">Send answer</button>
                      <button className="h-9 rounded-full px-3 text-[13px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900" formAction={skipCard}>
                        Don&apos;t answer
                      </button>
                    </div>
                  </form>
                </article>
              );
            })}
          </div>
        </Section>
      ) : null}

      {c.repliesWaiting.length ? (
        <Section title="Replies waiting for your OK" count={c.repliesWaiting.length}>
          <div className="space-y-4">
            {c.repliesWaiting.map((card) => (
              <article key={card.id} className="card p-5">
                <div className="text-[12.5px] text-zinc-500" title={`Expires ${fmt(card.expiresAt)}`}>
                  Approve space · drafted {ago(card.createdAt)}
                </div>
                <h3 className="mt-1 text-[16px] font-semibold text-zinc-900">“{card.question}”</h3>
                <form action={sendReply} className="mt-3 space-y-2.5">
                  <input type="hidden" name="cardId" value={card.id} />
                  <label className="label" htmlFor={`reply-${card.id}`}>
                    Ferri&apos;s draft, edit it if you like
                  </label>
                  <textarea id={`reply-${card.id}`} className="textarea" name="text" rows={4} defaultValue={card.draftText ?? ""} />
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-primary">Send</button>
                    <button className="h-9 rounded-full px-3 text-[13px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900" formAction={skipReply}>
                      Don&apos;t send
                    </button>
                  </div>
                </form>
              </article>
            ))}
          </div>
        </Section>
      ) : null}

      <Fold title="Answered" count={c.answered.length} className="mb-2">
        {c.answered.length ? (
          <ul className="card-flat divide-y divide-zinc-100">
            {c.answered.map((card) => (
              <li key={card.id} className="px-4 py-3">
                <div className="text-[13.5px] font-medium text-zinc-900">{card.question}</div>
                <div className="mt-0.5 text-[13px] text-zinc-600">{card.kind === "reply" ? card.sentText : card.answerText}</div>
                <div className="mt-1 text-[12px] text-zinc-500">
                  {card.answeredBy} · {card.answeredVia === "chat" ? "in chat" : card.answeredVia === "remember" ? "taught a fact" : card.kind === "reply" ? "reply sent" : "on the card"} · {ago(card.answeredAt)}
                  {card.kind === "question" ? ` · reached ${card.askers.filter((a) => a.resolution === "answered").length} of ${card.askers.length}` : ""}
                  {card.kind === "question" && card.entryId ? (
                    <>
                      {" · "}
                      <Link className="underline hover:text-zinc-900" href={`/knowledge/${card.entryId}`}>
                        saved entry
                      </Link>
                    </>
                  ) : card.kind === "question" && card.personal ? (
                    " · personal, not saved"
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty quiet>Nothing answered yet.</Empty>
        )}
      </Fold>

      <Fold title="Not answered" count={c.unanswered.length + c.dismissed.length} className="mb-10">
        <div id="unanswered" />
        {c.unanswered.length || c.dismissed.length ? (
          <ul className="card-flat divide-y divide-zinc-100">
            {c.unanswered.map((card) => (
              <li key={card.id} className="px-4 py-3">
                <div className="text-[13.5px] font-medium text-zinc-900">{card.question}</div>
                <div className="mt-0.5 text-[12px] text-zinc-500">
                  expired {ago(card.updatedAt)} · asked by {card.askers.map((a) => a.askerName).join(", ")}
                </div>
              </li>
            ))}
            {c.dismissed.map((card) => (
              <li key={card.id} className="px-4 py-3">
                <div className="text-[13.5px] font-medium text-zinc-900">{card.question}</div>
                <div className="mt-0.5 text-[12px] text-zinc-500">
                  {card.kind === "reply" ? (card.status === "expired" ? "reply expired, not sent" : "reply not sent") : "not answered"}
                  {card.answeredBy ? ` · ${card.answeredBy}` : ""}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty quiet>Every question got an answer.</Empty>
        )}
      </Fold>
    </>
  );
}
