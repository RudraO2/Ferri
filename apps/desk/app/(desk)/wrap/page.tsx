import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { ago, fmt } from "@/lib/data";
import { community } from "@/lib/db";
import { recapLines, type Lessons, type RecapStats } from "@/lib/ferri";
import { pickEvent, statTiles, wrapEvents, wrapView } from "@/lib/wrap";
import { AutoRefresh } from "../refresh";
import { Empty, Fold, Note, PageHead, Section } from "../ui";
import { closeEvent, freshRecap, notYet, rebuildKit, reopenEvent, savePartnersNow, startEventFromKit } from "./actions";

const ORIGIN_LABEL: Record<string, string> = { chat: "asked in chat", desk: "asked in Desk", ferri: "Ferri, after the event", close: "made when it closed" };
const MODE_LABEL: Record<string, string> = { listen: "Listen", approve: "Approve", auto: "Auto" };
const quiet = "h-8 rounded-full px-3 text-[12.5px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900";

export default async function WrapPage({ searchParams }: { searchParams: Promise<{ note?: string; event?: string }> }) {
  const { note, event: slug } = await searchParams;
  const c = await community();
  const all = await wrapEvents(c.id);
  const ev = pickEvent(all, slug);
  const sub = "After the event: the numbers, the lessons, and a kit for next time.";
  const about = (
    <>
      <p>Every number is counted from Ferri&apos;s own records. Partners are saved to Contacts; nobody is emailed.</p>
      <p>Closing turns the event&apos;s spaces Off or moves them to the next event. You can reopen it.</p>
    </>
  );
  if (!ev) {
    return (
      <>
        <PageHead title="Wrap" sub={sub} about={about} />
        <Note note={note} />
        <Empty>No events yet.</Empty>
      </>
    );
  }
  const v = await wrapView(ev, all);
  const tiles = statTiles(v.stats);
  const lessons = (v.recap?.lessons ?? null) as Lessons | null;
  const k = v.kitContent;
  const ids = (
    <>
      <input type="hidden" name="eventId" value={ev.id} />
      <input type="hidden" name="eventSlug" value={ev.slug} />
    </>
  );
  const newest = v.others[0] ?? null;
  const chip = (on: boolean) => `rounded-full px-2.5 py-1 text-[12px] font-medium ${on ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`;

  return (
    <>
      <AutoRefresh seconds={10} />
      <PageHead
        title="Wrap"
        sub={sub}
        about={about}
        action={
          all.length > 1 ? (
            <div className="flex shrink-0 flex-wrap gap-1.5 sm:max-w-[50%] sm:justify-end">
              {all.map((e) => (
                <Link key={e.id} className={chip(e.id === ev.id)} href={`/wrap?event=${encodeURIComponent(e.slug)}`}>
                  {e.name}
                  {e.closedAt ? " · closed" : ""}
                </Link>
              ))}
            </div>
          ) : undefined
        }
      />
      <Note note={note} />

      <section className="card mb-10 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[19px] font-semibold tracking-tight text-zinc-900">{ev.name}</h2>
          {ev.closedAt ? <span className="badge">closed</span> : <span className="badge bg-emerald-50 text-emerald-700">live</span>}
        </div>
        <div className="mt-1 text-[12.5px] text-zinc-500">
          {ev.stage} · {fmt(ev.startsAt)} to {fmt(ev.endsAt)}
          {ev.venue ? ` · ${ev.venue}` : ""}
          {ev.closedAt ? ` · closed ${fmt(ev.closedAt)}${ev.closedBy ? ` by ${ev.closedBy}` : ""}` : ""}
          {ev.wrapProposedAt && !ev.closedAt ? ` · Ferri proposed the wrap ${ago(ev.wrapProposedAt)}` : ""}
        </div>
        {v.pending.length ? <div className="mt-2 text-[13px] text-amber-700">Ferri is on it: {v.pending.join("; ")}.</div> : null}

        <div className="mt-5">
          {ev.closedAt ? (
            <form action={reopenEvent} className="flex flex-wrap items-center gap-3">
              {ids}
              <button className="btn-primary">Reopen</button>
              <span className="text-[12.5px] text-zinc-500">Its spaces come back with their modes, and Ferri answers there again.</span>
            </form>
          ) : v.card ? (
            <div>
              <div className="mb-2 text-[13px] text-zinc-600">The close card is open in the crew room. Answering here answers it as you.</div>
              <div className="flex flex-wrap gap-2">
                <form action={closeEvent}>
                  {ids}
                  <input type="hidden" name="how" value="off" />
                  <button className="btn-danger">Close, spaces Off</button>
                </form>
                {v.card.moveTo ? (
                  <form action={closeEvent}>
                    {ids}
                    <input type="hidden" name="how" value="move" />
                    <input type="hidden" name="moveTo" value={v.card.moveTo} />
                    <button className="btn">Close and move the spaces to {v.card.moveToName ?? "the next event"}</button>
                  </form>
                ) : null}
                <form action={notYet}>
                  {ids}
                  <button className={quiet}>Not yet</button>
                </form>
              </div>
            </div>
          ) : (
            <details className="group">
              <summary className="btn cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                Close the event
                <ChevronDown size={14} className="transition group-open:rotate-180" aria-hidden />
              </summary>
              <form action={closeEvent} className="mt-3 space-y-2 rounded-[14px] bg-zinc-100/60 p-4">
                {ids}
                <label className="flex items-center gap-2 text-[13px] text-zinc-800">
                  <input type="radio" name="how" value="off" defaultChecked /> Its {v.stats.spaces.count} spaces go Off
                </label>
                {v.others.length ? (
                  <label className="flex flex-wrap items-center gap-2 text-[13px] text-zinc-800">
                    <input type="radio" name="how" value="move" /> Move them, with the same modes, to
                    <select className="input w-auto py-1" name="moveTo" defaultValue={newest?.id} aria-label="Move the spaces to">
                      {v.others.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <p className="max-w-lg text-[12.5px] text-zinc-500">
                  Ferri makes a fresh recap and kit, says goodbye in the crew room, closes open cards and cancels what is still scheduled. Open care cases stay open.
                </p>
                <button className="btn-danger">Close {ev.name}</button>
              </form>
            </details>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-1 border-t border-zinc-100 pt-3">
          <form action={freshRecap}>
            {ids}
            <button className={quiet}>Make a fresh recap</button>
          </form>
          <form action={rebuildKit}>
            {ids}
            <button className={quiet}>{v.kit ? "Pack the kit again" : "Pack the starter kit"}</button>
          </form>
          <form action={savePartnersNow}>
            {ids}
            <button className={quiet}>Save the partners</button>
          </form>
        </div>
      </section>

      <Section title="The numbers">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="card-flat p-4">
              <div className="text-[12.5px] text-zinc-500">{t.label}</div>
              <div className="num mt-1.5 text-[26px] leading-none text-zinc-900">{t.value}</div>
              {t.note ? <div className="mt-1.5 text-[12px] text-zinc-500">{t.note}</div> : null}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Recap and lessons" aside={v.recap ? <span className="text-[12px] text-zinc-500">{ORIGIN_LABEL[v.recap.origin] ?? v.recap.origin} · {v.recap.requestedBy} · {ago(v.recap.createdAt)}</span> : undefined}>
        {v.recap ? (
          <div className="card-flat space-y-5 p-5 text-[13.5px]">
            <ul className="list-disc space-y-1 pl-5 text-zinc-800">
              {recapLines(v.recap.stats as unknown as RecapStats).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            {lessons ? (
              <div className="grid gap-5 sm:grid-cols-3">
                {(
                  [
                    ["What went well", lessons.wentWell],
                    ["To fix next time", lessons.toFix],
                    ["Answer early next time", lessons.answerEarly],
                  ] as const
                ).map(([title, xs]) => (
                  <div key={title}>
                    <h3 className="mb-1 font-semibold text-zinc-900">{title}</h3>
                    {xs.length ? (
                      <ul className="list-disc space-y-1 pl-5 text-zinc-700">
                        {xs.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-zinc-500">Nothing to say.</div>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <Empty pose="party" title="No recap yet">
            Ferri makes one after the event. Or ask: “@ferri how did {ev.name} go?”
          </Empty>
        )}
      </Section>

      <Fold title="Partners saved" count={v.partners.length} className="mb-2" hint={<Link className="underline underline-offset-2 hover:text-zinc-900" href="/contacts">Contacts</Link>}>
        {v.partners.length ? (
          <ul className="card-flat divide-y divide-zinc-100">
            {v.partners.map((p) => (
              <li key={p.contactId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 px-4 py-2.5 text-[13px]">
                <div className="min-w-0">
                  <span className="font-medium text-zinc-900">{p.org}</span> <span className="text-zinc-500">· {p.role}</span>
                  {p.note ? <span className="text-zinc-500"> · {p.note}</span> : null}
                </div>
                <div className="text-[12px] text-zinc-500">
                  {p.email ?? "no address"} · {p.status}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty quiet>No partners saved yet. Use Save the partners above, or say “@ferri save the partners to contacts”.</Empty>
        )}
      </Fold>

      <Fold title="Starter kit" hint={v.kit ? `packed ${ago(v.kit.updatedAt)}` : "not packed yet"}>
        {v.kit && k ? (
          <div className="card-flat p-5 text-[13px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-zinc-900">{v.kit.name}</h3>
              <a className="btn" href={`/wrap/kit/${v.kit.id}`}>
                Download markdown
              </a>
            </div>
            <div className="mt-1 text-[12.5px] text-zinc-500">
              {k.knowledge.keep.length} to keep, {k.knowledge.check.length} to check · {k.questions.top.length} asked most, {k.questions.unanswered.length} unanswered · {k.plan.decisions.length}{" "}
              decisions, {k.plan.tasks.length} tasks · {k.crew.length} crew · {k.partners.length} partners
            </div>
            {k.spaces.length ? (
              <div className="mt-2 text-zinc-600">Spaces saved: {k.spaces.map((s) => `${s.name} (${s.role === "crew" ? "crew room" : MODE_LABEL[s.mode]})`).join(", ")}</div>
            ) : null}
            <details className="group mt-3">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[12.5px] font-medium text-zinc-500 hover:text-zinc-900 [&::-webkit-details-marker]:hidden">
                View the kit
                <ChevronDown size={13} className="transition group-open:rotate-180" aria-hidden />
              </summary>
              <pre className="mt-2 max-h-[480px] overflow-auto rounded-[12px] bg-zinc-100 p-3 text-[12px] whitespace-pre-wrap">{v.kit.markdown}</pre>
            </details>
            <form action={startEventFromKit} className="mt-4 flex flex-wrap items-end gap-2 border-t border-zinc-100 pt-4">
              <input type="hidden" name="kitId" value={v.kit.id} />
              <input type="hidden" name="back" value={`/wrap?event=${ev.slug}`} />
              <div>
                <label className="label" htmlFor="kit-name">
                  Start the next event from this kit
                </label>
                <input id="kit-name" className="input" name="name" placeholder={`${ev.name} 2`} required />
              </div>
              <div>
                <label className="label" htmlFor="kit-starts">
                  Starts
                </label>
                <input id="kit-starts" className="input" type="datetime-local" name="startsAt" />
              </div>
              <button className="btn-primary">Start it</button>
            </form>
          </div>
        ) : (
          <Empty quiet>No kit yet. Ferri packs one when the event closes, or use Pack the starter kit above.</Empty>
        )}
      </Fold>
    </>
  );
}
