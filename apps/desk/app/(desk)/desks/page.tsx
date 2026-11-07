import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { ago, liveEvents } from "@/lib/data";
import { community } from "@/lib/db";
import { DESK_PLATFORMS, DESK_STATUS_LABEL, cellText, eventDesks, kindSkills, openDeskCards, packPreviews, spacesForDesk, type DeskView } from "@/lib/desks";
import { deskPlatformName, deskRoomName, sheetSummary, whoText, type DeskSkill } from "@/lib/ferri";
import { AutoRefresh } from "../refresh";
import { Composer, Empty, Note, PageHead, Section } from "../ui";
import { answerDeskCard, makeDesk, removeDesk, setupPack, spaceToDesk } from "./actions";

const STATUS_STYLE: Record<string, string> = {
  planned: "bg-amber-50 text-amber-700",
  created: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
  removed: "bg-zinc-100 text-zinc-500",
};
const MODE_LABEL: Record<string, string> = { auto: "Auto", approve: "Approve", listen: "Listen" };
const CARE_LABEL: Record<string, string> = { normal: "care as usual", off: "no care reading", help: "the Builder helps here at any stage" };
const quiet = "h-9 rounded-full px-3 text-[13px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900";
const more = "inline-flex cursor-pointer list-none items-center gap-1 text-[12.5px] font-medium text-zinc-500 hover:text-zinc-900 [&::-webkit-details-marker]:hidden";

/** "private · Auto · invites topic:judging · sheet Scores". */
function skillFacts(s: DeskSkill): string {
  return [s.visibility, MODE_LABEL[s.mode] ?? s.mode, `invites ${whoText(s.who)}`, `cards to ${s.topic}`, CARE_LABEL[s.care], s.sheet ? `sheet: ${s.sheet.name} (${s.sheet.columns.join(", ")})` : null].filter(Boolean).join(" · ");
}

type Search = { note?: string; event?: string };

