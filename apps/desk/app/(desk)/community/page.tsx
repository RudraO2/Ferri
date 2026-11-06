import { community } from "@/lib/db";
import { ago, muted } from "@/lib/data";
import { mutePerson, saveCommunity, unmutePerson } from "../actions";
import { Empty, Note, PageHead, Section } from "../ui";
import { SettingsForm } from "../settings-form";

export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  const { note } = await searchParams;
  const c = await community();
  const people = await muted(c.id);
  return (
    <>
      <PageHead title="Community" sub="Central instructions apply in every space, before any event's own instructions." />
      <Note note={note} />

      <Section title="Central instructions">
        <form action={saveCommunity} className="card grid grid-cols-6 gap-3 p-4">
          <div className="col-span-4">
            <label className="label">Name</label>
            <input className="input" name="name" defaultValue={c.name} />
          </div>
          <div className="col-span-2">
            <label className="label">Timezone</label>
            <input className="input" name="timezone" defaultValue={c.timezone} />
          </div>
          <div className="col-span-6">
            <label className="label">Tone and rules for Ferri everywhere</label>
            <textarea className="textarea" name="instructions" rows={7} defaultValue={c.instructions} />
          </div>
          <div className="col-span-6 flex items-center justify-between">
            <button className="btn-primary">Save</button>
            {c.deskEditedAt ? <span className="text-[12px] text-zinc-500">Edited in Desk: the seed leaves these settings alone.</span> : null}
          </div>
        </form>
      </Section>

      {/* Customization (spec 21): how Ferri behaves everywhere, unless an event or a space sets its own. */}
      <Section title="Settings">
        <p className="muted mb-3">
          These apply to every event unless the event (or, for tone and language, a single space) sets its own. The citation check, the approval cards and the pause stay
          in code: no setting turns them off.
        </p>
        <SettingsForm level="community" scope={{ communityId: c.id }} back="/community" />
      </Section>

      <Section title={`Mute list · ${people.length}`}>
        <p className="muted mb-3">Ferri ignores muted people everywhere: no answers, no cards. There are no other per-person settings.</p>
        <form action={mutePerson} className="card mb-3 flex flex-wrap items-end gap-2 p-3">
          <div>
            <label className="label">Platform</label>
            <select className="input w-[150px]" name="platform" defaultValue="*">
              <option value="*">Any platform</option>
              <option value="mattermost">Mattermost</option>
              <option value="slack">Slack</option>
              <option value="discord">Discord</option>
              <option value="telegram">Telegram</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </div>
          <div>
            <label className="label">Username</label>
            <input className="input w-[180px]" name="username" placeholder="arjun" />
          </div>
          <div className="min-w-[200px] flex-1">
            <label className="label">Note (optional)</label>
            <input className="input" name="note" placeholder="Why" />
          </div>
          <button className="btn">Mute</button>
        </form>
        {people.length ? (
          <div className="card divide-y divide-zinc-100">
            {people.map((p) => (
              <form key={p.id} action={unmutePerson} className="flex items-center justify-between px-4 py-2.5">
                <input type="hidden" name="id" value={p.id} />
                <div className="text-[13px]">
                  <span className="font-medium">{p.username}</span>
                  <span className="text-zinc-500">
                    {" "}
                    · {p.platform === "*" ? "any platform" : p.platform} · muted by {p.mutedBy} {ago(p.createdAt)}
                    {p.note ? ` · ${p.note}` : ""}
                  </span>
                </div>
                <button className="btn">Unmute</button>
              </form>
            ))}
          </div>
        ) : (
          <Empty>Nobody is muted.</Empty>
        )}
      </Section>
    </>
  );
}
