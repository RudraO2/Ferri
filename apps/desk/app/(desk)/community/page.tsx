import { community } from "@/lib/db";
import { ago, muted } from "@/lib/data";
import { mutePerson, saveCommunity, unmutePerson } from "../actions";
import { Composer, Empty, Fold, Note, PageHead, Section } from "../ui";
import { SettingsForm } from "../settings-form";

export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  const { note } = await searchParams;
  const c = await community();
  const people = await muted(c.id);
  return (
    <>
      <PageHead
        title="Community"
        sub="How Ferri behaves in every space, before any event's own rules."
        about={c.deskEditedAt ? <p>Edited in Desk: the seed leaves these settings alone.</p> : undefined}
      />
      <Note note={note} />

      <Section title="Central instructions">
        <form action={saveCommunity} className="card space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-6">
            <div className="sm:col-span-4">
              <label className="label" htmlFor="cm-name">
                Name
              </label>
              <input id="cm-name" className="input" name="name" defaultValue={c.name} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="cm-tz">
                Timezone
              </label>
              <input id="cm-tz" className="input" name="timezone" defaultValue={c.timezone} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="cm-instructions">
              Tone and rules for Ferri everywhere
            </label>
            <textarea id="cm-instructions" className="textarea" name="instructions" rows={7} defaultValue={c.instructions} />
          </div>
          <button className="btn-primary">Save</button>
        </form>
      </Section>

      {/* Customization (spec 21): how Ferri behaves everywhere, unless an event or a space sets its own. */}
      <Fold title="Settings" hint="tone, language, timing" className="mb-2">
        <p className="muted mb-3">
          Every event uses these unless it sets its own (and, for tone and language, a single space). The citation check, the approval cards and the pause stay in code:
          no setting turns them off.
        </p>
        <SettingsForm level="community" scope={{ communityId: c.id }} back="/community" />
      </Fold>

      <Fold title="Mute list" count={people.length} hint="Ferri ignores these people everywhere">
        <Composer label="Mute someone" className="mb-3">
          <form action={mutePerson} className="card flex flex-wrap items-end gap-3 p-4">
            <div className="w-full sm:w-[160px]">
              <label className="label" htmlFor="mute-platform">
                Platform
              </label>
              <select id="mute-platform" className="input" name="platform" defaultValue="*">
                <option value="*">Any platform</option>
                <option value="mattermost">Mattermost</option>
                <option value="slack">Slack</option>
                <option value="discord">Discord</option>
                <option value="telegram">Telegram</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            </div>
            <div className="w-full sm:w-[180px]">
              <label className="label" htmlFor="mute-user">
                Username
              </label>
              <input id="mute-user" className="input" name="username" placeholder="arjun" />
            </div>
            <div className="min-w-0 flex-1 basis-[200px]">
              <label className="label" htmlFor="mute-note">
                Note (optional)
              </label>
              <input id="mute-note" className="input" name="note" placeholder="Why" />
            </div>
            <button className="btn">Mute</button>
          </form>
        </Composer>
        {people.length ? (
          <div className="card-flat divide-y divide-zinc-100">
            {people.map((p) => (
              <form key={p.id} action={unmutePerson} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <input type="hidden" name="id" value={p.id} />
                <div className="min-w-0 text-[13px]">
                  <div className="font-medium text-zinc-900">{p.username}</div>
                  <div className="truncate text-[12px] text-zinc-500">
                    {p.platform === "*" ? "any platform" : p.platform} · muted by {p.mutedBy} {ago(p.createdAt)}
                    {p.note ? ` · ${p.note}` : ""}
                  </div>
                </div>
                <button className="h-8 shrink-0 rounded-full px-3 text-[12.5px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900" aria-label={`Unmute ${p.username}`}>
                  Unmute
                </button>
              </form>
            ))}
          </div>
        ) : (
          <Empty quiet>Nobody is muted. There are no other per-person settings.</Empty>
        )}
      </Fold>
    </>
  );
}
