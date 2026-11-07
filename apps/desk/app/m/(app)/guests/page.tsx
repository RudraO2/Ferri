import { liveEvents } from "@/lib/data";
import { community, db } from "@/lib/db";
import { countsLine, guestCounts } from "@/lib/ferri";
import { SEND_CHOICES } from "@/lib/guests";
import { requirePocketUser } from "@/lib/session";
import { pocketRequestGuestSend } from "../../actions";
import { BackHeader, Empty, Toast } from "../bits";

/** Ask Ferri for an email to an event's guests from the phone. It still needs one OK, which can be your own. */
export default async function EmailGuests({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  const { note } = await searchParams;
  await requirePocketUser("/m/guests");
  const c = await community();
  const evs = await liveEvents(c.id);
  const counts = await Promise.all(evs.map(async (e) => ({ e, n: await guestCounts(db(), e.id) })));
  return (
    <>
      <BackHeader href="/m" title="Email guests" />
      <Toast note={note} />
      {evs.length ? (
        <>
          <div className="mt-2 space-y-1 px-5">
            {counts.map(({ e, n }) => (
              <p key={e.id} className="text-[14px] text-zinc-600">
                {evs.length > 1 ? <span className="font-medium text-zinc-900">{e.name}: </span> : null}
                {n.total ? countsLine(n, e.capacity) : "Nobody has registered yet"}
              </p>
            ))}
          </div>
          <form action={pocketRequestGuestSend} className="mt-4 space-y-4 px-4">
            {evs.length > 1 ? (
              <div>
                <label htmlFor="eventId" className="mb-1 block px-1 text-[13px] font-medium text-zinc-500">
                  Event
                </label>
                <select id="eventId" className="input-lg" name="eventId" defaultValue={evs[0]!.id}>
                  {evs.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <input type="hidden" name="eventId" value={evs[0]!.id} />
            )}
            <div>
              <label htmlFor="what" className="mb-1 block px-1 text-[13px] font-medium text-zinc-500">
                What to send
              </label>
              <select id="what" className="input-lg" name="what" defaultValue="reminder:going">
                {SEND_CHOICES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ask" className="mb-1 block px-1 text-[13px] font-medium text-zinc-500">
                What it should say (optional)
              </label>
              <textarea id="ask" className="textarea-lg" name="ask" rows={4} placeholder="Doors open at 9:30, bring your laptop and charger." />
            </div>
            <details className="group">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center px-1 text-[14px] font-medium text-zinc-600 [&::-webkit-details-marker]:hidden">
                Schedule it for later
              </summary>
              <label htmlFor="when" className="mb-1 block px-1 text-[13px] font-medium text-zinc-500">
                Send at (empty: once approved)
              </label>
              <input id="when" className="input-lg" type="datetime-local" name="when" />
            </details>
            <button className="btn-lg-primary h-14 w-full text-[16px]">Ask Ferri to draft it</button>
            <p className="px-1 text-center text-[13px] text-zinc-500">Nothing goes out before one OK. Yours counts.</p>
          </form>
        </>
      ) : (
        <Empty title="No live event yet" pose="ticket" />
      )}
    </>
  );
}
