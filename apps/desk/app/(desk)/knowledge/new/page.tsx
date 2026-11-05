import { community } from "@/lib/db";
import { liveEvents } from "@/lib/data";
import { newEntry } from "../../actions";
import { PageHead } from "../../ui";

export default async function NewEntryPage() {
  const c = await community();
  const evs = await liveEvents(c.id);
  return (
    <>
      <PageHead title="New knowledge entry" sub="Ferri cites the source title and heading under every answer that uses it." />
      <form action={newEntry} className="card grid grid-cols-6 gap-3 p-4">
        <div className="col-span-2">
          <label className="label">Belongs to</label>
          <select className="input" name="eventId" defaultValue={evs[0]?.id ?? ""}>
            <option value="">{c.name} (whole community)</option>
            {evs.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-4">
          <label className="label">Source title</label>
          <input className="input" name="sourceTitle" placeholder="Lantern Build Night FAQ" />
        </div>
        <div className="col-span-6">
          <label className="label">Heading</label>
          <input className="input" name="heading" placeholder="Parking" required />
        </div>
        <div className="col-span-6">
          <label className="label">Text</label>
          <textarea className="textarea" name="body" rows={8} required />
        </div>
        <div className="col-span-6">
          <button className="btn-primary">Add entry</button>
        </div>
      </form>
    </>
  );
}
