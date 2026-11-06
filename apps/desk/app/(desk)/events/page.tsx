import Link from "next/link";
import { community } from "@/lib/db";
import { fmt } from "@/lib/data";
import { closedWithKits, wrapEvents } from "@/lib/wrap";
import { startEventFromKit } from "../wrap/actions";
import { Empty, Note, PageHead, Section } from "../ui";

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  const { note } = await searchParams;
  const c = await community();
  const [all, { closed, kits }] = await Promise.all([wrapEvents(c.id), closedWithKits(c.id)]);
  const live = all.filter((e) => !e.closedAt);
  return (
    <>
      <PageHead title="Events" sub="Each event has its own timeline, instructions, knowledge, crew and spaces." />
      <Note note={note} />
      <Section title={`Live · ${live.length}`}>
        {live.length ? (
          <div className="card divide-y divide-zinc-100">
            {live.map((e) => (
              <Link key={e.id} href={`/events/${e.slug}`} className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50">
                <div>
                  <div className="text-[13px] font-medium">{e.name}</div>
                  <div className="text-[12px] text-zinc-500">
                    {fmt(e.startsAt)} · {e.venue ?? "no venue yet"}
                  </div>
                </div>
                <span className="badge">{e.stage}</span>
              </Link>
            ))}
          </div>
        ) : (
          <Empty>No live events. Start one below, or add one in the seed folder and run `pnpm kb seed`.</Empty>
        )}
      </Section>

      <Section title="New event">
        <form action={startEventFromKit} className="card flex flex-wrap items-end gap-3 p-4">
          <input type="hidden" name="back" value="/events" />
          <div>
            <label className="label">Name</label>
            <input className="input" name="name" placeholder="Lantern Build Night 2" required />
          </div>
          <div>
            <label className="label">Starts</label>
            <input className="input" type="datetime-local" name="startsAt" />
          </div>
          <div>
            <label className="label">Start from kit</label>
            <select className="input" name="kitId" defaultValue={kits[0]?.id ?? ""}>
              <option value="">No kit (empty event)</option>
              {kits.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn-primary">Create</button>
          <p className="w-full text-[12px] text-zinc-500">
            From a kit, the new event gets its crew and topics, the knowledge worth keeping, the things to check and the questions to answer early as plan questions, its tasks as proposals, and the lessons in its instructions. Nothing is posted outside.
          </p>
        </form>
      </Section>

      <Section title={`Closed · ${closed.length}`}>
        {closed.length ? (
          <div className="card divide-y divide-zinc-100">
            {closed.map(({ event: e, kit }) => (
              <div key={e.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <Link href={`/events/${e.slug}`} className="hover:underline">
                  <div className="text-[13px] font-medium">{e.name}</div>
                  <div className="text-[12px] text-zinc-500">
                    closed {fmt(e.closedAt)}
                    {e.closedBy ? ` by ${e.closedBy}` : ""}
                  </div>
                </Link>
                <div className="flex shrink-0 gap-2 text-[12px]">
                  <Link className="badge" href={`/wrap?event=${encodeURIComponent(e.slug)}`}>
                    recap and kit
                  </Link>
                  {kit ? (
                    <a className="badge" href={`/wrap/kit/${kit.id}`}>
                      download kit
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>No closed events yet.</Empty>
        )}
      </Section>
    </>
  );
}