export default async function DesksPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { note, event: slug } = await searchParams;
  const c = await community();
  const evs = await liveEvents(c.id);
  const ev = evs.find((e) => e.slug === slug) ?? evs[0];
  const sub = "A room for one job at the event: judging, help, check-in.";
  const about = (
    <>
      <p>Each desk is made from a Switch template, with a skill that sets how Ferri works there.</p>
      <p>Desks with a sheet keep a live table from what people post in the room.</p>
    </>
  );
  if (!ev) {
    return (
      <>
        <PageHead title="Desks" sub={sub} about={about} />
        <Note note={note} />
        <Empty>No live event yet. Add one on the Events page, then set up its desks here.</Empty>
      </>
    );
  }
  const [list, kinds, packs, free, waiting] = await Promise.all([eventDesks(c.id, ev.id), kindSkills(c.id), packPreviews(c.id), spacesForDesk(c.id, ev.id), openDeskCards(c.id, ev.id)]);
  const ids = (
    <>
      <input type="hidden" name="eventId" value={ev.id} />
      <input type="hidden" name="eventSlug" value={ev.slug} />
    </>
  );
  const kindOptions = kinds.map((k) => (
    <option key={k.kind} value={k.kind} disabled={!k.skill}>
      {k.skill ? `${k.skill.title} (#${deskRoomName(ev, k.skill.room)})` : `${k.kind} (skill not valid)`}
    </option>
  ));
  const chip = (on: boolean) => `rounded-full px-2.5 py-1 text-[12px] font-medium ${on ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`;

  return (
    <>
      <AutoRefresh seconds={10} />
      <PageHead
        title="Desks"
        sub={sub}
        about={about}
        action={
          evs.length > 1 ? (
            <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
              {evs.map((e) => (
                <Link key={e.id} className={chip(e.id === ev.id)} href={`/desks?event=${encodeURIComponent(e.slug)}`}>
                  {e.name}
                </Link>
              ))}
            </div>
          ) : undefined
        }
      />
      <Note note={note} />

      {waiting.length ? (
        <Section title="Waiting for your OK" count={waiting.length}>
          <div className="space-y-4">
            {waiting.map((card) => (
              <article key={card.id} className="card p-5 sm:p-6">
                <div className="text-[12.5px] text-zinc-500">Desk card · {ago(card.createdAt)} · also in the crew room and Pocket</div>
                <h3 className="mt-1 text-[16px] font-semibold text-zinc-900">{card.question}</h3>
                {card.draftText ? (
                  <details className="group mt-2">
                    <summary className={more}>
                      What it makes
                      <ChevronDown size={13} className="transition group-open:rotate-180" aria-hidden />
                    </summary>
                    <pre className="mt-2 max-h-80 overflow-auto rounded-[12px] bg-zinc-100 p-3 text-[12px] whitespace-pre-wrap text-zinc-700">{card.draftText}</pre>
                  </details>
                ) : null}
                <form action={answerDeskCard} className="mt-4 flex flex-wrap gap-2">
                  <input type="hidden" name="cardId" value={card.id} />
                  <input type="hidden" name="back" value={`/desks?event=${encodeURIComponent(ev.slug)}`} />
                  <button className="btn-primary" name="choice" value="make">
                    Make {card.payload && (card.payload as { type?: string }).type === "custom" ? "it" : "them"}
                  </button>
                  <button className={quiet} name="choice" value="skip">
                    Don&apos;t
                  </button>
                </form>
              </article>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title={ev.name} count={list.filter((d) => d.status === "created").length}>
        {list.length ? (
          <div className="space-y-3">
            {list.map((d) => (
              <DeskCard key={d.id} d={d} eventSlug={ev.slug} eventId={ev.id} />
            ))}
          </div>
        ) : (
          <Empty pose="carry" title="No desks yet">
            Set up a pack or make one desk below, or say “@ferri set up the desks for a meetup” in the crew room.
          </Empty>
        )}
      </Section>

      <div className="mb-10 flex flex-col gap-2">
        <Composer label="Make a desk" className="">
          <form action={makeDesk} className="card grid gap-3 p-5 sm:grid-cols-2">
            {ids}
            <div>
              <label className="label" htmlFor="desk-kind">
                Kind
              </label>
              <select id="desk-kind" className="input" name="kind" defaultValue="judging">
                {kindOptions}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="desk-name">
                Name (optional, for a second desk of a kind)
              </label>
              <input id="desk-name" className="input" name="name" placeholder="finals judging" />
            </div>
            <div>
              <label className="label" htmlFor="desk-members">
                Invite (comma separated; empty: the skill&apos;s “who”)
              </label>
              <input id="desk-members" className="input" name="members" placeholder="arjun, priya" />
            </div>
            <div>
              <label className="label" htmlFor="desk-platform">
                Platform
              </label>
              <select id="desk-platform" className="input" name="platform" defaultValue="">
                {DESK_PLATFORMS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <button className="btn-primary">Make the desk</button>
              <span className="text-[12.5px] text-zinc-500">Ferri makes the room, invites people and posts the kickoff.</span>
            </div>
          </form>
        </Composer>

        <Composer label="Set up a pack" className="">
          <div className="grid gap-3 sm:grid-cols-2">
            {packs.map((p) => (
              <div key={p.type} className="card-flat p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[15px] font-semibold text-zinc-900">{p.pack?.title ?? p.type}</h3>
                  <Link className="text-[12px] text-zinc-500 hover:text-zinc-900" href={`/skills?key=${encodeURIComponent(`packs/${p.type}`)}`}>
                    Edit
                  </Link>
                </div>
                {p.pack ? (
                  <>
                    <p className="mt-1 text-[13px] text-zinc-600">{p.pack.body}</p>
                    <details className="group mt-2">
                      <summary className={more}>
                        {p.desks.length} rooms
                        <ChevronDown size={13} className="transition group-open:rotate-180" aria-hidden />
                      </summary>
                      <ul className="mt-2 space-y-1.5 text-[13px]">
                        {p.desks.map((d) => (
                          <li key={d.kind}>
                            {d.skill ? (
                              <>
                                <span className="font-medium">#{deskRoomName(ev, d.skill.room)}</span> <span className="text-zinc-500">{d.skill.title}</span>
                                <div className="text-[12px] text-zinc-500">{skillFacts(d.skill)}</div>
                              </>
                            ) : (
                              <span className="text-red-700">{d.kind}: the skill is not valid</span>
                            )}
                          </li>
                        ))}
                      </ul>
                      {p.pack.instructions ? <div className="mt-2 text-[12px] text-zinc-500">Adds to the event&apos;s instructions: {p.pack.instructions}</div> : null}
                      {p.pack.tasks.length ? <div className="mt-1 text-[12px] text-zinc-500">Starter tasks on the plan: {p.pack.tasks.join("; ")}</div> : null}
                    </details>
                    <form action={setupPack} className="mt-3">
                      {ids}
                      <input type="hidden" name="type" value={p.type} />
                      <button className="btn">Set up these desks</button>
                    </form>
                  </>
                ) : (
                  <div className="mt-1 text-[13px] text-red-700">Not valid: {p.error}</div>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[12.5px] text-zinc-500">The pack goes on one desk card in the crew room and Pocket; “Make them” makes every room.</p>
        </Composer>

        <Composer label="Turn a space into a desk" className="">
          {free.length ? (
            <form action={spaceToDesk} className="card grid gap-3 p-5 sm:grid-cols-3">
              {ids}
              <div>
                <label className="label" htmlFor="s2d-space">
                  Space
                </label>
                <select id="s2d-space" className="input" name="spaceId">
                  {free.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({MODE_LABEL[s.mode] ?? s.mode})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="s2d-kind">
                  Kind
                </label>
                <select id="s2d-kind" className="input" name="kind" defaultValue="volunteers">
                  {kindOptions}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="s2d-mode">
                  Mode
                </label>
                <select id="s2d-mode" className="input" name="mode" defaultValue="keep">
                  <option value="keep">Keep the space&apos;s mode</option>
                  <option value="skill">Use the desk&apos;s mode</option>
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
                <button className="btn">Make it a desk</button>
                <span className="text-[12.5px] text-zinc-500">No new room: the skill and sheet apply from the next message.</span>
              </div>
            </form>
          ) : (
            <Empty quiet>Every members space of {ev.name} is a desk already, or none is attached. Attach spaces on the Spaces page.</Empty>
          )}
        </Composer>
      </div>
    </>
  );
}

function DeskCard({ d, eventSlug, eventId }: { d: DeskView; eventSlug: string; eventId: string }) {
  const sheet = d.skill?.sheet ?? null;
  const groups = sheet?.summary ? sheetSummary(sheet, d.rows) : [];
  const shown = d.rows.slice(-50).reverse();
  const facts = [d.platform ? deskPlatformName(d.platform) : null, d.mode ? (MODE_LABEL[d.mode] ?? d.mode) : null, d.visibility, d.members.length ? `with ${d.members.join(", ")}` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <article className="card-flat p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[15.5px] font-semibold text-zinc-900">{d.title}</h3>
        <span className="font-mono text-[12px] text-zinc-500">#{d.roomName}</span>
        {d.status !== "created" ? <span className={`badge ${STATUS_STYLE[d.status] ?? ""}`}>{DESK_STATUS_LABEL[d.status] ?? d.status}</span> : null}
      </div>
      <div className="mt-0.5 text-[12.5px] text-zinc-500">
        {facts}
        {d.status === "planned" ? (d.cardId ? " · waiting on its desk card in the crew room" : " · Ferri makes it at its next tick") : ""}
      </div>
      {d.status === "failed" && d.error ? <div className="mt-1 text-[12.5px] text-red-700">{d.error}</div> : null}
      {!d.skill ? <div className="mt-1 text-[12.5px] text-red-700">Skill: {d.skillError}</div> : null}

      {sheet && d.status === "created" ? (
        <div className="mt-3">
          {groups.length ? (
            <div className="text-[13px] text-zinc-700">
              {groups.slice(0, 10).map((g, i) => (
                <span key={g.key} className="mr-3 inline-block">
                  {i + 1}. {g.key}: <span className="font-semibold">{g.value}</span>
                </span>
              ))}
            </div>
          ) : null}
          {shown.length ? (
            <details className="group mt-2">
              <summary className={more}>
                {sheet.name} · {d.rowCount} rows
                <ChevronDown size={13} className="transition group-open:rotate-180" aria-hidden />
              </summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-[12px]">
                  <thead className="text-zinc-500">
                    <tr>
                      {sheet.columns.map((col) => (
                        <th key={col} className="py-1 pr-3 font-medium">
                          {col.replace(/_/g, " ")}
                        </th>
                      ))}
                      <th className="py-1 pr-3 font-medium">by</th>
                      <th className="py-1 font-medium">when</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {shown.map((r) => (
                      <tr key={r.id}>
                        {sheet.columns.map((col) => (
                          <td key={col} className="py-1 pr-3">
                            {cellText(r.data[col])}
                          </td>
                        ))}
                        <td className="py-1 pr-3 text-zinc-500">{r.by}</td>
                        <td className="py-1 text-zinc-500">{ago(r.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {d.rowCount > shown.length ? <div className="mt-1 text-[12px] text-zinc-500">The latest {shown.length} of {d.rowCount}; the CSV has all of them.</div> : null}
              </div>
            </details>
          ) : (
            <div className="mt-1 text-[12.5px] text-zinc-500">
              {sheet.name}: nothing yet. Ferri adds a row when someone posts an entry in #{d.roomName}.
            </div>
          )}
        </div>
      ) : null}

      <details className="group mt-3">
        <summary className={more}>
          More
          <ChevronDown size={13} className="transition group-open:rotate-180" aria-hidden />
        </summary>
        <div className="mt-2 space-y-2 text-[12.5px] text-zinc-500">
          <div>
            Asked by {d.requestedBy} {ago(d.createdAt)}
            {d.sheetDocumentId ? " · the sheet is also a Switch document in the room" : ""}
          </div>
          {d.skill ? <div>{skillFacts(d.skill)}</div> : null}
          {d.skillText ? (
            <pre className="max-h-80 overflow-auto rounded-[12px] bg-zinc-100 p-3 text-[12px] whitespace-pre-wrap text-zinc-700">{d.skillText}</pre>
          ) : null}
          <div className="flex flex-wrap items-center gap-4">
            {sheet && d.status === "created" ? (
              <a className="hover:text-zinc-900" href={`/desks/${d.id}/csv`}>
                Download CSV
              </a>
            ) : null}
            <Link className="hover:text-zinc-900" href={`/skills?key=${encodeURIComponent(d.skillKey)}`}>
              Edit the skill ({d.skillKey}
              {d.skillEdited ? ", edited" : ""})
            </Link>
            {d.status === "created" ? (
              <form action={removeDesk}>
                <input type="hidden" name="deskId" value={d.id} />
                <input type="hidden" name="eventId" value={eventId} />
                <input type="hidden" name="eventSlug" value={eventSlug} />
                <button className="hover:text-red-700">No longer a desk</button>
              </form>
            ) : null}
          </div>
        </div>
      </details>
    </article>
  );
}
