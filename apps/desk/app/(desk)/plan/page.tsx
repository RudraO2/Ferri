import { and, eq, inArray } from "drizzle-orm";
import { ago, liveEvents } from "@/lib/data";
import { community, db } from "@/lib/db";
import { TOPICS, cards, formatWhen, latestAgenda, loadCrew, loadPlan, sortPlan, type CrewMember, type PlanItem } from "@/lib/ferri";
import { addPlanItem, confirmPlanItem, dropPlanItem, setPlanStatus, updatePlanItem } from "../actions";
import { AutoRefresh } from "../refresh";
import { Empty, Note, PageHead, Section } from "../ui";

const KIND_LABEL: Record<string, string> = { decision: "decision", task: "task", owner: "owner", question: "open question" };

/** "2026-11-21T18:00" in the community's zone, for a datetime-local input. */
function localInput(d: Date | null, timeZone: string): string {
  if (!d) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ note?: string; event?: string }> }) {
  const { note, event: slug } = await searchParams;
  const c = await community();
  const evs = await liveEvents(c.id);
  const ev = evs.find((e) => e.slug === slug) ?? evs[0];
  if (!ev) {
    return (
      <>
        <PageHead title="Plan" />
        <Empty>No live event. Create one in Events first.</Empty>
      </>
    );
  }
  const [items, crew, agenda] = await Promise.all([loadPlan(db(), ev.id), loadCrew(db(), c.id, ev.id), latestAgenda(db(), ev.id)]);
  const cardIds = items.map((i) => i.cardId).filter((x): x is string => !!x);
  const open = new Set(
    cardIds.length
      ? (await db().select({ id: cards.id }).from(cards).where(and(inArray(cards.id, cardIds), eq(cards.status, "open")))).map((r) => r.id)
      : [],
  );
  const sorted = sortPlan(items);
  const proposed = sorted.filter((i) => i.status === "proposed");
  const decided = sorted.filter((i) => i.kind === "decision" && i.status === "confirmed");
  const tasks = sorted
    .filter((i) => i.kind === "task")
    .sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity));
  const questions = sorted.filter((i) => i.kind === "question" && i.status === "confirmed");
  const tz = c.timezone;
  const name = (id: string | null) => (id ? (crew.find((m) => m.id === id)?.name ?? "someone") : null);
  const hidden = <input type="hidden" name="eventSlug" value={ev.slug} />;
  const owners = new Map<string, string[]>();
  for (const m of crew) for (const t of m.topics) owners.set(t, [...(owners.get(t) ?? []), m.name]);

  return (
    <>
      <AutoRefresh seconds={8} />
      <PageHead
        title="Plan"
        sub="The living plan Ferri keeps from the crew's chat, its agenda draft and this page: what is decided, who owns what, what is due, what is still open. It is also a document in the crew room in Switch."
        action={
          evs.length > 1 ? (
            <form className="flex gap-2">
              <select className="input" name="event" defaultValue={ev.slug}>
                {evs.map((e) => (
                  <option key={e.id} value={e.slug}>
                    {e.name}
                  </option>
                ))}
              </select>
              <button className="btn">Show</button>
            </form>
          ) : null
        }
      />
      <Note note={note} />

      <Section title={`Waiting for an OK · ${proposed.length}`}>
        {proposed.length ? (
          <div className="space-y-3">
            {proposed.map((i) => (
              <div key={i.id} className="card p-4">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="badge">proposed by Ferri</span>
                  <span className="badge">{i.topic}</span>
                  {i.forMembers ? <span className="badge">members will be told when they ask</span> : null}
                  <span className="text-[12px] text-zinc-400">{ago(i.createdAt)}</span>
                </div>
                <div className="text-[15px] font-medium">{i.title}</div>
                {i.cardId && open.has(i.cardId) ? (
                  <form action={confirmPlanItem} className="mt-3 space-y-2">
                    {hidden}
                    <input type="hidden" name="cardId" value={i.cardId} />
                    <label className="label">Ferri&apos;s proposal (edit it to confirm your own version)</label>
                    <textarea className="textarea" name="text" rows={2} defaultValue={i.text} />
                    <div className="flex gap-2">
                      <button className="btn-primary">Confirm</button>
                      <button className="btn" formAction={dropPlanItem}>
                        Drop
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="muted mt-1">{i.text} · the card is opening in the crew room.</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Empty>Nothing waiting. Say “@ferri draft the agenda” in the crew room for a draft with a card per key decision.</Empty>
        )}
      </Section>

      <Section title={`Decided · ${decided.length}`}>
        {decided.length ? (
          <div className="card divide-y divide-zinc-100">
            {decided.map((i) => (
              <Row key={i.id} item={i} hidden={hidden}>
                <div className="text-[13.5px]">
                  <span className="font-medium">{i.title}</span>: {i.text}
                </div>
                <div className="text-[12px] text-zinc-400">
                  {i.decidedBy ? `${i.decidedBy} · ` : ""}
                  {i.origin === "draft" ? "confirmed from the agenda draft" : i.origin === "desk" ? "added in Desk" : "said in crew chat"} · {ago(i.updatedAt)}
                  {i.forMembers ? (i.entryId ? " · in the knowledge, members get it" : " · saving to the knowledge") : " · crew only"}
                </div>
              </Row>
            ))}
          </div>
        ) : (
          <Empty>Nothing decided yet. Decisions said in the crew room land here.</Empty>
        )}
      </Section>

      <Section title={`Tasks and deadlines · ${tasks.filter((t) => t.status !== "done").length} open`}>
        {tasks.length ? (
          <div className="card divide-y divide-zinc-100">
            {tasks.map((i) => {
              const late = i.status !== "done" && i.dueAt && i.dueAt.getTime() < Date.now();
              return (
                <div key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <form action={setPlanStatus}>
                    {hidden}
                    <input type="hidden" name="itemId" value={i.id} />
                    <input type="hidden" name="status" value={i.status === "done" ? "confirmed" : "done"} />
                    <button className="btn" title={i.status === "done" ? "Open again" : "Mark done"}>
                      {i.status === "done" ? "✓ Done" : "Mark done"}
                    </button>
                  </form>
                  <div className="min-w-0 flex-1">
                    <div className={`text-[13.5px] ${i.status === "done" ? "text-zinc-400 line-through" : ""}`}>{i.text}</div>
                    <div className={`text-[12px] ${late ? "text-red-600" : "text-zinc-400"}`}>
                      {name(i.ownerId) ?? "nobody yet"}
                      {i.dueAt ? ` · due ${formatWhen(i.dueAt, tz)}` : ""}
                      {late ? " · overdue" : ""}
                      {i.remindedAt ? " · reminded" : ""}
                    </div>
                  </div>
                  {i.status !== "done" ? (
                    <form action={updatePlanItem} className="flex flex-wrap items-center gap-2">
                      {hidden}
                      <input type="hidden" name="itemId" value={i.id} />
                      <OwnerSelect crew={crew} value={i.ownerId} />
                      <input className="input w-[190px]" type="datetime-local" name="due" defaultValue={localInput(i.dueAt, tz)} />
                      <button className="btn">Save</button>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <Empty>No tasks yet. “Arjun, book the projector by Friday” in the crew room becomes one, with a reminder at the deadline.</Empty>
        )}
      </Section>

      <div className="grid grid-cols-2 gap-6">
        <Section title={`Still open · ${questions.length}`}>
          {questions.length ? (
            <div className="card divide-y divide-zinc-100">
              {questions.map((i) => (
                <Row key={i.id} item={i} hidden={hidden} doneLabel="Settled">
                  <div className="text-[13.5px]">{i.text}</div>
                </Row>
              ))}
            </div>
          ) : (
            <Empty>Nothing left open.</Empty>
          )}
        </Section>
        <Section title="Who owns what">
          <div className="card divide-y divide-zinc-100">
            {[...owners].sort(([a], [b]) => a.localeCompare(b)).map(([t, names]) => (
              <div key={t} className="flex justify-between px-4 py-2 text-[13px]">
                <span className="text-zinc-500">{t}</span>
                <span>{names.join(", ")}</span>
              </div>
            ))}
          </div>
          <p className="muted mt-2">Cards on a topic go to its owner first. “Priya will handle food” in the crew room, or an owner item below, changes it.</p>
        </Section>
      </div>

      <Section title="Add to the plan">
        <form action={addPlanItem} className="card grid grid-cols-[160px_1fr] gap-3 p-4">
          {hidden}
          <input type="hidden" name="eventId" value={ev.id} />
          <div>
            <label className="label">Kind</label>
            <select className="input" name="kind" defaultValue="task">
              <option value="decision">Decision</option>
              <option value="task">Task</option>
              <option value="question">Open question</option>
              <option value="owner">Owner of a topic</option>
            </select>
          </div>
          <div>
            <label className="label">The item (not needed for an owner)</label>
            <input className="input" name="text" placeholder="Print the name badges" />
          </div>
          <div>
            <label className="label">Topic</label>
            <select className="input" name="topic" defaultValue="other">
              {TOPICS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label">Owner</label>
              <OwnerSelect crew={crew} value={null} />
            </div>
            <div>
              <label className="label">Due (tasks)</label>
              <input className="input w-[190px]" type="datetime-local" name="due" />
            </div>
            <label className="flex items-center gap-1.5 pb-2 text-[13px] text-zinc-700">
              <input type="checkbox" name="forMembers" value="1" /> Members need to know (decisions)
            </label>
            <button className="btn-primary">Add</button>
          </div>
        </form>
      </Section>

      <Section title="Agenda draft">
        {agenda ? (
          <div className="card p-4">
            <div className="mb-2 text-[12px] text-zinc-400">
              Drafted for {agenda.requestedBy} {ago(agenda.createdAt)}
            </div>
            <pre className="whitespace-pre-wrap font-mono text-[12.5px] leading-6 text-zinc-700">{agenda.text}</pre>
          </div>
        ) : (
          <Empty>No draft yet. Say “@ferri draft the agenda” in the crew room.</Empty>
        )}
      </Section>
    </>
  );
}

function OwnerSelect({ crew, value }: { crew: CrewMember[]; value: string | null }) {
  return (
    <select className="input w-[150px]" name="ownerId" defaultValue={value ?? ""}>
      <option value="">nobody yet</option>
      {crew.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  );
}

function Row({ item, hidden, children, doneLabel }: { item: PlanItem; hidden: React.ReactNode; children: React.ReactNode; doneLabel?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0">{children}</div>
      <div className="flex shrink-0 gap-2">
        {doneLabel ? (
          <form action={setPlanStatus}>
            {hidden}
            <input type="hidden" name="itemId" value={item.id} />
            <input type="hidden" name="status" value="done" />
            <button className="btn">{doneLabel}</button>
          </form>
        ) : null}
        <form action={setPlanStatus}>
          {hidden}
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="status" value="dropped" />
          <button className="btn" title="Take it out of the plan">
            Remove
          </button>
        </form>
      </div>
    </div>
  );
}
