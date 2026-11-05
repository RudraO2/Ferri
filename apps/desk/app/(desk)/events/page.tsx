import Link from "next/link";
import { community } from "@/lib/db";
import { allEvents, fmt } from "@/lib/data";
import { Empty, PageHead } from "../ui";

export default async function EventsPage() {
  const c = await community();
  const list = await allEvents(c.id);
  return (
    <>
      <PageHead title="Events" sub="Each event has its own timeline, instructions, knowledge, crew and spaces." />
      {list.length ? (
        <div className="card divide-y divide-zinc-100">
          {list.map((e) => (
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
        <Empty>No events yet. Add one in the seed folder and run `pnpm kb seed`.</Empty>
      )}
    </>
  );
}
