import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { community, db } from "@/lib/db";
import { crewFor, spacesWithSettings } from "@/lib/data";
import { TOPICS, events } from "@/lib/ferri";
import { removeCrewMember, saveCrewMember, saveEvent } from "../../actions";
import { Empty, Note, PageHead, Section } from "../../ui";

const local = (d: Date | null) => (d ? new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 16) : "");
const handlesText = (h: Record<string, string>) =>
  Object.entries(h)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");

type Member = Awaited<ReturnType<typeof crewFor>>[number];

function CrewRow({ m, eventId, slug }: { m: Member | null; eventId: string; slug: string }) {
  return (
    <form action={saveCrewMember} className="grid grid-cols-12 items-start gap-2 px-4 py-3">
      <input type="hidden" name="id" value={m?.id ?? ""} />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="slug" value={slug} />
      <div className="col-span-2">
        <input className="input" name="name" defaultValue={m?.name ?? ""} placeholder="Name" />
      </div>
      <div className="col-span-3">
        <input className="input" name="handles" defaultValue={m ? handlesText(m.handles) : ""} placeholder="mattermost: priya, telegram: priya_k" />
      </div>
      <div className="col-span-5 flex flex-wrap gap-x-3 gap-y-1">
        {TOPICS.map((t) => (
          <label key={t} className="flex items-center gap-1 text-[12px] text-zinc-600">
            <input type="checkbox" name="topics" value={t} defaultChecked={m?.topics.includes(t) ?? false} />
            {t}
          </label>
        ))}
      </div>
      <div className="col-span-2 flex flex-col gap-1.5">
        <label className="flex items-center gap-1 text-[12px] text-zinc-600">
          <input type="checkbox" name="lead" defaultChecked={m?.lead ?? false} /> lead
        </label>
        <label className="flex items-center gap-1 text-[12px] text-zinc-600">
          <input type="checkbox" name="onDuty" defaultChecked={m?.onDuty ?? false} /> on duty
        </label>
        <div className="flex gap-1.5">
          <button className="btn">{m ? "Save" : "Add"}</button>
          {m ? (
            <button className="btn" formAction={removeCrewMember}>
              Remove
            </button>
          ) : null}
        </div>
      </div>
    </form>
  );
}

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ note?: string }>;
}) {
  const { slug } = await params;
  const { note } = await searchParams;
  const c = await community();
  const [e] = await db().select().from(events).where(and(eq(events.communityId, c.id), eq(events.slug, slug))).limit(1);
  if (!e) notFound();
  const [crew, allSpaces] = await Promise.all([crewFor(c.id, e.id), spacesWithSettings(c.id)]);
  const attached = allSpaces.filter((s) => s.attachment?.eventId === e.id);
  return (
    <>
      <PageHead title={e.name} sub={`Stage: ${e.stage}${e.deskEditedAt ? " · edited in Desk, so the seed leaves these settings alone" : ""}`} />
      <Note note={note} />

      <Section title="Settings">
        <form action={saveEvent} className="card grid grid-cols-6 gap-3 p-4">
          <input type="hidden" name="eventId" value={e.id} />
          <div className="col-span-3">
            <label className="label">Name</label>
            <input className="input" name="name" defaultValue={e.name} />
          </div>
          <div className="col-span-1">
            <label className="label">Stage</label>
            <select className="input" name="stage" defaultValue={e.stage}>
              {["plan", "build", "launch", "live", "wrap"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="col-span-1">
            <label className="label">Starts (IST)</label>
            <input className="input" type="datetime-local" name="startsAt" defaultValue={local(e.startsAt)} />
          </div>
          <div className="col-span-1">
            <label className="label">Ends (IST)</label>
            <input className="input" type="datetime-local" name="endsAt" defaultValue={local(e.endsAt)} />
          </div>
          <div className="col-span-6">
            <label className="label">Venue</label>
            <input className="input" name="venue" defaultValue={e.venue ?? ""} />
          </div>
          <div className="col-span-6">
            <label className="label">Event instructions (layered on top of the community&apos;s)</label>
            <textarea className="textarea" name="instructions" rows={4} defaultValue={e.instructions} />
          </div>
          <div className="col-span-6">
            <button className="btn-primary">Save event</button>
          </div>
        </form>
      </Section>

      <Section title="Spaces" aside={<Link className="text-[12px] text-zinc-500 underline" href="/spaces">Manage spaces</Link>}>
        {attached.length ? (
          <div className="card divide-y divide-zinc-100">
            {attached.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                <span>{s.name}</span>
                <span className="badge">{s.attachment?.role === "crew" ? "crew room" : s.attachment?.mode}</span>
              </div>
            ))}
          </div>
        ) : (
          <Empty>No spaces attached. Ferri is Off for this event until you attach one.</Empty>
        )}
      </Section>

      <Section title="Crew" aside={<span className="text-[12px] text-zinc-500">{e.crewFromDesk ? "managed in Desk" : "from event.yaml until you change it here"}</span>}>
        <div className="card divide-y divide-zinc-100">
          {crew.map((m) => (
            <CrewRow key={m.id} m={m} eventId={e.id} slug={e.slug} />
          ))}
          <CrewRow m={null} eventId={e.id} slug={e.slug} />
        </div>
        <p className="muted mt-2">
          A question card goes to the people who own its topic, then whoever is on duty, then the whole crew. Add <code>switch: email</code> to a crew member&apos;s handles so
          their Desk answers carry their crew name.
        </p>
      </Section>
    </>
  );
}
