import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { guestFirstName } from "@/lib/ferri";
import { RSVP_STATES, deadline, eventWhen, rsvpGuest, rsvpState, type RsvpAnswer, type RsvpState } from "@/lib/rsvp";
import { answerRsvp } from "../actions";
import { Ferri } from "@/components/ferri";

export const dynamic = "force-dynamic";

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#fbf7f0" };

type Params = { params: Promise<{ code: string }> };
type Search = { searchParams: Promise<{ done?: string; was?: string; step?: string; changed?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const row = await rsvpGuest((await params).code);
  return { title: row ? `${row.event.name}: your RSVP` : "RSVP", robots: { index: false, follow: false } };
}

/** What we tell the guest after their answer, by what they answered and where they stood. */
function thanks(answer: RsvpAnswer, was: RsvpState, first: string): { title: string; text: string } {
  if (answer === "take") return { title: "The spot is yours", text: `Wonderful, ${first}! The spot is yours now. See you there.` };
  if (answer === "yes" && was === "not_going")
    return { title: "Thanks for telling us", text: `Thanks ${first}. We'll check if there's still room for you and email you either way.` };
  if (answer === "yes") return { title: "See you there", text: `Thanks ${first}, see you there! We've noted that you're coming.` };
  if (was === "offer") return { title: "Thanks for telling us", text: `Thanks ${first}, we'll offer the spot to the next person on the waitlist.` };
  if (was === "waitlist") return { title: "You're off the waitlist", text: `Thanks ${first}, we've taken you off the waitlist. We hope to see you at the next one.` };
  return { title: "Thanks for telling us", text: `Thanks ${first}, we've freed your spot for someone on the waitlist. We hope to see you at the next one.` };
}

const STATE_DOT: Record<RsvpState, string> = {
  going: "bg-emerald-500",
  pending: "bg-amber-500",
  offer: "bg-sky-500",
  waitlist: "bg-amber-500",
  not_going: "bg-zinc-400",
};

export default async function RsvpPage({ params, searchParams }: Params & Search) {
  const { code } = await params;
  const { done, was, step, changed } = await searchParams;
  const row = await rsvpGuest(code);
  if (!row) notFound();
  const { guest: g, event: e, communityName, timezone } = row;
  const first = guestFirstName(g.name);
  const state = rsvpState(g);
  const when = eventWhen(e.startsAt, e.endsAt, timezone);
  // A thank-you only for the answer we really recorded.
  const answered = done && done === g.rsvpAnswer && RSVP_STATES.includes(was as RsvpState) ? thanks(done as RsvpAnswer, was as RsvpState, first) : null;
  const applying = !answered && !!g.rsvpAnswer && !g.rsvpHandledAt;
  const confirmNo = step === "no" && (state === "going" || state === "pending" || state === "offer");

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-zinc-50 px-5 pt-8 pb-8">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-zinc-500">{communityName}</div>
          <h1 className="mt-1 font-display text-[32px] leading-[1.05] font-extrabold tracking-[-0.03em] text-zinc-900">{e.name}</h1>
        </div>
        <Ferri pose={answered ? "party" : "ticket"} size={92} decorative className="shrink-0" />
      </div>
      {when || e.venue ? (
        <div className="mt-4 space-y-2 text-[15px] text-zinc-700">
          {when ? (
            <div className="flex items-start gap-2.5">
              <Icon d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
              <span>{when}</span>
            </div>
          ) : null}
          {e.venue ? (
            <div className="flex items-start gap-2.5">
              <Icon d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
              <span>{e.venue}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-7 rounded-[24px] border border-zinc-200 bg-white p-5 shadow-[var(--shadow-card)]">
        {answered ? (
          <>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </div>
            <h2 className="mt-4 font-display text-[22px] font-extrabold tracking-[-0.02em]">{answered.title}</h2>
            <p className="mt-2 text-[16px] leading-relaxed text-zinc-700">{answered.text}</p>
            <Link href={`/rsvp/${g.code}`} className="mt-5 inline-block text-[14px] font-medium text-zinc-500 underline underline-offset-4">
              See where you stand
            </Link>
          </>
        ) : confirmNo ? (
          <>
            <h2 className="font-display text-[22px] font-extrabold tracking-[-0.02em]">Are you sure you can&apos;t make it?</h2>
            <p className="mt-2 text-[16px] leading-relaxed text-zinc-700">
              {state === "offer"
                ? "We'll offer the spot to the next person on the waitlist instead."
                : "We'll give your spot to someone on the waitlist. Once it's gone, we may not be able to get it back for you."}
            </p>
            <form action={answerRsvp} className="mt-5 space-y-3">
              <input type="hidden" name="code" value={g.code} />
              <input type="hidden" name="answer" value="no" />
              <button className="btn-lg w-full border-red-200 text-red-700 active:bg-red-50">{state === "offer" ? "Yes, pass it on" : "Yes, free my spot"}</button>
              <Link href={`/rsvp/${g.code}`} className="btn-lg-primary w-full">
                {state === "offer" ? "Go back" : "No, keep my spot"}
              </Link>
            </form>
          </>
        ) : (
          <>
            {changed ? (
              <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-[14px] text-amber-800">Your spot changed while this page was open. Here is where you stand now.</p>
            ) : null}
            {applying ? (
              <p className="mb-4 rounded-lg bg-sky-50 px-3 py-2 text-[14px] text-sky-800">We got your answer and are updating your spot. It takes a moment.</p>
            ) : null}
            <div className="text-[16px] text-zinc-700">Hi {first},</div>
            <div className="mt-3 flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${STATE_DOT[state]}`} />
              <h2 className="font-display text-[22px] font-extrabold tracking-[-0.02em]">
                {state === "going"
                  ? "You're going"
                  : state === "pending"
                    ? "Waiting for approval"
                    : state === "offer"
                      ? "A spot opened up for you"
                      : state === "waitlist"
                        ? "You're on the waitlist"
                        : "You've freed your spot"}
              </h2>
            </div>
            <p className="mt-2 text-[16px] leading-relaxed text-zinc-700">
              {state === "going"
                ? g.confirmedAt
                  ? "You've told us you're coming. Your spot is saved. If your plans change, tell us below so someone else can come."
                  : "Your spot is saved. Can you still make it? Tell us below, so we can plan for you."
                : state === "pending"
                  ? "The organizers still need to approve your registration. Tell us now if you're coming or if you can't make it."
                  : state === "offer"
                    ? `Someone freed their spot, and it's yours if you want it. Please answer by ${deadline(g.offerExpiresAt!, timezone)}, or it goes to the next person on the waitlist.`
                    : state === "waitlist"
                      ? "The event is full right now. If a spot opens up, we'll email you straight away."
                      : "Thanks for letting us know. Your spot can now go to someone on the waitlist."}
            </p>

            {state === "going" || state === "pending" ? (
              <div className="mt-5 space-y-3">
                <form action={answerRsvp}>
                  <input type="hidden" name="code" value={g.code} />
                  <input type="hidden" name="answer" value="yes" />
                  <button className="btn-lg-primary w-full">I&apos;m coming</button>
                </form>
                <Link href={`/rsvp/${g.code}?step=no`} className="btn-lg w-full">
                  I can&apos;t make it
                </Link>
              </div>
            ) : state === "offer" ? (
              <div className="mt-5 space-y-3">
                <form action={answerRsvp}>
                  <input type="hidden" name="code" value={g.code} />
                  <input type="hidden" name="answer" value="take" />
                  <button className="btn-lg-primary w-full">Yes, I&apos;ll take the spot</button>
                </form>
                <Link href={`/rsvp/${g.code}?step=no`} className="btn-lg w-full">
                  I can&apos;t make it
                </Link>
              </div>
            ) : state === "waitlist" ? (
              <form action={answerRsvp} className="mt-5">
                <input type="hidden" name="code" value={g.code} />
                <input type="hidden" name="answer" value="no" />
                <button className="btn-lg w-full">Take me off the waitlist</button>
              </form>
            ) : (
              <div className="mt-5 border-t border-zinc-100 pt-4">
                <div className="text-[15px] font-medium">Changed your mind?</div>
                <form action={answerRsvp} className="mt-3">
                  <input type="hidden" name="code" value={g.code} />
                  <input type="hidden" name="answer" value="yes" />
                  <button className="btn-lg w-full">I can come after all</button>
                </form>
                <p className="mt-2 text-[13.5px] text-zinc-500">It depends on whether there is still room. We&apos;ll check and email you either way.</p>
              </div>
            )}
          </>
        )}
      </div>

      <p className="mt-auto pt-10 text-center text-[12.5px] leading-relaxed text-zinc-400">
        This page is just for you, {first}. Please don&apos;t share the link.
      </p>
    </main>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg className="mt-0.5 shrink-0 text-zinc-400" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}
