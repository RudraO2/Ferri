import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { community } from "@/lib/db";
import { fmt } from "@/lib/data";
import { closedWithKits, wrapEvents } from "@/lib/wrap";
import { startEventFromKit } from "../wrap/actions";
import { Composer, Empty, Fold, Note, PageHead, Section } from "../ui";

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  const { note } = await searchParams;
  const c = await community();
  const [all, { closed, kits }] = await Promise.all([wrapEvents(c.id), closedWithKits(c.id)]);
  const live = all.filter((e) => !e.closedAt);
  return (
    <>
      <PageHead title="Events" sub="Each event has its own timeline, knowledge, crew and spaces." />
      <Note note={note} />
      <Section title="Live" count={live.length}>
        {live.length ? (
          <div className="card-flat divide-y divide-zinc-100">
            {live.map((e) => (
              <Link key={e.id} href={`/events/${e.slug}`} className="group flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-zinc-50">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-medium text-zinc-900">{e.name}</div>
                  <div className="truncate text-[12px] text-zinc-500">
                    {fmt(e.startsAt)} · {e.venue ?? "no venue yet"}
                  </div>
                </div>
                <span className="flex shrink-0 items-center gap-2 text-[12.5px] text-zinc-500 capitalize">
                  {e.stage}
                  <ChevronRight size={15} className="text-zinc-400 group-hover:text-zinc-700" aria-hidden />
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <Empty pose="ticket" title="No live events">
            Start one here, or add one in the seed folder and run pnpm kb seed.
          </Empty>
        )}
      </Section>

      <Composer label="New event">
        <form action={startEventFromKit} className="card space-y-4 p-5">
          <input type="hidden" name="back" value="/events" />
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="ev-name">
                Name
              </label>
              <input id="ev-name" className="input" name="name" placeholder="Lantern Build Night 2" required />
            </div>
            <div>
              <label className="label" htmlFor="ev-starts">
                Starts
              </label>
              <input id="ev-starts" className="input" type="datetime-local" name="startsAt" />
            </div>
            <div>
              <label className="label" htmlFor="ev-kit">
                Start from kit
              </label>
              <select id="ev-kit" className="input" name="kitId" defaultValue={kits[0]?.id ?? ""}>
                <option value="">No kit (empty event)</option>
                {kits.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-[12.5px] leading-relaxed text-zinc-500">
            From a kit, the new event gets its crew and topics, the knowledge worth keeping, early questions as plan questions, its tasks as proposals and the lessons in its
            instructions. Nothing is posted outside.
          </p>
          <button className="btn-primary">Create event</button>
        </form>
      </Composer>

      <Fold title="Closed" count={closed.length}>
        {closed.length ? (
          <div className="card-flat divide-y divide-zinc-100">
            {closed.map(({ event: e, kit }) => (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <Link href={`/events/${e.slug}`} className="min-w-0 hover:underline">
                  <div className="truncate text-[13.5px] font-medium text-zinc-900">{e.name}</div>
                  <div className="text-[12px] text-zinc-500">
                    closed {fmt(e.closedAt)}
                    {e.closedBy ? ` by ${e.closedBy}` : ""}
                  </div>
                </Link>
                <div className="flex shrink-0 gap-3 text-[12.5px]">
                  <Link className="font-medium text-brand-ink hover:underline" href={`/wrap?event=${encodeURIComponent(e.slug)}`}>
                    Recap and kit
                  </Link>
                  {kit ? (
                    <a className="font-medium text-brand-ink hover:underline" href={`/wrap/kit/${kit.id}`}>
                      Download kit
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty quiet>No closed events yet.</Empty>
        )}
      </Fold>
    </>
  );
}
