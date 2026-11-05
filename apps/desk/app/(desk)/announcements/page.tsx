import { POST_LABEL, STATUS_LABEL, announcementList, type AnnouncementView } from "@/lib/announce";
import { ago, liveEvents } from "@/lib/data";
import { community, db } from "@/lib/db";
import { announcementTargets, describeTargets, formatWhen } from "@/lib/ferri";
import { approveAnnouncement, dropAnnouncement, editAnnouncement, newAnnouncement } from "../actions";
import { AutoRefresh } from "../refresh";
import { Empty, Note, PageHead, Section } from "../ui";

const PLATFORM: Record<string, string> = { telegram: "Telegram", slack: "Slack", discord: "Discord", mattermost: "Mattermost", whatsapp: "WhatsApp" };
const short = (name: string) => (name.includes(": ") ? name.slice(name.indexOf(": ") + 2) : name);

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
        sub="What the crew decides, told to every space of the event after one OK. A later version edits the post in place everywhere it went."
      />
      <Note note={note} />

      <Section title={`Waiting for an OK · ${waiting.length}`}>
        {waiting.length ? (
          <div className="space-y-3">
            {waiting.map((a) => (
              <div key={a.id} className="card p-4">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="badge">{a.liveVersion > 0 ? `edit · version ${a.waiting!.version}` : a.origin === "decision" ? "spotted in crew chat" : "new"}</span>
                  <span className="text-[12px] text-zinc-400">
                    asked by {a.waiting!.proposedBy} {ago(a.waiting!.createdAt)} · to {describeTargets(a.targets)}
                    {a.scheduledAt && a.liveVersion === 0 ? ` · at ${formatWhen(a.scheduledAt, tz)}` : ""}
                  </span>
                </div>
                <div className="text-[15px] font-medium">{a.waiting!.title}</div>
                {a.liveVersion > 0 && a.text ? <div className="mt-1 text-[12.5px] text-zinc-500 line-through decoration-zinc-300">{a.text}</div> : null}
                <form action={approveAnnouncement} className="mt-3 space-y-2">
                  <input type="hidden" name="cardId" value={a.waiting!.cardId} />
                  <label className="label">{a.liveVersion > 0 ? "New version (edit it to post your own)" : "Ferri's draft (edit it to post your own version)"}</label>
                  <textarea className="textarea" name="text" rows={4} defaultValue={a.waiting!.draft} />
                  <div className="flex gap-2">
                    <button className="btn-primary">{a.liveVersion > 0 ? "Edit everywhere" : a.scheduledAt ? "Approve for its time" : "Post it"}</button>
                    <button className="btn" formAction={dropAnnouncement}>
                      {a.liveVersion > 0 ? "Keep it as it is" : "Don't post"}
                    </button>
                  </div>
                </form>
              </div>
            ))}
          </div>
        ) : (
          <Empty>Nothing waiting. Ask Ferri in the crew room (“@ferri tell everyone ...”), or write one below.</Empty>
        )}
        {opening.length ? <p className="muted mt-2">{opening.length} more opening their cards now.</p> : null}
      </Section>

      <Section title="New announcement">
        {evs.length ? (
          <form action={newAnnouncement} className="card space-y-3 p-4">
            <div className="grid grid-cols-[1fr_220px] gap-3">
              <div>
                <label className="label">Event</label>
                <select className="input" name="eventId" defaultValue={evs[0]?.id}>
                  {evs.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Post at (empty: once approved)</label>
                <input className="input" type="datetime-local" name="when" />
              </div>
            </div>
            <div>
              <label className="label">Title for the crew&apos;s lists (optional)</label>
              <input className="input" name="title" placeholder="Lunch moves to 1:30 PM" />
            </div>
            <div>
              <label className="label">The announcement, as members will read it</label>
              <textarea className="textarea" name="text" rows={4} required placeholder="Lunch is now at 1:30 PM on Saturday. See you in the hall!" />
            </div>
            <div>
              <label className="label">Where it goes (none ticked: every Auto and Approve space of the event)</label>
              <div className="space-y-2">
                {targetsByEvent.map(({ event, targets }) => (
                  <div key={event.id}>
                    {evs.length > 1 ? <div className="text-[12px] font-medium text-zinc-500">{event.name}</div> : null}
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {targets.map((t) => (
                        <label key={t.spaceId} className="flex items-center gap-1.5 text-[13px] text-zinc-700">
                          <input type="checkbox" name="target" value={t.spaceId} />
                          {PLATFORM[t.platform ?? ""] ?? t.platform ?? "Switch"} · {short(t.name)}
                        </label>
                      ))}
                      {!targets.length ? <span className="muted">No Auto or Approve spaces yet.</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <button className="btn-primary">Send for approval</button>
            <p className="muted">It still needs one OK, from you or anyone on the crew: in the crew room, here, or in Pocket.</p>
          </form>
        ) : (
          <Empty>No live event. Create one in Events first.</Empty>
        )}
      </Section>

      <Section title={`Scheduled · ${scheduled.length}`}>
        {scheduled.length ? (
          <div className="space-y-3">
            {scheduled.map((a) => (
              <div key={a.id} className="card p-4">
                <div className="text-[12px] text-zinc-400">
                  goes out {a.scheduledAt ? formatWhen(a.scheduledAt, tz) : "soon"} · to {describeTargets(a.targets)}
                </div>
                <div className="mt-1 text-[15px] font-medium">{a.title}</div>
                <div className="mt-1 text-[13px] whitespace-pre-wrap text-zinc-700">{a.text}</div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>Nothing scheduled.</Empty>
        )}
      </Section>

      <Section title={`Posted · ${sent.length}`}>
        {sent.length ? (
          <div className="space-y-3">
            {sent.map((a) => (
              <Posted key={a.id} a={a} tz={tz} />
            ))}
          </div>
        ) : (
          <Empty>Nothing posted yet.</Empty>
        )}
      </Section>

      {notPosted.length ? (
        <Section title="Not posted">
          <div className="card divide-y divide-zinc-100">
            {notPosted.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                <span className="truncate">{a.title}</span>
                <span className="shrink-0 text-[12px] text-zinc-400">
                  {STATUS_LABEL[a.status]} · {ago(a.updatedAt)}
                </span>
              </div>
            ))}
          </div>
        </Section>
      ) : null}
    </>
  );
}

function Posted({ a, tz }: { a: AnnouncementView; tz: string }) {
  const approved = a.versions.filter((v) => v.status === "approved");
  return (
    <div className="card p-4">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="badge border-emerald-200 bg-emerald-50 text-emerald-700">version {a.liveVersion}</span>
        <span className="text-[12px] text-zinc-400">
          posted {a.sentAt ? formatWhen(a.sentAt, tz) : ""} · {a.origin === "decision" ? "from a decision in crew chat" : `asked by ${a.requestedBy}`}
        </span>
      </div>
      <div className="text-[15px] font-medium">{a.title}</div>
      <div className="mt-1 text-[13px] whitespace-pre-wrap text-zinc-700">{a.text}</div>
      <ul className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
        {a.posts.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2 rounded-md bg-zinc-50 px-2.5 py-1.5 text-[12.5px]">
            <span className="truncate">
              {PLATFORM[p.platform ?? ""] ?? p.platform ?? "Switch"} · {short(p.spaceName)}
            </span>
            <span className={`shrink-0 ${p.status === "failed" ? "text-red-600" : "text-zinc-500"}`}>
              {POST_LABEL[p.status] ?? p.status} · v{p.version}
            </span>
          </li>
        ))}
      </ul>
      {approved.length > 1 ? (
        <div className="mt-2 text-[12px] text-zinc-500">
          {approved.map((v) => `v${v.version} by ${v.approvedBy ?? "?"}`).join(" · ")}
        </div>
      ) : null}
      {!a.waiting ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-[12.5px] font-medium text-zinc-600">Edit everywhere</summary>
          <form action={editAnnouncement} className="mt-2 space-y-2">
            <input type="hidden" name="announcementId" value={a.id} />
            <textarea className="textarea" name="text" rows={3} defaultValue={a.text ?? ""} />
            <button className="btn">Send the new version for approval</button>
          </form>
        </details>
      ) : (
        <p className="muted mt-2">A new version is waiting for its OK above.</p>
      )}
    </div>
  );
}
