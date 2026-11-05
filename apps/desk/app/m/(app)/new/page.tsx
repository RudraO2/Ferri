import Link from "next/link";
import { liveEvents } from "@/lib/data";
import { community, db } from "@/lib/db";
import { announcementTargets } from "@/lib/ferri";
import { requirePocketUser } from "@/lib/session";
import { pocketNewAnnouncement } from "../../actions";
import { Toast, Where } from "../bits";

/** Write an announcement on the phone. It still needs one OK, which can be your own. */
export default async function NewAnnouncement({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  const { note } = await searchParams;
  await requirePocketUser("/m/new");
  const c = await community();
  const evs = await liveEvents(c.id);
  const targets = evs[0] ? await announcementTargets(db(), evs[0].id) : [];
  return (
    <>
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-200 bg-zinc-50/95 px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-3 backdrop-blur">
        <Link href="/m" className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 active:bg-zinc-200" aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <div className="text-[15px] font-semibold">New announcement</div>
      </header>
      <Toast note={note} />
      {evs.length ? (
        <form action={pocketNewAnnouncement} className="mt-4 space-y-4 px-4">
          {evs.length > 1 ? (
            <select className="input-lg" name="eventId" defaultValue={evs[0]!.id}>
              {evs.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          ) : (
            <input type="hidden" name="eventId" value={evs[0]!.id} />
          )}
          <textarea className="textarea-lg" name="text" rows={6} required placeholder="What should everyone know? It goes out exactly as you write it." />
          <div>
            <label className="mb-1 block px-1 text-[13px] font-medium text-zinc-500">Post at (empty: once approved)</label>
            <input className="input-lg" type="datetime-local" name="when" />
          </div>
          <div className="px-1">
            <div className="text-[13px] font-medium text-zinc-500">Goes to {evs.length > 1 ? `${evs[0]!.name}'s` : "every"} space</div>
            <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
              {targets.map((t) => (
                <li key={t.spaceId}>
                  <Where platform={t.platform} space={t.name} />
                </li>
              ))}
            </ul>
          </div>
          <button className="btn-lg-primary w-full">Send for approval</button>
          <p className="px-1 text-[13px] text-zinc-500">Announcements always need one OK. Its card shows up in Needs you, and yours counts.</p>
        </form>
      ) : (
        <p className="mt-6 px-5 text-[14px] text-zinc-500">No live event yet.</p>
      )}
    </>
  );
}
