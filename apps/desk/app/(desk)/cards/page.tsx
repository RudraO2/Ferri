import Link from "next/link";
import { ago, cardLists, fmt } from "@/lib/data";
import { answerCard, sendReply, skipCard, skipReply } from "../actions";
import { AutoRefresh } from "../refresh";
import { Empty, Note, PageHead, Section } from "../ui";

export default async function CardsPage({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  const { note } = await searchParams;
  const c = await cardLists();
  return (
    <>
      <AutoRefresh seconds={8} />
      <PageHead
        title="Cards"
        sub="Questions Ferri could not answer, and replies waiting for your OK. Answers you give here go through Switch, under your name."
      />
      <Note note={note} />

      <Section title={`Waiting for an answer · ${c.openQuestions.length}`}>
        {c.openQuestions.length ? (
          <div className="space-y-3">
            {c.openQuestions.map((card) => (
              <div key={card.id} className="card p-4">
                <div className="mb-1 flex items-center gap-2">
                  <span className="badge">{card.topic}</span>
                  {card.personal ? <span className="badge">personal</span> : null}
                  <span className="text-[12px] text-zinc-400">
                    opened {ago(card.createdAt)} · for {card.ownerNames.join(", ") || "the crew"} · expires {fmt(card.expiresAt)}
                  </span>
                </div>
                <div className="text-[15px] font-medium">{card.question}</div>
                <ul className="mt-1 text-[12px] text-zinc-500">
                  {card.askers
                    .filter((a) => !a.resolution)
                    .map((a, i) => (
                      <li key={i}>
                        {a.askerName}: “{a.text}”
                      </li>
                    ))}
                </ul>
                <form action={answerCard} className="mt-3 space-y-2">
                  <input type="hidden" name="cardId" value={card.id} />
                  <textarea className="textarea" name="text" rows={2} placeholder="Your answer. It goes to everyone who asked, and is saved for next time." />
                  <div className="flex gap-2">
                    <button className="btn-primary">Send answer</button>
                    <button className="btn" formAction={skipCard}>
                      Don&apos;t answer
                    </button>
                  </div>
                </form>
              </div>
            ))}
          </div>
        ) : (
          <Empty>No open questions. Ferri knows the answers so far.</Empty>
        )}
      </Section>

      <Section title={`Replies waiting for approval · ${c.repliesWaiting.length}`}>
        {c.repliesWaiting.length ? (
          <div className="space-y-3">
            {c.repliesWaiting.map((card) => (
              <div key={card.id} className="card p-4">
                <div className="mb-1 text-[12px] text-zinc-400">Approve space · drafted {ago(card.createdAt)} · expires {fmt(card.expiresAt)}</div>
                <div className="text-[15px] font-medium">“{card.question}”</div>
                <form action={sendReply} className="mt-3 space-y-2">
                  <input type="hidden" name="cardId" value={card.id} />
                  <label className="label">Ferri&apos;s draft (edit it to send your own version)</label>
                  <textarea className="textarea font-mono text-[12.5px]" name="text" rows={4} defaultValue={card.draftText ?? ""} />
                  <div className="flex gap-2">
                    <button className="btn-primary">Send</button>
                    <button className="btn" formAction={skipReply}>
                      Don&apos;t send
                    </button>
                  </div>
                </form>
              </div>
            ))}
          </div>
        ) : (
          <Empty>No replies waiting. Spaces in Approve mode put their replies here.</Empty>
        )}
      </Section>

      <Section title="Answered">
        {c.answered.length ? (
          <div className="card divide-y divide-zinc-100">
            {c.answered.map((card) => (
              <div key={card.id} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="badge">{card.kind === "reply" ? "reply sent" : card.topic}</span>
                  <span className="text-[12px] text-zinc-400">
                    {card.answeredBy} · {card.answeredVia === "chat" ? "in chat" : card.answeredVia === "remember" ? "taught a fact" : "on the card"} · {ago(card.answeredAt)}
                  </span>
                </div>
                <div className="mt-1 text-[13px] font-medium">{card.question}</div>
                <div className="text-[13px] text-zinc-600">{card.kind === "reply" ? card.sentText : card.answerText}</div>
                {card.kind === "question" ? (
                  <div className="mt-1 text-[12px] text-zinc-500">
                    {card.askers.filter((a) => a.resolution === "answered").length} of {card.askers.length} reached
                    {card.entryId ? (
                      <>
                        {" · "}
                        <Link className="underline" href={`/knowledge/${card.entryId}`}>
                          saved entry
                        </Link>
                      </>
                    ) : card.personal ? (
                      " · personal, not saved"
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <Empty>Nothing answered yet.</Empty>
        )}
      </Section>

      <div id="unanswered" />
      <Section title={`Unanswered · ${c.unanswered.length}`}>
        {c.unanswered.length ? (
          <div className="card divide-y divide-zinc-100">
            {c.unanswered.map((card) => (
              <div key={card.id} className="px-4 py-3">
                <div className="text-[13px] font-medium">{card.question}</div>
                <div className="text-[12px] text-zinc-500">
                  expired {ago(card.updatedAt)} · {card.askers.length} asked: {card.askers.map((a) => a.askerName).join(", ")}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>No unanswered questions.</Empty>
        )}
      </Section>

      <Section title="Dismissed or not sent">
        {c.dismissed.length ? (
          <div className="card divide-y divide-zinc-100">
            {c.dismissed.map((card) => (
              <div key={card.id} className="px-4 py-3 text-[13px]">
                <span className="font-medium">{card.question}</span>
                <span className="text-zinc-500">
                  {" "}
                  · {card.kind === "reply" ? (card.status === "expired" ? "reply expired, not sent" : "reply not sent") : "not answered"}
                  {card.answeredBy ? ` · ${card.answeredBy}` : ""}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <Empty>Nothing here.</Empty>
        )}
      </Section>
    </>
  );
}
