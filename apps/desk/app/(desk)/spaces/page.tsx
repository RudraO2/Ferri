import { PlatformLogo } from "@/components/platform";
import { community } from "@/lib/db";
import { ago, liveEvents, spacesWithSettings } from "@/lib/data";
import type { GatewayRoom } from "@/lib/ferri";
import { gatewayAs, requireUser } from "@/lib/session";
import { addFerri, keepOff, saveSpace } from "../actions";
import { Empty, Note, PageHead, Section } from "../ui";
import { SpaceVoiceForm } from "../settings-form";

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
                  <div className="flex items-center gap-1.5 text-[12px] text-zinc-500">
                    <PlatformLogo platform={s.platform} size={13} />
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
                  <div className="flex items-center gap-1.5 text-[12px] text-zinc-500">
                    <PlatformLogo platform={s.platform} size={13} />
                    {s.platform ?? "unknown platform"} · last message {ago(s.lastMessageAt)}
                  </div>
                </div>
                <SpaceForm space={s} events={events} submit="Save" />
                {/* Spec 21: tone and language for this space only (a Hindi WhatsApp group, a playful Discord). */}
                {s.attachment ? (
                  <div className="w-full">
                    <SpaceVoiceForm communityId={c.id} eventId={s.attachment.eventId} spaceId={s.id} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <Empty>No spaces yet.</Empty>
        )}
      </Section>

      <Section title={`Rooms Ferri is not in · ${outside.length}`}>
        {outsideError ? (
          <Empty>{outsideError}</Empty>
        ) : outside.length ? (
          <div className="card divide-y divide-zinc-100">
            {outside.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="text-[13px] font-medium">{r.bridge_display_name ? `${r.bridge_display_name}: ${r.name}` : r.name}</div>
                  <div className="text-[12px] text-zinc-500">
                    {r.bridge_type ?? "switch"}
                    {r.bridge_display_name ? ` · ${r.bridge_display_name}` : ""} · {r.agent_count} agent{r.agent_count === 1 ? "" : "s"}
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
          <Empty>Ferri is in every room Switch knows. New Telegram, Slack and Discord chats show up here once the Switch bot is in them.</Empty>
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
