import Link from "next/link";
import { ago, liveEvents } from "@/lib/data";
import { community } from "@/lib/db";
import { DESK_PLATFORMS, DESK_STATUS_LABEL, cellText, eventDesks, kindSkills, openDeskCards, packPreviews, spacesForDesk, type DeskView } from "@/lib/desks";
import { deskPlatformName, deskRoomName, sheetSummary, whoText, type DeskSkill } from "@/lib/ferri";
import { AutoRefresh } from "../refresh";
import { Empty, Note, PageHead, Section } from "../ui";
import { answerDeskCard, makeDesk, removeDesk, setupPack, spaceToDesk } from "./actions";

const STATUS_STYLE: Record<string, string> = {
  planned: "border-amber-200 bg-amber-50 text-amber-700",
  created: "border-emerald-200 bg-emerald-50 text-emerald-700",
  failed: "border-red-200 bg-red-50 text-red-700",
  removed: "border-zinc-200 bg-zinc-50 text-zinc-500",
};
const MODE_LABEL: Record<string, string> = { auto: "Auto", approve: "Approve", listen: "Listen" };
const CARE_LABEL: Record<string, string> = { normal: "care as usual", off: "no care reading", help: "the Builder helps here at any stage" };

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
  const sub =
    "A desk is a room for one job at the event (judging, help, check-in, ...), made from a Switch template, with a skill that sets how Ferri works there. Desks with a sheet keep a live table from what people post.";
  if (!ev) {
    return (
      <>
        <PageHead title="Desks" sub={sub} />
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

  return (
    <>
      <AutoRefresh seconds={10} />
      <PageHead
        title="Desks"
        sub={sub}
        action={
          evs.length > 1 ? (
            <div className="flex shrink-0 flex-wrap justify-end gap-1.5 text-[12px]">
              {evs.map((e) => (
                <Link key={e.id} className={`badge ${e.id === ev.id ? "bg-zinc-900 text-white" : ""}`} href={`/desks?event=${encodeURIComponent(e.slug)}`}>
                  {e.name}
                </Link>
              ))}
            </div>
          ) : undefined
        }
      />
      <Note note={note} />

      {waiting.length ? (
        <Section title={`Waiting for an OK · ${waiting.length}`}>
          <div className="space-y-3">
            {waiting.map((card) => (
              <div key={card.id} className="card p-4">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="badge border-amber-200 bg-amber-50 text-amber-700">desk card</span>
                  <span className="text-[12px] text-zinc-400">{ago(card.createdAt)} · also in the crew room and Pocket</span>
                </div>
                <div className="text-[15px] font-medium">{card.question}</div>
                {card.draftText ? (
                  <details className="mt-1 text-[13px]">
                    <summary className="cursor-pointer text-[12px] text-zinc-500 hover:text-zinc-900">What it makes</summary>
                    <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-zinc-50 p-3 text-[12px] whitespace-pre-wrap text-zinc-700">{card.draftText}</pre>
                  </details>
                ) : null}
                <form action={answerDeskCard} className="mt-3 flex gap-2">
                  <input type="hidden" name="cardId" value={card.id} />
                  <input type="hidden" name="back" value={`/desks?event=${encodeURIComponent(ev.slug)}`} />
                  <button className="btn-primary" name="choice" value="make">
                    Make {card.payload && (card.payload as { type?: string }).type === "custom" ? "it" : "them"}
                  </button>
                  <button className="btn" name="choice" value="skip">
                    Don&apos;t
                  </button>
                </form>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title={`${ev.name} · ${list.filter((d) => d.status === "created").length} desks`}>
        {list.length ? (
          <div className="space-y-3">
            {list.map((d) => (
              <DeskCard key={d.id} d={d} eventSlug={ev.slug} eventId={ev.id} />
            ))}
          </div>
        ) : (
          <Empty>No desks yet. Set up a pack below, make one desk, or say “@ferri set up the desks for a meetup” in the crew room.</Empty>
        )}
      </Section>

      <Section title="Make a desk">
        <form action={makeDesk} className="card grid gap-3 p-4 sm:grid-cols-2">
          {ids}
          <label className="text-[13px]">
            <div className="mb-1 text-zinc-500">Kind</div>
            <select className="input" name="kind" defaultValue="judging">
              {kindOptions}
            </select>
          </label>
          <label className="text-[13px]">
            <div className="mb-1 text-zinc-500">Name (optional, for a second desk of a kind)</div>
            <input className="input" name="name" placeholder="finals judging" />
          </label>
          <label className="text-[13px]">
            <div className="mb-1 text-zinc-500">Invite (usernames or crew names, comma separated; empty: the skill&apos;s “who”)</div>
            <input className="input" name="members" placeholder="arjun, priya" />
          </label>
          <label className="text-[13px]">
            <div className="mb-1 text-zinc-500">Platform</div>
            <select className="input" name="platform" defaultValue="">
              {DESK_PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-2">
            <button className="btn-primary">Make the desk</button>
            <span className="ml-3 text-[12px] text-zinc-500">Ferri makes the room from a template, invites people, posts the kickoff and attaches it to {ev.name}.</span>
          </div>
        </form>
      </Section>

      <Section title="Set up a pack">
        <div className="grid gap-3 sm:grid-cols-2">
          {packs.map((p) => (
            <div key={p.type} className="card p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[15px] font-medium">{p.pack?.title ?? p.type}</div>
                <Link className="text-[12px] text-zinc-500 hover:text-zinc-900" href={`/skills?key=${encodeURIComponent(`packs/${p.type}`)}`}>
                  Edit the pack
                </Link>
              </div>
              {p.pack ? (
                <>
                  <div className="mt-1 text-[13px] text-zinc-600">{p.pack.body}</div>
                  <details className="mt-2 text-[13px]">
                    <summary className="cursor-pointer text-[12px] text-zinc-500 hover:text-zinc-900">Preview · {p.desks.length} rooms</summary>
                    <ul className="mt-2 space-y-1.5">
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
        <p className="mt-2 text-[12px] text-zinc-500">Ferri puts the pack on one desk card in the crew room (and Pocket); “Make them” makes every room.</p>
      </Section>

      <Section title="Turn a space into a desk">
        {free.length ? (
          <form action={spaceToDesk} className="card grid gap-3 p-4 sm:grid-cols-3">
            {ids}
            <label className="text-[13px]">
              <div className="mb-1 text-zinc-500">Space</div>
              <select className="input" name="spaceId">
                {free.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({MODE_LABEL[s.mode] ?? s.mode})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[13px]">
              <div className="mb-1 text-zinc-500">Kind</div>
              <select className="input" name="kind" defaultValue="volunteers">
                {kindOptions}
              </select>
            </label>
            <label className="text-[13px]">
              <div className="mb-1 text-zinc-500">Mode</div>
              <select className="input" name="mode" defaultValue="keep">
                <option value="keep">Keep the space&apos;s mode</option>
                <option value="skill">Use the desk&apos;s mode</option>
              </select>
            </label>
            <div className="sm:col-span-3">
              <button className="btn">Make it a desk</button>
              <span className="ml-3 text-[12px] text-zinc-500">No new room: the desk&apos;s skill and sheet apply there from the next message.</span>
            </div>
          </form>
        ) : (
          <Empty>Every members space of {ev.name} is a desk already, or none is attached. Attach spaces on the Spaces page.</Empty>
        )}
      </Section>
    </>
  );
}

function DeskCard({ d, eventSlug, eventId }: { d: DeskView; eventSlug: string; eventId: string }) {
  const sheet = d.skill?.sheet ?? null;
  const groups = sheet?.summary ? sheetSummary(sheet, d.rows) : [];
  const shown = d.rows.slice(-50).reverse();
  return (
    <div className="card p-4">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-[15px] font-medium">{d.title}</span>
        <span className="font-mono text-[12px] text-zinc-500">#{d.roomName}</span>
        <span className={`badge ${STATUS_STYLE[d.status] ?? ""}`}>{DESK_STATUS_LABEL[d.status] ?? d.status}</span>
        <span className="badge">{d.kind}</span>
        {d.platform ? <span className="badge">{deskPlatformName(d.platform)}</span> : null}
        {d.mode ? <span className="badge">{MODE_LABEL[d.mode] ?? d.mode}</span> : null}
        <span className="badge">{d.visibility}</span>
        {sheet ? <span className="badge">{d.rowCount} rows</span> : null}
      </div>
      <div className="text-[12px] text-zinc-500">
        {d.members.length ? `With ${d.members.join(", ")} · ` : ""}asked by {d.requestedBy} {ago(d.createdAt)}
        {d.status === "planned" ? (d.cardId ? " · waiting on its desk card in the crew room" : " · Ferri makes it at its next tick") : ""}
        {d.status === "failed" && d.error ? ` · ${d.error}` : ""}
      </div>
      {d.skill ? <div className="mt-1 text-[12px] text-zinc-500">{skillFacts(d.skill)}</div> : <div className="mt-1 text-[12px] text-red-700">Skill: {d.skillError}</div>}

      {sheet && d.status === "created" ? (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between">
            <div className="text-[13px] font-medium">
              {sheet.name}
              {d.sheetDocumentId ? <span className="ml-2 text-[12px] font-normal text-zinc-500">also a Switch document in the room</span> : null}
            </div>
            <a className="text-[12px] text-zinc-500 hover:text-zinc-900" href={`/desks/${d.id}/csv`}>
              Download CSV
            </a>
          </div>
          {groups.length ? (
            <div className="mb-2 text-[13px] text-zinc-700">
              {groups.slice(0, 10).map((g, i) => (
                <span key={g.key} className="mr-3">
                  {i + 1}. {g.key}: <span className="font-medium">{g.value}</span>
                </span>
              ))}
            </div>
          ) : null}
          {shown.length ? (
            <div className="overflow-x-auto">
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
                      <td className="py-1 text-zinc-400">{ago(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {d.rowCount > shown.length ? <div className="mt-1 text-[12px] text-zinc-400">The latest {shown.length} of {d.rowCount}; the CSV has all of them.</div> : null}
            </div>
          ) : (
            <div className="text-[12px] text-zinc-400">Nothing yet. Ferri adds a row when someone posts an entry in #{d.roomName}.</div>
          )}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px]">
        {d.skillText ? (
          <details className="w-full">
            <summary className="cursor-pointer text-zinc-500 hover:text-zinc-900">
              The skill ({d.skillKey}
              {d.skillEdited ? ", edited" : ""})
            </summary>
            <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-zinc-50 p-3 text-[12px] whitespace-pre-wrap text-zinc-700">{d.skillText}</pre>
          </details>
        ) : null}
        <Link className="text-zinc-500 hover:text-zinc-900" href={`/skills?key=${encodeURIComponent(d.skillKey)}`}>
          Edit the skill
        </Link>
        {d.status === "created" ? (
          <form action={removeDesk}>
            <input type="hidden" name="deskId" value={d.id} />
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="eventSlug" value={eventSlug} />
            <button className="text-zinc-500 hover:text-red-700">No longer a desk</button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
