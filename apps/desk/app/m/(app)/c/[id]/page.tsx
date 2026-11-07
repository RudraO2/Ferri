import Link from "next/link";
import { ChevronLeft, Send } from "lucide-react";
import { FerriAvatar } from "@/components/ferri";
import { notFound } from "next/navigation";
import { caseView } from "@/lib/care";
import { myCrew, pocketCard, waitedFor } from "@/lib/pocket";
import { requirePocketUser } from "@/lib/session";
import { pocketAnswer, pocketDontOffer, pocketOfferSpot, pocketSkip } from "../../../actions";
import { Toast, Where } from "../../bits";
import { CareScreen } from "../../care-case";
import { community } from "@/lib/db";
import { SEND_KIND_LABEL, formatWhen, translationsFrom } from "@/lib/ferri";
import { audienceLine } from "@/lib/guests";
import { EMAIL_OFF_NOTE, outreachMailbox } from "@/lib/contacts";
import { AnnounceActions } from "./announce-actions";
import { GuestSendActions } from "./guest-actions";
import { PlanActions } from "./plan-actions";
import { ReplyActions } from "./reply-actions";
import { WrapActions } from "./wrap-actions";
import { SocialActions } from "./social-actions";
import { DeskActions } from "./desk-actions";

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

export default async function CardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ note?: string }> }) {
  const { id } = await params;
  const { note } = await searchParams;
  const user = await requirePocketUser(`/m/c/${id}`);
  const card = await pocketCard(user, id);
  if (!card) notFound();
  // Care cards (spec 16): the case itself, with its actions (they answer this card while it is open).
  if (card.kind === "care" && card.careCaseId) {
    const [v, me] = await Promise.all([caseView(card.careCaseId), myCrew(user)]);
    if (v) return <CareScreen v={v} title={card.topic} backHref="/m" here={`/m/c/${id}`} done="/m" note={note} myIds={new Set(me.map((m) => m.id))} full={false} />;
  }
  const open = card.status === "open";
  const a = card.announcement;
  const edit = card.kind === "announce" && (card.announcementVersion ?? 1) > 1;
  const tz = (await community()).timezone;
  const title =
    card.kind === "announce"
      ? edit
        ? "Announcement edit"
        : "Announcement"
      : card.kind === "reply"
        ? "Reply waiting for your OK"
        : card.kind === "plan"
          ? "Plan decision"
          : card.kind === "outreach"
            ? "Email waiting for your OK"
          : card.kind === "guests"
            ? "Email to guests"
          : card.kind === "spot"
            ? "Spot to offer"
          : card.kind === "wrap"
            ? "Close the event"
          : card.kind === "desk"
            ? "Desks to make"
          : card.kind === "social"
            ? "Social post"
          : `${card.topic.charAt(0).toUpperCase()}${card.topic.slice(1)} question`;
  const gc = card.guestCard;
  return (
    <>
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-200 bg-zinc-50/90 px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-3 backdrop-blur">
        <Link href="/m" className="-ml-1 flex h-10 w-10 items-center justify-center rounded-full text-zinc-700 active:bg-zinc-200" aria-label="Back">
          <ChevronLeft size={22} aria-hidden />
        </Link>
        <div className="text-[15px] font-semibold">{title}</div>
        <span className="ml-auto rounded-full bg-amber-50 px-2 py-0.5 text-[12px] font-semibold text-amber-700">{waitedFor(card.createdAt)}</span>
      </header>
      <Toast note={note} />
      <div className="px-5 pt-5">
        <div className="font-display text-[26px] leading-[1.15] font-extrabold tracking-[-0.03em] text-zinc-900">{card.question}</div>
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
            <ul className="mt-2 space-y-2.5">
              {card.waiting.map((w) => (
                <li key={w.questionId} className="flex items-start gap-2.5">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[14px] font-semibold text-zinc-800">
                    {w.askerName.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 px-1">
                      <span className="text-[13.5px] font-semibold text-zinc-900">{w.askerName}</span>
                      <span className="text-[12px] text-zinc-400">{waitedFor(w.askedAt)}</span>
                    </div>
                    <div className="mt-1 rounded-[18px] rounded-tl-[6px] border border-zinc-200 bg-white px-3.5 py-2.5 text-[15px] leading-snug text-zinc-800">{w.text}</div>
                    <div className="mt-1 px-1">
                      <Where platform={w.platform} space={w.spaceName} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-start gap-2.5">
              <FerriAvatar size={36} pose="thinking" />
              <div className="rounded-[18px] rounded-tl-[6px] bg-brand-soft px-3.5 py-2.5 text-[14px] leading-snug text-zinc-800">
                <b className="font-semibold">Ferri</b> told {card.waiting.length === 1 ? "them" : `all ${card.waiting.length}`}: “Checking with the team, back shortly.”
              </div>
            </div>
          </section>
          <form action={pocketAnswer} className="mt-5 space-y-3 px-4">
            <input type="hidden" name="cardId" value={card.id} />
            <label htmlFor="answer" className="sr-only">
              Your answer
            </label>
            <textarea
              id="answer"
              className="textarea-lg min-h-[132px]"
              name="text"
              rows={4}
              required
              placeholder={
                card.personal ? "Your answer. It goes to this person only." : "Your answer. It goes to everyone who asked, and Ferri saves it for next time."
              }
            />
            <button className="btn-lg-primary h-14 w-full text-[16px]">
              <Send size={18} aria-hidden />
              {card.waiting.length ? `Send to ${people(card.waiting.length)}` : "Send answer"}
            </button>
            <button className="btn-lg w-full" formAction={pocketSkip} formNoValidate>
              Don&apos;t answer this one
            </button>
          </form>
        </>
      ) : null}

      {open && card.kind === "announce" ? (
        <section className="mt-4 px-4">
          <h2 className="px-1 text-[12px] font-semibold tracking-wide text-zinc-500 uppercase">
            Goes to · {a?.targets.length ?? 0} {a?.targets.length === 1 ? "space" : "spaces"}
          </h2>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 px-1">
            {(a?.targets ?? []).map((t) => (
              <li key={t.spaceId}>
                <Where platform={t.platform} space={t.name} />
              </li>
            ))}
          </ul>
          <p className="mt-2 px-1 text-[13px] text-zinc-500">
            {edit
              ? "Approving it edits the post in place everywhere it went."
              : a?.scheduledAt
                ? `Goes out at ${formatWhen(a.scheduledAt, tz)}.`
                : "Goes out as soon as it is approved."}
            {a?.origin === "decision" ? " Ferri spotted this decision in the crew chat." : ""}
            {!edit && a?.media?.length ? ` It goes out with the image ${a.media.map((m) => m.filename).join(", ")}.` : ""}
          </p>
          {edit && a?.text ? (
            <div className="mt-3 px-1 text-[13px] text-zinc-400">
              Now it says: <span className="line-through decoration-zinc-300">{a.text}</span>
            </div>
          ) : null}
          {/* Spec 21: a space with its own language gets this version; the one OK covers it too. */}
          {Object.values(translationsFrom(card.payload, card.draftText ?? "")).map((t) => (
            <div key={t.language} className="mt-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-[14px] whitespace-pre-wrap text-zinc-700">
              <div className="mb-1 text-[12px] font-semibold tracking-wide text-zinc-500 uppercase">In {t.language}</div>
              {t.text}
            </div>
          ))}
          <AnnounceActions cardId={card.id} draft={card.draftText ?? ""} edit={edit} scheduled={!!a?.scheduledAt && !edit} />
        </section>
      ) : null}

      {open && card.kind === "plan" ? (
        <section className="mt-4 px-4">
          <p className="px-1 text-[13px] text-zinc-500">Ferri proposed this in the agenda draft. Nothing is decided until someone on the crew confirms it.</p>
          <PlanActions cardId={card.id} proposal={card.draftText ?? ""} />
        </section>
      ) : null}

      {open && card.kind === "outreach" ? (
        <section className="mt-4 px-4">
          <p className="px-1 text-[13px] text-zinc-500">
            {outreachMailbox()
              ? `Goes out from ${outreachMailbox()} as soon as you send it. Their reply comes back to Ferri, which tells the crew.`
              : EMAIL_OFF_NOTE}
          </p>
          <ReplyActions cardId={card.id} draft={card.draftText ?? ""} />
        </section>
      ) : null}

      {open && card.kind === "guests" ? (
        <section className="mt-4 px-4">
          <p className="px-1 text-[13px] text-zinc-500">
            {gc?.send ? `A ${SEND_KIND_LABEL[gc.send.kind] ?? gc.send.kind} to ` : "Goes to "}
            {audienceLine(gc?.send?.audience ?? "going", gc?.count ?? null)}
            {gc?.eventName ? ` of ${gc.eventName}` : ""}.{" "}
            {gc?.send?.scheduledAt ? `It goes out at ${formatWhen(gc.send.scheduledAt, tz)}.` : "It goes out as soon as you send it."} Each guest gets their own copy with their
            first name and their RSVP link.
            {gc?.send ? (gc.send.origin === "ferri" ? " Ferri suggested it." : ` Asked by ${gc.send.requestedBy}.`) : ""}
          </p>
          {gc?.send?.subject ? (
            <div className="mt-3 px-1 text-[14px]">
              <span className="text-zinc-500">Subject: </span>
              <span className="font-medium">{gc.send.subject}</span>
            </div>
          ) : null}
          <GuestSendActions cardId={card.id} draft={card.draftText ?? ""} />
        </section>
      ) : null}

      {open && card.kind === "spot" ? (
        <section className="mt-4 px-4">
          {gc?.guest ? (
            <div className="px-1 text-[13px] text-zinc-500">
              {gc.guest.name} · {gc.guest.email}
              {gc.eventName ? ` · ${gc.eventName}` : ""}
            </div>
          ) : null}
          {card.draftText ? <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-4 text-[15px] leading-relaxed whitespace-pre-wrap">{card.draftText}</div> : null}
          <form action={pocketOfferSpot} className="mt-3 space-y-3">
            <input type="hidden" name="cardId" value={card.id} />
            <button className="btn-lg-primary w-full">Offer it</button>
            <button className="btn-lg w-full" formAction={pocketDontOffer}>
              Don&apos;t offer
            </button>
          </form>
        </section>
      ) : null}

      {open && card.kind === "social" ? (
        <section className="mt-4 px-4">
          <SocialActions cardId={card.id} />
        </section>
      ) : null}

      {open && card.kind === "wrap" ? (
        <section className="mt-4 px-4">
          <WrapActions cardId={card.id} payload={card.payload} what={card.draftText} />
        </section>
      ) : null}

      {open && card.kind === "desk" ? (
        <section className="mt-4 px-4">
          <DeskActions cardId={card.id} payload={card.payload} what={card.draftText} />
        </section>
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
              {card.kind === "plan"
                ? card.status === "answered"
                  ? `Confirmed${card.answeredBy ? ` by ${card.answeredBy}` : ""}`
                  : card.status === "dismissed"
                    ? `Dropped${card.answeredBy ? ` · ${card.answeredBy}` : ""}`
                    : card.status === "expired"
                      ? "Not confirmed in time; still open in the plan"
                      : "Replaced by a newer draft"
                : card.kind === "announce"
                ? card.status === "answered"
                  ? `Approved${card.answeredBy ? ` by ${card.answeredBy}` : ""}`
                  : card.status === "dismissed"
                    ? `Not posted${card.answeredBy ? ` · ${card.answeredBy}` : ""}`
                    : card.status === "expired"
                      ? "Not approved in time"
                      : "Replaced by a newer version"
                : card.kind === "guests"
                ? card.status === "answered"
                  ? `Approved${card.answeredBy ? ` by ${card.answeredBy}` : ""}`
                  : card.status === "dismissed"
                    ? `Not sent${card.answeredBy ? ` · ${card.answeredBy}` : ""}`
                    : card.status === "expired"
                      ? "Not approved in time"
                      : "Closed"
                : card.kind === "spot"
                ? card.status === "answered"
                  ? `Offered${card.answeredBy ? ` by ${card.answeredBy}` : ""}`
                  : card.status === "dismissed"
                    ? `Not offered${card.answeredBy ? ` · ${card.answeredBy}` : ""}`
                    : card.status === "expired"
                      ? "Not answered in time"
                      : "Closed"
                : card.kind === "wrap"
                ? card.status === "answered"
                  ? `${card.answerText ?? "Closed"}${card.answeredBy ? ` · ${card.answeredBy}` : ""}`
                  : card.status === "dismissed"
                    ? `Not yet${card.answeredBy ? ` · ${card.answeredBy}` : ""}`
                    : card.status === "expired"
                      ? "Nobody closed it in time; the event stays open"
                      : "Closed with the event"
                : card.kind === "desk"
                ? card.status === "answered"
                  ? `Made${card.answeredBy ? ` · approved by ${card.answeredBy}` : ""}`
                  : card.status === "dismissed"
                    ? `Not made${card.answeredBy ? ` · ${card.answeredBy}` : ""}`
                    : card.status === "expired"
                      ? "Nobody answered in time; nothing was made"
                      : "Closed"
                : card.status === "answered"
                ? `${card.kind === "reply" ? "Reply sent" : card.kind === "outreach" ? "Email sent" : "Answered"}${card.answeredBy ? ` by ${card.answeredBy}` : ""}`
                : card.status === "dismissed"
                  ? `${card.kind === "reply" || card.kind === "outreach" ? "Not sent" : "Not answered"}${card.answeredBy ? ` · ${card.answeredBy}` : ""}`
                  : card.status === "expired"
                    ? "Expired without an answer"
                    : "Closed"}
            </div>
            {card.kind === "announce" ? (
              <>
                <div className="mt-1 whitespace-pre-wrap text-zinc-700">{card.answerText ?? card.draftText}</div>
                {a?.posts.length ? (
                  <ul className="mt-3 space-y-1">
                    {a.posts.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2">
                        <Where platform={p.platform} space={p.spaceName} />
                        <span className="text-[12px] text-zinc-400">
                          {p.status === "edited" ? "edited in place" : p.status === "reposted" ? "posted as an update" : p.status} · v{p.version}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : card.kind === "reply" ? (
              card.sentText ? <div className="mt-1 text-zinc-700">{card.sentText}</div> : null
            ) : card.kind === "outreach" || card.kind === "guests" ? (
              <div className="mt-1 whitespace-pre-wrap text-zinc-700">{card.answerText ?? card.draftText}</div>
            ) : card.kind === "spot" ? null : card.answerText ? (
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
