import Link from "next/link";
import { community } from "@/lib/db";
import { liveEvents } from "@/lib/data";
import { newEntry } from "../../actions";
import { PageHead } from "../../ui";

export default async function NewEntryPage() {
  const c = await community();
  const evs = await liveEvents(c.id);
  return (
    <>
      <PageHead eyebrow="Knowledge" title="New knowledge entry" sub="Ferri cites the source title and heading under every answer that uses it." />
      <form action={newEntry} className="card max-w-[760px] space-y-4 p-5 sm:p-6">
        <div>
          <label className="label" htmlFor="kn-heading">
            Heading
          </label>
          <input id="kn-heading" className="input" name="heading" placeholder="Parking" required />
        </div>
        <div>
          <label className="label" htmlFor="kn-body">
            Text
          </label>
          <textarea id="kn-body" className="textarea" name="body" rows={8} required />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="kn-event">
              Belongs to
            </label>
            <select id="kn-event" className="input" name="eventId" defaultValue={evs[0]?.id ?? ""}>
              <option value="">{c.name} (whole community)</option>
              {evs.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="kn-source">
              Source title
            </label>
            <input id="kn-source" className="input" name="sourceTitle" placeholder="Lantern Build Night FAQ" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary">Add entry</button>
          <Link href="/knowledge" className="h-9 rounded-full px-3 text-[13px] leading-9 font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
