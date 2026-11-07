import { ChevronDown } from "lucide-react";
import { PlatformLogo, platformName } from "@/components/platform";
import { POST_LABEL, STATUS_LABEL, announcementList, type AnnouncementView } from "@/lib/announce";
import { ago, liveEvents } from "@/lib/data";
import { community, db } from "@/lib/db";
import { announcementTargets, formatWhen } from "@/lib/ferri";
import { approveAnnouncement, dropAnnouncement, editAnnouncement, newAnnouncement } from "../actions";
import { AutoRefresh } from "../refresh";
import { Composer, Empty, Fold, Note, PageHead, Section } from "../ui";

const PLATFORM: Record<string, string> = { telegram: "Telegram", slack: "Slack", discord: "Discord", mattermost: "Mattermost", whatsapp: "WhatsApp", whatsapp_web: "WhatsApp" };
const short = (name: string) => (name.includes(": ") ? name.slice(name.indexOf(": ") + 2) : name);
const quiet = "h-9 rounded-full px-3 text-[13px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900";

export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  const { note } = await searchParams;
  const c = await community();
  const [list, evs] = await Promise.all([announcementList(), liveEvents(c.id)]);
  const targetsByEvent = await Promise.all(evs.map(async (e) => ({ event: e, targets: await announcementTargets(db(), e.id) })));
  const waiting = list.filter((a) => a.waiting);
  const scheduled = list.filter((a) => a.status === "scheduled");
  const sent = list.filter((a) => a.status === "sent");
  const opening = list.filter((a) => a.status === "requested" && !a.waiting);
  const notPosted = list.filter((a) => ["dismissed", "expired", "missed"].includes(a.status)).slice(0, 20);
  const tz = c.timezone;

  return (
    <>
      <AutoRefresh seconds={8} />
      <PageHead
        title="Announcements"
        sub="One OK posts to every space of the event, on every app."
        about={
          <>
            <p>Ask in the crew room (“@ferri tell everyone lunch moves to 1:30”), write one here, or let Ferri spot a decision in crew chat. Each version waits for one OK from anyone on the crew: here, in Pocket or in the crew room.</p>
            <p>A later version edits the post in place everywhere it went.</p>
          </>
        }
      />
      <Note note={note} />

      {waiting.length ? (
        <Section title="Waiting for your OK" count={waiting.length}>
          <div className="space-y-4">
            {waiting.map((a) => (
              <article key={a.id} className="card p-5 sm:p-6">
                <div className="text-[12.5px] text-zinc-500">
                  {a.liveVersion > 0 ? `Edit, version ${a.waiting!.version}` : a.origin === "decision" ? "Spotted in crew chat" : "New"} · {a.waiting!.proposedBy} · {ago(a.waiting!.createdAt)}
                  {a.scheduledAt && a.liveVersion === 0 ? ` · posts ${formatWhen(a.scheduledAt, tz)}` : ""}
                </div>
                <h3 className="mt-1.5 font-display text-[21px] leading-snug font-extrabold tracking-[-0.02em] text-zinc-900">{a.waiting!.title}</h3>
                <Targets targets={a.targets} />
                <MediaNote a={a} />
                {a.liveVersion > 0 && a.text ? <div className="mt-2 text-[12.5px] text-zinc-500 line-through decoration-zinc-300">{a.text}</div> : null}
                <form action={approveAnnouncement} className="mt-4 space-y-2.5">
                  <input type="hidden" name="cardId" value={a.waiting!.cardId} />
                  <label className="sr-only" htmlFor={`draft-${a.id}`}>
                    {a.liveVersion > 0 ? "New version" : "Ferri's draft"}
                  </label>
                  <textarea id={`draft-${a.id}`} className="textarea" name="text" rows={4} defaultValue={a.waiting!.draft} />
                  <div className="flex flex-wrap items-center gap-2">
                    <button className="btn-primary">{a.liveVersion > 0 ? "Edit everywhere" : a.scheduledAt ? "Approve for its time" : "Post it"}</button>
                    <button className={quiet} formAction={dropAnnouncement}>
                      {a.liveVersion > 0 ? "Keep it as it is" : "Don't post"}
                    </button>
                  </div>
                </form>
              </article>
            ))}
          </div>
          {opening.length ? <p className="muted mt-2">{opening.length} more opening their cards now.</p> : null}
        </Section>
      ) : (
        <div className="mb-8">
          <Empty pose="announce" title="Nothing waiting for an OK">
            Say “@ferri tell everyone …” in the crew room, or write one here.
            {opening.length ? ` ${opening.length} more opening their cards now.` : ""}
          </Empty>
        </div>
      )}

      {evs.length ? (
        <Composer label="New announcement">
          <form action={newAnnouncement} className="card space-y-4 p-5">
            <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
              <div>
                <label className="label" htmlFor="ann-event">
                  Event
                </label>
                <select id="ann-event" className="input" name="eventId" defaultValue={evs[0]?.id}>
                  {evs.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="ann-when">
                  Post at (optional)
                </label>
                <input id="ann-when" className="input" type="datetime-local" name="when" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="ann-text">
                Announcement
              </label>
              <textarea id="ann-text" className="textarea" name="text" rows={4} required placeholder="Lunch is now at 1:30 PM on Saturday. See you in the hall!" />
            </div>
            <div>
              <label className="label" htmlFor="ann-title">
                Short title (optional)
              </label>
              <input id="ann-title" className="input" name="title" placeholder="Lunch moves to 1:30 PM" />
            </div>
            <fieldset>
              <legend className="label">Where (none ticked: every space)</legend>
              <div className="space-y-2">
                {targetsByEvent.map(({ event, targets }) => (
                  <div key={event.id}>
                    {evs.length > 1 ? <div className="text-[12px] font-medium text-zinc-500">{event.name}</div> : null}
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                      {targets.map((t) => (
                        <label key={t.spaceId} className="flex items-center gap-1.5 text-[13px] text-zinc-700">
                          <input type="checkbox" name="target" value={t.spaceId} />
                          <PlatformLogo platform={t.platform} size={14} />
                          {short(t.name)}
                        </label>
                      ))}
                      {!targets.length ? <span className="muted">No Auto or Approve spaces yet.</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </fieldset>
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn-primary">Send for approval</button>
              <span className="text-[12.5px] text-zinc-500">It still needs one OK from the crew.</span>
            </div>
          </form>
        </Composer>
      ) : (
        <div className="mb-10">
          <Empty quiet>No live event. Create one in Events first.</Empty>
        </div>
      )}

      {scheduled.length ? (
        <Section title="Scheduled" count={scheduled.length}>
          <div className="space-y-3">
            {scheduled.map((a) => (
              <article key={a.id} className="card-flat p-5">
                <div className="text-[12.5px] text-zinc-500">Goes out {a.scheduledAt ? formatWhen(a.scheduledAt, tz) : "soon"}</div>
                <h3 className="mt-1 text-[16px] font-semibold text-zinc-900">{a.title}</h3>
                <MediaNote a={a} />
                <p className="mt-1 text-[13.5px] leading-relaxed whitespace-pre-wrap text-zinc-700">{a.text}</p>
                <Targets targets={a.targets} />
              </article>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Posted" count={sent.length}>
        {sent.length ? (
          <div className="space-y-3">
            {sent.map((a) => (
              <Posted key={a.id} a={a} tz={tz} />
            ))}
          </div>
        ) : (
          <Empty quiet>Nothing posted yet.</Empty>
        )}
      </Section>

      {notPosted.length ? (
        <Fold title="Not posted" count={notPosted.length}>
          <ul className="card-flat divide-y divide-zinc-100">
            {notPosted.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                <span className="truncate">{a.title}</span>
                <span className="shrink-0 text-[12px] text-zinc-500">
                  {STATUS_LABEL[a.status]} · {ago(a.updatedAt)}
                </span>
              </li>
            ))}
          </ul>
        </Fold>
      ) : null}
    </>
  );
}

function Posted({ a, tz }: { a: AnnouncementView; tz: string }) {
  const approved = a.versions.filter((v) => v.status === "approved");
  const failed = a.posts.filter((p) => p.status === "failed").length;
  return (
    <article className="card-flat p-5">
      <div className="text-[12.5px] text-zinc-500">
        {a.sentAt ? formatWhen(a.sentAt, tz) : "Posted"} · {a.origin === "decision" ? "from crew chat" : a.requestedBy}
        {a.liveVersion > 1 ? ` · version ${a.liveVersion}` : ""}
      </div>
      <h3 className="mt-1 text-[16px] font-semibold text-zinc-900">{a.title}</h3>
      <MediaNote a={a} />
      <p className="mt-1 text-[13.5px] leading-relaxed whitespace-pre-wrap text-zinc-700">{a.text}</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {a.posts.map((p) => (
          <span
            key={p.id}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] ${p.status === "failed" ? "bg-red-50 text-red-700" : "bg-zinc-100 text-zinc-700"}`}
            title={`${PLATFORM[p.platform ?? ""] ?? p.platform ?? "Switch"} · ${p.spaceName} · ${POST_LABEL[p.status] ?? p.status} · v${p.version}`}
          >
            <PlatformLogo platform={p.platform} size={12} />
            {short(p.spaceName)}
          </span>
        ))}
        {failed ? <span className="text-[12px] font-medium text-red-700">{failed} failed</span> : null}
      </div>
      <details className="group mt-3">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[12.5px] font-medium text-zinc-500 hover:text-zinc-900 [&::-webkit-details-marker]:hidden">
          {a.waiting ? "Details" : "Edit everywhere"}
          <ChevronDown size={13} className="transition group-open:rotate-180" aria-hidden />
        </summary>
        <div className="mt-2 space-y-2">
          {approved.length > 1 ? <div className="text-[12px] text-zinc-500">{approved.map((v) => `v${v.version} by ${v.approvedBy ?? "?"}`).join(" · ")}</div> : null}
          {!a.waiting ? (
            <form action={editAnnouncement} className="space-y-2">
              <input type="hidden" name="announcementId" value={a.id} />
              <label className="sr-only" htmlFor={`edit-${a.id}`}>
                New version
              </label>
              <textarea id={`edit-${a.id}`} className="textarea" name="text" rows={3} defaultValue={a.text ?? ""} />
              <button className="btn">Send the new version for approval</button>
            </form>
          ) : (
            <p className="muted">A new version is waiting for its OK above.</p>
          )}
        </div>
      </details>
    </article>
  );
}

/** An announcement that carries images (a poster from the Builder, spec 13). */
function MediaNote({ a }: { a: AnnouncementView }) {
  if (!a.media?.length) return null;
  return <div className="mt-0.5 text-[12px] text-zinc-500">With the image {a.media.map((m) => m.filename).join(", ")}</div>;
}

/** "To [logo] build-night  [logo] Lantern Build Night ..." */
function Targets({ targets }: { targets: { spaceId: string; name: string; platform: string | null }[] }) {
  if (!targets.length) return <p className="mt-2 text-[12.5px] text-zinc-500">No Auto or Approve space to post in yet.</p>;
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 text-[12px] text-zinc-500">To</span>
      {targets.map((t) => (
        <span key={t.spaceId} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[12px] text-zinc-700" title={`${platformName(t.platform)} · ${t.name}`}>
          <PlatformLogo platform={t.platform} size={12} />
          {short(t.name)}
        </span>
      ))}
    </div>
  );
}
