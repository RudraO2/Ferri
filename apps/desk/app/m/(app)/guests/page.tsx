import Link from "next/link";
import { liveEvents } from "@/lib/data";
import { community, db } from "@/lib/db";
import { countsLine, guestCounts } from "@/lib/ferri";
import { SEND_CHOICES } from "@/lib/guests";
import { requirePocketUser } from "@/lib/session";
import { pocketRequestGuestSend } from "../../actions";
import { Toast } from "../bits";

/** Ask Ferri for an email to an event's guests from the phone. It still needs one OK, which can be your own. */
export default async function EmailGuests({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  const { note } = await searchParams;
  await requirePocketUser("/m/guests");
  const c = await community();
  const evs = await liveEvents(c.id);
  const counts = await Promise.all(evs.map(async (e) => ({ e, n: await guestCounts(db(), e.id) })));
  return (
    <>
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-200 bg-zinc-50/95 px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-3 backdrop-blur">
        <Link href="/m" className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 active:bg-zinc-200" aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <div className="text-[15px] font-semibold">Email guests</div>
      </header>
      <Toast note={note} />
      {evs.length ? (
        <>
          <ul className="mx-4 mt-4 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
            {counts.map(({ e, n }) => (
              <li key={e.id} className="px-4 py-3">
                <div className="text-[13px] font-medium text-zinc-500">{e.name}</div>
                <div className="mt-0.5 text-[15px]">{n.total ? countsLine(n, e.capacity) : "Nobody has registered yet"}</div>
              </li>
            ))}
          </ul>
          <form action={pocketRequestGuestSend} className="mt-4 space-y-4 px-4">
            {evs.length > 1 ? (
              <select className="input-lg" name="eventId" defaultValue={evs[0]!.id}>
                {evs.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            ) : (
              <input type="hidden" name="eventId" value={evs[0]!.id} />
            )}
            <select className="input-lg" name="what" defaultValue="reminder:going">
              {SEND_CHOICES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <textarea className="textarea-lg" name="ask" rows={4} placeholder="What it should say, like: doors open at 9:30, bring your laptop and charger." />
            <div>
              <label className="mb-1 block px-1 text-[13px] font-medium text-zinc-500">Send at (empty: once approved)</label>
              <input className="input-lg" type="datetime-local" name="when" />
            </div>
            <button className="btn-lg-primary w-full">Ask Ferri to draft it</button>
            <p className="px-1 text-[13px] text-zinc-500">
              Ferri drafts the email from what it knows about the event. Its card shows up in Needs you, and nothing goes out before one OK. Yours counts.
            </p>
          </form>
        </>
      ) : (
        <p className="mt-6 px-5 text-[14px] text-zinc-500">No live event yet.</p>
      )}
    </>
  );
}
