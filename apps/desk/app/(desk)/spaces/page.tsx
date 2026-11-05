import { community } from "@/lib/db";
import { ago, liveEvents, spacesWithSettings } from "@/lib/data";
import { keepOff, saveSpace } from "../actions";
import { Empty, Note, PageHead, Section } from "../ui";

const MODE_HELP: Record<string, string> = {
  off: "ignored",
  listen: "reads, never posts",
  approve: "replies wait for OK",
  auto: "answers with sources",
};

type Row = Awaited<ReturnType<typeof spacesWithSettings>>[number];
type Ev = Awaited<ReturnType<typeof liveEvents>>[number];

function SpaceForm({ space, events, submit }: { space: Row; events: Ev[]; submit: string }) {
  const att = space.attachment;
  const mode = att ? att.mode : "off";
  return (
    <form action={saveSpace} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="spaceId" value={space.id} />
      <select className="input w-[170px]" name="eventId" defaultValue={att?.eventId ?? events[0]?.id ?? ""}>
        {events.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
      <select className="input w-[210px]" name="mode" defaultValue={mode}>
        {(["off", "listen", "approve", "auto"] as const).map((m) => (
          <option key={m} value={m}>
            {m[0]!.toUpperCase() + m.slice(1)} · {MODE_HELP[m]}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1.5 text-[12px] text-zinc-600">
        <input type="checkbox" name="role" value="crew" defaultChecked={att?.role === "crew"} />
        crew room
      </label>
      <button className="btn">{submit}</button>
    </form>
  );
}

export default async function SpacesPage({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  const { note } = await searchParams;
  const c = await community();
  const [all, events] = await Promise.all([spacesWithSettings(c.id), liveEvents(c.id)]);
  const discovered = all.filter((s) => s.state === "new" && !s.archived);
  const known = all.filter((s) => s.state !== "new" && !s.archived);
  const archived = all.filter((s) => s.archived);
  return (
    <>
      <PageHead
        title="Spaces"
        sub="Every group or channel Ferri is in, on any platform. A space does nothing until you attach it to an event; the crew room is where question cards land."
      />
      <Note note={note} />

      <Section title={`Discovered · ${discovered.length}`}>
        {discovered.length ? (
          <div className="card divide-y divide-zinc-100">
            {discovered.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="text-[13px] font-medium">
                    {s.name} <span className="badge ml-1">new · off</span>
                  </div>
                  <div className="text-[12px] text-zinc-500">
                    {s.platform ?? "unknown platform"} · first seen {ago(s.firstSeenAt)} · last message {ago(s.lastMessageAt)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <SpaceForm space={s} events={events} submit="Attach" />
                  <form action={keepOff}>
                    <input type="hidden" name="spaceId" value={s.id} />
                    <button className="btn">Keep off</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>No new spaces. When Ferri is added to a group, it shows up here, switched off.</Empty>
        )}
      </Section>

      <Section title="All spaces">
        {known.length ? (
          <div className="card divide-y divide-zinc-100">
            {known.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="flex items-center gap-2 text-[13px] font-medium">
                    {s.name}
                    {s.attachment?.role === "crew" ? <span className="badge">crew room</span> : null}
                    <span className={`badge ${s.attachment ? "" : "text-zinc-400"}`}>
                      {s.attachment ? `${s.attachment.eventName} · ${s.attachment.mode}` : "off"}
                    </span>
                  </div>
                  <div className="text-[12px] text-zinc-500">
                    {s.platform ?? "unknown platform"} · last message {ago(s.lastMessageAt)}
                  </div>
                </div>
                <SpaceForm space={s} events={events} submit="Save" />
              </div>
            ))}
          </div>
        ) : (
          <Empty>No spaces yet.</Empty>
        )}
      </Section>

      {archived.length ? (
        <Section title="Gone">
          <div className="card divide-y divide-zinc-100">
            {archived.map((s) => (
              <div key={s.id} className="px-4 py-2.5 text-[13px] text-zinc-500">
                {s.name} · Ferri is no longer in this room
              </div>
            ))}
          </div>
        </Section>
      ) : null}
    </>
  );
}
