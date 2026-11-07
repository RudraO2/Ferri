import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { PlatformLogo } from "@/components/platform";
import { community, db } from "@/lib/db";
import { crewFor, spacesWithSettings } from "@/lib/data";
import { TOPICS, events } from "@/lib/ferri";
import { removeCrewMember, saveCrewMember, saveEvent } from "../../actions";
import { Composer, Empty, Fold, Note, PageHead, Section } from "../../ui";
import { SettingsForm } from "../../settings-form";

const local = (d: Date | null) => (d ? new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 16) : "");
const handlesText = (h: Record<string, string>) =>
  Object.entries(h)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");

type Member = Awaited<ReturnType<typeof crewFor>>[number];

/** The crew member's form (name, handles, topics, lead, on duty). Same fields as before, laid out to wrap on phones. */
function CrewForm({ m, eventId, slug }: { m: Member | null; eventId: string; slug: string }) {
  const id = m?.id ?? "new";
  return (
    <form action={saveCrewMember} className="space-y-3">
      <input type="hidden" name="id" value={m?.id ?? ""} />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="slug" value={slug} />
      <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
        <div>
          <label className="label" htmlFor={`crew-name-${id}`}>
            Name
          </label>
          <input id={`crew-name-${id}`} className="input" name="name" defaultValue={m?.name ?? ""} placeholder="Name" />
        </div>
        <div>
          <label className="label" htmlFor={`crew-handles-${id}`}>
            Handles
          </label>
          <input id={`crew-handles-${id}`} className="input" name="handles" defaultValue={m ? handlesText(m.handles) : ""} placeholder="mattermost: priya, telegram: priya_k, switch: email" />
        </div>
      </div>
      <fieldset>
        <legend className="label">Topics</legend>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          {TOPICS.map((t) => (
            <label key={t} className="flex items-center gap-1.5 text-[12.5px] text-zinc-700">
              <input type="checkbox" name="topics" value={t} defaultChecked={m?.topics.includes(t) ?? false} />
              {t}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-1.5 text-[12.5px] text-zinc-700">
          <input type="checkbox" name="lead" defaultChecked={m?.lead ?? false} /> lead
        </label>
        <label className="flex items-center gap-1.5 text-[12.5px] text-zinc-700">
          <input type="checkbox" name="onDuty" defaultChecked={m?.onDuty ?? false} /> on duty
        </label>
        <div className="flex gap-1.5 sm:ml-auto">
          <button className={m ? "btn" : "btn-primary"}>{m ? "Save" : "Add"}</button>
          {m ? (
            <button className="h-9 rounded-full px-3 text-[13px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900" formAction={removeCrewMember}>
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
      <PageHead
        eyebrow="Events"
        title={e.name}
        sub={`Stage: ${e.stage}`}
        about={e.deskEditedAt ? <p>Edited in Desk, so the seed leaves these settings alone.</p> : undefined}
      />
      <Note note={note} />

      <Section title="Details">
        <form action={saveEvent} className="card space-y-4 p-5">
          <input type="hidden" name="eventId" value={e.id} />
          <div className="grid gap-3 sm:grid-cols-6">
            <div className="sm:col-span-3">
              <label className="label" htmlFor="ev-name">
                Name
              </label>
              <input id="ev-name" className="input" name="name" defaultValue={e.name} />
            </div>
            <div className="sm:col-span-1">
              <label className="label" htmlFor="ev-stage">
                Stage
              </label>
              <select id="ev-stage" className="input" name="stage" defaultValue={e.stage}>
                {["plan", "build", "launch", "live", "wrap"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-1">
              <label className="label" htmlFor="ev-starts">
                Starts (IST)
              </label>
              <input id="ev-starts" className="input" type="datetime-local" name="startsAt" defaultValue={local(e.startsAt)} />
            </div>
            <div className="sm:col-span-1">
              <label className="label" htmlFor="ev-ends">
                Ends (IST)
              </label>
              <input id="ev-ends" className="input" type="datetime-local" name="endsAt" defaultValue={local(e.endsAt)} />
            </div>
            <div className="sm:col-span-6">
              <label className="label" htmlFor="ev-venue">
                Venue
              </label>
              <input id="ev-venue" className="input" name="venue" defaultValue={e.venue ?? ""} />
            </div>
          </div>
          <details className="group">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[12.5px] font-medium text-zinc-500 hover:text-zinc-900 [&::-webkit-details-marker]:hidden">
              Event instructions{e.instructions ? "" : " (none yet)"}
              <ChevronDown size={13} className="transition group-open:rotate-180" aria-hidden />
            </summary>
            <div className="mt-2">
              <label className="label" htmlFor="ev-instructions">
                Layered on top of the community&apos;s
              </label>
              <textarea id="ev-instructions" className="textarea" name="instructions" rows={4} defaultValue={e.instructions} />
            </div>
          </details>
          <button className="btn-primary">Save event</button>
        </form>
      </Section>

      <Section
        title="Crew"
        count={crew.length}
        aside={<span className="text-[12px] text-zinc-500">{e.crewFromDesk ? "managed in Desk" : "from event.yaml until you change it here"}</span>}
      >
        {crew.length ? (
          <div className="card-flat mb-3 divide-y divide-zinc-100">
            {crew.map((m) => (
              <details key={m.id} className="group px-4 py-3">
                <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12.5px] font-semibold text-zinc-800">
                    {(m.name || "?").charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-zinc-900">
                      {m.name}
                      {m.lead ? <span className="ml-2 text-[12px] font-normal text-zinc-500">lead</span> : null}
                      {m.onDuty ? <span className="ml-2 text-[12px] font-normal text-emerald-700">on duty</span> : null}
                    </span>
                    <span className="block truncate text-[12px] text-zinc-500">{m.topics.length ? m.topics.join(", ") : "no topics"}</span>
                  </span>
                  <ChevronDown size={14} className="shrink-0 text-zinc-400 transition group-open:rotate-180" aria-hidden />
                </summary>
                <div className="mt-3 border-t border-zinc-100 pt-3">
                  <CrewForm m={m} eventId={e.id} slug={e.slug} />
                </div>
              </details>
            ))}
          </div>
        ) : (
          <Empty quiet>No crew yet. Cards go to whoever is in the crew room.</Empty>
        )}
        <Composer label="Add a crew member" className="mb-2">
          <div className="card p-5">
            <CrewForm m={null} eventId={e.id} slug={e.slug} />
          </div>
        </Composer>
        <p className="muted mt-2">
          A card goes to whoever owns its topic, then whoever is on duty, then the whole crew. Add <code>switch: email</code> to the handles so Desk answers carry the crew name.
        </p>
      </Section>

      <Section title="Spaces" count={attached.length} aside={<Link className="text-[12.5px] font-medium text-brand-ink hover:underline" href="/spaces">Manage spaces</Link>}>
        {attached.length ? (
          <ul className="card-flat divide-y divide-zinc-100">
            {attached.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                <span className="flex min-w-0 items-center gap-2">
                  <PlatformLogo platform={s.platform} size={14} />
                  <span className="truncate">{s.name}</span>
                </span>
                <span className="shrink-0 text-[12px] text-zinc-500">{s.attachment?.role === "crew" ? "crew room" : s.attachment?.mode}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty quiet>No spaces attached. Ferri is Off for this event until you attach one on Spaces.</Empty>
        )}
      </Section>

      {/* Customization (spec 21): this event's own settings, on top of the community's. */}
      <Fold title="How Ferri runs this event" hint="tone, language, timing">
        <SettingsForm level="event" scope={{ communityId: c.id, eventId: e.id }} back={`/events/${e.slug}`} />
        <p className="muted mt-2">
          On top of the <Link className="underline hover:text-zinc-900" href="/community">community settings</Link>. Tone and language can also be set per space on Spaces. The
          citation check, the approval cards and the pause stay in code.
        </p>
      </Fold>
    </>
  );
}
