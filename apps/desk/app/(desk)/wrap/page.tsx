import Link from "next/link";
import { ago, fmt } from "@/lib/data";
import { community } from "@/lib/db";
import { recapLines, type Lessons, type RecapStats } from "@/lib/ferri";
import { pickEvent, statTiles, wrapEvents, wrapView } from "@/lib/wrap";
import { AutoRefresh } from "../refresh";
import { Empty, Note, PageHead, Section } from "../ui";
import { closeEvent, freshRecap, notYet, rebuildKit, reopenEvent, savePartnersNow, startEventFromKit } from "./actions";

const ORIGIN_LABEL: Record<string, string> = { chat: "asked in chat", desk: "asked in Desk", ferri: "Ferri, after the event", close: "made when it closed" };
const MODE_LABEL: Record<string, string> = { listen: "Listen", approve: "Approve", auto: "Auto" };

export default async function WrapPage({ searchParams }: { searchParams: Promise<{ note?: string; event?: string }> }) {
  const { note, event: slug } = await searchParams;
  const c = await community();
  const all = await wrapEvents(c.id);
  const ev = pickEvent(all, slug);
  const sub = "After the event: the numbers from Ferri's records, the lessons, the partners saved to contacts, the starter kit for next time, and closing the event (its spaces Off or moved to the next one).";
  if (!ev) {
    return (
      <>
        <PageHead title="Wrap" sub={sub} />
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

  return (
    <>
      <AutoRefresh seconds={10} />
      <PageHead
        title="Wrap"
        sub={sub}
        action={
          all.length > 1 ? (
            <div className="flex max-w-[50%] shrink-0 flex-wrap justify-end gap-1.5 text-[12px]">
              {all.map((e) => (
                <Link key={e.id} className={`badge ${e.id === ev.id ? "bg-zinc-900 text-white" : ""}`} href={`/wrap?event=${encodeURIComponent(e.slug)}`}>
                  {e.name}
                  {e.closedAt ? " · closed" : ""}
                </Link>
              ))}
            </div>
          ) : undefined
        }
      />
      <Note note={note} />

      <div className="card mb-8 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[18px] font-semibold tracking-tight">{ev.name}</span>
          <span className="badge">{ev.stage}</span>
          {ev.closedAt ? <span className="badge border-zinc-300 bg-zinc-100 text-zinc-700">closed {fmt(ev.closedAt)}{ev.closedBy ? ` by ${ev.closedBy}` : ""}</span> : <span className="badge border-emerald-200 bg-emerald-50 text-emerald-700">live</span>}
        </div>
        <div className="mt-1 text-[13px] text-zinc-500">
          {fmt(ev.startsAt)} to {fmt(ev.endsAt)} · {ev.venue ?? "no venue"}
          {ev.wrapProposedAt ? ` · Ferri proposed the wrap ${ago(ev.wrapProposedAt)}` : ""}
        </div>
        {v.pending.length ? <div className="mt-2 text-[13px] text-amber-700">Ferri is on it: {v.pending.join("; ")}.</div> : null}

        <div className="mt-4 flex flex-wrap items-start gap-3">
          {ev.closedAt ? (
            <form action={reopenEvent}>
              {ids}
              <button className="btn-primary">Reopen</button>
              <p className="mt-1 max-w-sm text-[12px] text-zinc-500">Its saved spaces come back with their modes (moved back from wherever they are now), and Ferri answers there again.</p>
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
                  <button className="btn">Not yet</button>
                </form>
              </div>
            </div>
          ) : (
            <form action={closeEvent} className="space-y-2">
              {ids}
              <div className="text-[13px] font-medium">Close {ev.name}</div>
              <label className="flex items-center gap-2 text-[13px]">
                <input type="radio" name="how" value="off" defaultChecked /> Its {v.stats.spaces.count} spaces go Off
              </label>
              {v.others.length ? (
                <label className="flex items-center gap-2 text-[13px]">
                  <input type="radio" name="how" value="move" /> Move them, with the same modes, to
                  <select className="input w-auto py-1" name="moveTo" defaultValue={newest?.id}>
                    {v.others.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button className="btn-danger">Close the event</button>
              <p className="max-w-md text-[12px] text-zinc-500">
                Ferri makes a fresh recap and kit, says goodbye in the crew room, closes the event&apos;s open cards and cancels what is still scheduled. Open care cases stay open here. You can reopen it.
              </p>
            </form>
          )}
          <div className="flex flex-wrap gap-2">
            <form action={freshRecap}>
              {ids}
              <button className="btn">Make a fresh recap</button>
            </form>
            <form action={rebuildKit}>
              {ids}
              <button className="btn">{v.kit ? "Pack the kit again" : "Pack the starter kit"}</button>
            </form>
            <form action={savePartnersNow}>
              {ids}
              <button className="btn">Save the partners</button>
            </form>
          </div>
        </div>
      </div>

      <Section title="The numbers">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="card p-3">
              <div className="text-[12px] text-zinc-500">{t.label}</div>
              <div className="text-[22px] font-semibold tracking-tight">{t.value}</div>
              {t.note ? <div className="text-[12px] text-zinc-400">{t.note}</div> : null}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-zinc-400">Counted now from Ferri&apos;s own records.</p>
      </Section>

      <Section title="Recap and lessons" aside={v.recap ? <span className="text-[12px] text-zinc-400">{ORIGIN_LABEL[v.recap.origin] ?? v.recap.origin} · {v.recap.requestedBy} · {ago(v.recap.createdAt)}</span> : undefined}>
        {v.recap ? (
          <div className="card space-y-4 p-4 text-[13px]">
            <ul className="list-disc space-y-1 pl-5">
              {recapLines(v.recap.stats as unknown as RecapStats).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            {lessons ? (
              <div className="grid gap-4 sm:grid-cols-3">
                {(
                  [
                    ["What went well", lessons.wentWell],
                    ["To fix next time", lessons.toFix],
                    ["Answer early next time", lessons.answerEarly],
                  ] as const
                ).map(([title, xs]) => (
                  <div key={title}>
                    <div className="mb-1 font-medium">{title}</div>
                    {xs.length ? (
                      <ul className="list-disc space-y-1 pl-5 text-zinc-700">
                        {xs.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-zinc-400">Nothing to say.</div>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <Empty>No recap yet. Ferri makes one after the event, or ask for it: “@ferri how did {ev.name} go?”, or Make a fresh recap above.</Empty>
        )}
      </Section>

      <Section title={`Partners saved · ${v.partners.length}`} aside={<Link className="text-[12px] underline underline-offset-2" href="/contacts">Contacts</Link>}>
        {v.partners.length ? (
          <div className="card divide-y divide-zinc-100">
            {v.partners.map((p) => (
              <div key={p.contactId} className="flex items-center justify-between gap-4 px-4 py-2.5 text-[13px]">
                <div>
                  <span className="font-medium">{p.org}</span> <span className="badge">{p.role}</span>
                  {p.note ? <span className="ml-2 text-zinc-500">{p.note}</span> : null}
                </div>
                <div className="text-[12px] text-zinc-400">{p.email ?? "no address"} · {p.status}</div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>No partners saved yet. Save the partners above, or ask: “@ferri save the partners to contacts”. Nobody is emailed.</Empty>
        )}
      </Section>

      <Section
        title="Starter kit"
        aside={
          v.kit ? (
            <a className="btn" href={`/wrap/kit/${v.kit.id}`}>
              Download markdown
            </a>
          ) : undefined
        }
      >
        {v.kit && k ? (
          <div className="card p-4 text-[13px]">
            <div className="font-medium">{v.kit.name}</div>
            <div className="mt-0.5 text-zinc-500">
              Packed {ago(v.kit.updatedAt)} · {k.knowledge.keep.length} to keep, {k.knowledge.check.length} to check · {k.questions.top.length} asked most,{" "}
              {k.questions.unanswered.length} unanswered · {k.plan.decisions.length} decisions, {k.plan.tasks.length} tasks · {k.crew.length} crew · {k.partners.length} partners
            </div>
            {k.spaces.length ? (
              <div className="mt-2 text-zinc-600">
                Spaces saved: {k.spaces.map((s) => `${s.name} (${s.role === "crew" ? "crew room" : MODE_LABEL[s.mode]})`).join(", ")}
              </div>
            ) : null}
            <details className="mt-3">
              <summary className="cursor-pointer text-zinc-600">View the kit</summary>
              <pre className="mt-2 max-h-[480px] overflow-auto rounded-md bg-zinc-50 p-3 text-[12px] whitespace-pre-wrap">{v.kit.markdown}</pre>
            </details>
            <form action={startEventFromKit} className="mt-4 flex flex-wrap items-end gap-2 border-t border-zinc-100 pt-3">
              <input type="hidden" name="kitId" value={v.kit.id} />
              <input type="hidden" name="back" value={`/wrap?event=${ev.slug}`} />
              <div>
                <label className="label">Start the next event from this kit</label>
                <input className="input" name="name" placeholder={`${ev.name} 2`} required />
              </div>
              <div>
                <label className="label">Starts</label>
                <input className="input" type="datetime-local" name="startsAt" />
              </div>
              <button className="btn-primary">Start it</button>
            </form>
          </div>
        ) : (
          <Empty>No kit yet. Ferri packs one when the event closes, or Pack the starter kit above.</Empty>
        )}
      </Section>
    </>
  );
}
