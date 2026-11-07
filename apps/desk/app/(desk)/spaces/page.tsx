import { ChevronDown } from "lucide-react";
import { PlatformLogo, platformName } from "@/components/platform";
import { community } from "@/lib/db";
import { ago, liveEvents, spacesWithSettings } from "@/lib/data";
import type { GatewayRoom } from "@/lib/ferri";
import { gatewayAs, requireUser } from "@/lib/session";
import { addFerri, keepOff, saveSpace } from "../actions";
import { Empty, Fold, Note, PageHead, Section } from "../ui";
import { SpaceVoiceForm } from "../settings-form";

const MODE_HELP: Record<string, string> = {
  off: "ignored",
  listen: "reads, never posts",
  approve: "replies wait for OK",
  auto: "answers with sources",
};
const MODE_STYLE: Record<string, string> = {
  auto: "bg-emerald-50 text-emerald-700",
  approve: "bg-sky-50 text-sky-700",
  listen: "bg-zinc-100 text-zinc-600",
  off: "bg-zinc-100 text-zinc-500",
};

type Row = Awaited<ReturnType<typeof spacesWithSettings>>[number];
type Ev = Awaited<ReturnType<typeof liveEvents>>[number];

function SpaceForm({ space, events, submit }: { space: Row; events: Ev[]; submit: string }) {
  const att = space.attachment;
  const mode = att ? att.mode : "off";
  return (
    <form action={saveSpace} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="spaceId" value={space.id} />
      <select className="input w-[160px]" name="eventId" defaultValue={att?.eventId ?? events[0]?.id ?? ""} aria-label={`Event for ${space.name}`}>
        {events.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
      <select className="input w-[200px]" name="mode" defaultValue={mode} aria-label={`Mode for ${space.name}`}>
        {(["off", "listen", "approve", "auto"] as const).map((m) => (
          <option key={m} value={m}>
            {m[0]!.toUpperCase() + m.slice(1)} · {MODE_HELP[m]}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1.5 text-[12.5px] text-zinc-600">
        <input type="checkbox" name="role" value="crew" defaultChecked={att?.role === "crew"} />
        crew room
      </label>
      <button className="btn">{submit}</button>
    </form>
  );
}

function SpaceName({ s }: { s: Row }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100" title={platformName(s.platform)}>
        <PlatformLogo platform={s.platform} size={16} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[14px] font-medium text-zinc-900">{s.name}</div>
        <div className="truncate text-[12px] text-zinc-500">
          {platformName(s.platform)} · last message {ago(s.lastMessageAt)}
        </div>
      </div>
    </div>
  );
}

export default async function SpacesPage({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  const { note } = await searchParams;
  const c = await community();
  const [all, events] = await Promise.all([spacesWithSettings(c.id), liveEvents(c.id)]);
  const discovered = all.filter((s) => s.state === "new" && !s.archived);
  const known = all.filter((s) => s.state !== "new" && !s.archived);
  const attached = known.filter((s) => s.attachment);
  const off = known.filter((s) => !s.attachment);
  const archived = all.filter((s) => s.archived);
  // Rooms in Switch that Ferri is not in yet (bridged chats and Switch rooms), so nobody types !invite-agent.
  const user = await requireUser();
  const inRooms = new Set(all.filter((s) => !s.archived).map((s) => s.switchRoomId));
  let outside: GatewayRoom[] = [];
  let outsideError: string | null = null;
  try {
    outside = (await gatewayAs(user).rooms()).filter((r) => !inRooms.has(r.id)).sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    outsideError = (err as Error).message.includes("401") ? "Your Switch session ended. Sign in again to list rooms." : "Switch did not list its rooms.";
  }
  return (
    <>
      <PageHead
        title="Spaces"
        sub="Every group or channel Ferri is in, on any app."
        about={
          <>
            <p>A space does nothing until you attach it to an event. Listen reads only, Approve puts Ferri&apos;s replies on a card first, Auto answers with sources.</p>
            <p>The crew room is where question cards land.</p>
          </>
        }
      />
      <Note note={note} />

      {discovered.length ? (
        <Section title="New spaces" count={discovered.length}>
          <div className="card divide-y divide-zinc-100">
            {discovered.map((s) => (
              <div key={s.id} className="flex flex-col gap-3 px-4 py-3.5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <SpaceName s={s} />
                  <div className="mt-0.5 pl-[42px] text-[12px] text-zinc-500">Off · first seen {ago(s.firstSeenAt)}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <SpaceForm space={s} events={events} submit="Attach" />
                  <form action={keepOff}>
                    <input type="hidden" name="spaceId" value={s.id} />
                    <button className="h-9 rounded-full px-3 text-[13px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">Keep off</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Attached" count={attached.length}>
        {attached.length ? (
          <div className="card-flat divide-y divide-zinc-100">
            {attached.map((s) => (
              <div key={s.id} className="px-4 py-3.5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <SpaceName s={s} />
                    <span className={`badge ${MODE_STYLE[s.attachment!.mode] ?? ""}`}>{s.attachment!.mode}</span>
                    {s.attachment!.role === "crew" ? <span className="badge bg-accent-soft text-zinc-800">crew room</span> : null}
                  </div>
                  <SpaceForm space={s} events={events} submit="Save" />
                </div>
                {/* Spec 21: tone and language for this space only (a Hindi WhatsApp group, a playful Discord). */}
                <details className="group mt-2 pl-[42px]">
                  <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[12.5px] font-medium text-zinc-500 hover:text-zinc-900 [&::-webkit-details-marker]:hidden">
                    Tone and language
                    <ChevronDown size={13} className="transition group-open:rotate-180" aria-hidden />
                  </summary>
                  <div className="mt-2">
                    <SpaceVoiceForm communityId={c.id} eventId={s.attachment!.eventId} spaceId={s.id} />
                  </div>
                </details>
              </div>
            ))}
          </div>
        ) : (
          <Empty pose="wave" title="No space attached yet">
            Add Ferri to a group on Telegram, Discord, Slack or WhatsApp. It shows up here, switched off, until you attach it to an event.
          </Empty>
        )}
      </Section>

      {off.length ? (
        <Fold title="Off" count={off.length} hint="Ferri is in these but ignores them" className="mb-2">
          <div className="card-flat divide-y divide-zinc-100">
            {off.map((s) => (
              <div key={s.id} className="flex flex-col gap-3 px-4 py-3.5 lg:flex-row lg:items-center lg:justify-between">
                <SpaceName s={s} />
                <SpaceForm space={s} events={events} submit="Save" />
              </div>
            ))}
          </div>
        </Fold>
      ) : null}

      <Fold title="Rooms Ferri is not in" count={outsideError ? undefined : outside.length} className="mb-2">
        {outsideError ? (
          <Empty quiet>{outsideError}</Empty>
        ) : outside.length ? (
          <div className="card-flat divide-y divide-zinc-100">
            {outside.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-medium text-zinc-900">{r.bridge_display_name ? `${r.bridge_display_name}: ${r.name}` : r.name}</div>
                  <div className="flex items-center gap-1.5 text-[12px] text-zinc-500">
                    <PlatformLogo platform={r.bridge_type} size={12} />
                    {platformName(r.bridge_type)} · {r.agent_count} agent{r.agent_count === 1 ? "" : "s"}
                  </div>
                </div>
                <form action={addFerri}>
                  <input type="hidden" name="roomId" value={r.id} />
                  {/* Named the way Ferri's discovery names spaces: "<connection>: <chat>". */}
                  <input type="hidden" name="name" value={r.bridge_display_name ? `${r.bridge_display_name}: ${r.name}` : r.name} />
                  <input type="hidden" name="platform" value={r.bridge_type ?? ""} />
                  <button className="btn">Add Ferri</button>
                </form>
              </div>
            ))}
          </div>
        ) : (
          <Empty quiet>Ferri is in every room Switch knows. New chats show up here once the Switch bot is in them.</Empty>
        )}
      </Fold>

      {archived.length ? (
        <Fold title="Gone" count={archived.length} hint="Ferri is no longer in these rooms">
          <ul className="card-flat divide-y divide-zinc-100">
            {archived.map((s) => (
              <li key={s.id} className="px-4 py-2.5 text-[13px] text-zinc-500">
                {s.name}
              </li>
            ))}
          </ul>
        </Fold>
      ) : (
        <div className="mb-10" />
      )}
    </>
  );
}
