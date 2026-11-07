import { liveEvents } from "@/lib/data";
import { community, db } from "@/lib/db";
import { announcementTargets } from "@/lib/ferri";
import { shortSpace } from "@/lib/pocket";
import { requirePocketUser } from "@/lib/session";
import { PlatformLogo } from "@/components/platform";
import { pocketNewAnnouncement } from "../../actions";
import { BackHeader, Empty, Toast } from "../bits";

/** Write an announcement on the phone. It still needs one OK, which can be your own. */
export default async function NewAnnouncement({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  const { note } = await searchParams;
  await requirePocketUser("/m/new");
  const c = await community();
  const evs = await liveEvents(c.id);
  const targets = evs[0] ? await announcementTargets(db(), evs[0].id) : [];
  return (
    <>
      <BackHeader href="/m" title="New announcement" />
      <Toast note={note} />
      {evs.length ? (
        <form action={pocketNewAnnouncement} className="mt-3 space-y-4 px-4">
          {evs.length > 1 ? (
            <div>
              <label htmlFor="eventId" className="mb-1 block px-1 text-[13px] font-medium text-zinc-500">
                Event
              </label>
              <select id="eventId" className="input-lg" name="eventId" defaultValue={evs[0]!.id}>
                {evs.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <input type="hidden" name="eventId" value={evs[0]!.id} />
          )}
          <div>
            <label htmlFor="text" className="sr-only">
              Announcement
            </label>
            <textarea id="text" className="textarea-lg" name="text" rows={6} required placeholder="What should everyone know?" />
          </div>
          {targets.length ? (
            <ul className="flex flex-wrap gap-1.5 px-1" aria-label={`Goes to ${evs.length > 1 ? `${evs[0]!.name}'s` : "every"} space`}>
              {targets.map((t) => (
                <li key={t.spaceId} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-[12.5px] text-zinc-700">
                  <PlatformLogo platform={t.platform} size={13} />
                  {shortSpace(t.name)}
                </li>
              ))}
            </ul>
          ) : null}
          <details className="group">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center px-1 text-[14px] font-medium text-zinc-600 [&::-webkit-details-marker]:hidden">
              Schedule it for later
            </summary>
            <label htmlFor="when" className="mb-1 block px-1 text-[13px] font-medium text-zinc-500">
              Post at (empty: once approved)
            </label>
            <input id="when" className="input-lg" type="datetime-local" name="when" />
          </details>
          <button className="btn-lg-primary h-14 w-full text-[16px]">Send for approval</button>
          <p className="px-1 text-center text-[13px] text-zinc-500">It needs one OK, and yours counts.</p>
        </form>
      ) : (
        <Empty title="No live event yet" pose="announce" />
      )}
    </>
  );
}
