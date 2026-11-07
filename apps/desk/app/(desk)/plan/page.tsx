import { and, eq, inArray } from "drizzle-orm";
import { ChevronDown } from "lucide-react";
import { ago, liveEvents } from "@/lib/data";
import { community, db } from "@/lib/db";
import { TOPICS, cards, formatWhen, latestAgenda, loadCrew, loadPlan, sortPlan, type CrewMember, type PlanItem } from "@/lib/ferri";
import { addPlanItem, confirmPlanItem, dropPlanItem, setPlanStatus, updatePlanItem } from "../actions";
import { AutoRefresh } from "../refresh";
import { Composer, Empty, Fold, Note, PageHead, Section } from "../ui";

const quiet = "h-8 rounded-full px-3 text-[12.5px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900";

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
  const openTasks = tasks.filter((t) => t.status !== "done").length;
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
        sub="What is decided, who owns what, and what is due."
        about={
          <>
            <p>Ferri keeps the plan from the crew&apos;s chat, its agenda draft and this page. Decisions members need to know are saved to the knowledge, so Ferri can answer them.</p>
            <p>The plan is also a document in the crew room in Switch.</p>
          </>
        }
        action={
          evs.length > 1 ? (
            <form className="flex gap-2">
              <select className="input" name="event" defaultValue={ev.slug} aria-label="Event">
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

      {proposed.length ? (
        <Section title="Waiting for your OK" count={proposed.length}>
          <div className="space-y-4">
            {proposed.map((i) => (
              <article key={i.id} className="card p-5 sm:p-6">
                <div className="text-[12.5px] text-zinc-500">
                  Proposed by Ferri · {i.topic} · {ago(i.createdAt)}
                  {i.forMembers ? " · members get it" : ""}
                </div>
                <h3 className="mt-1 text-[16px] font-semibold text-zinc-900">{i.title}</h3>
                {i.cardId && open.has(i.cardId) ? (
                  <form action={confirmPlanItem} className="mt-3 space-y-2.5">
                    {hidden}
                    <input type="hidden" name="cardId" value={i.cardId} />
                    <label className="sr-only" htmlFor={`prop-${i.id}`}>
                      Ferri&apos;s proposal
                    </label>
                    <textarea id={`prop-${i.id}`} className="textarea" name="text" rows={2} defaultValue={i.text} />
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-primary">Confirm</button>
                      <button className={quiet} formAction={dropPlanItem}>
                        Drop
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="muted mt-1">{i.text} · the card is opening in the crew room.</p>
                )}
              </article>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Decided" count={decided.length}>
        {decided.length ? (
          <ul className="card-flat divide-y divide-zinc-100">
            {decided.map((i) => (
              <Row key={i.id} item={i} hidden={hidden}>
                <div className="text-[13.5px] text-zinc-800">
                  <span className="font-semibold text-zinc-900">{i.title}</span> {i.text}
                </div>
                <div className="mt-0.5 text-[12px] text-zinc-500">
                  {i.decidedBy ? `${i.decidedBy} · ` : ""}
                  {ago(i.updatedAt)}
                  {i.forMembers ? (i.entryId ? " · members get it" : " · saving to the knowledge") : " · crew only"}
                </div>
              </Row>
            ))}
          </ul>
        ) : !proposed.length ? (
          <Empty pose="thinking">Nothing decided yet. Decisions said in the crew room land here, or say “@ferri draft the agenda” for a draft with a card per key decision.</Empty>
        ) : (
          <Empty quiet>Nothing decided yet.</Empty>
        )}
      </Section>

      <Section title="Tasks" count={openTasks}>
        {tasks.length ? (
          <ul className="card-flat divide-y divide-zinc-100">
            {tasks.map((i) => {
              const late = i.status !== "done" && i.dueAt && i.dueAt.getTime() < Date.now();
              const done = i.status === "done";
              return (
                <li key={i.id} className="flex items-start gap-3 px-4 py-3">
                  <form action={setPlanStatus} className="pt-0.5">
                    {hidden}
                    <input type="hidden" name="itemId" value={i.id} />
                    <input type="hidden" name="status" value={done ? "confirmed" : "done"} />
                    <button
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-[12px] ${done ? "border-brand bg-brand text-white" : "border-zinc-300 hover:border-brand"}`}
                      aria-label={done ? `Open again: ${i.text}` : `Mark done: ${i.text}`}
                      title={done ? "Open again" : "Mark done"}
                    >
                      {done ? "✓" : ""}
                    </button>
                  </form>
                  <div className="min-w-0 flex-1">
                    <div className={`text-[13.5px] ${done ? "text-zinc-400 line-through" : "text-zinc-900"}`}>{i.text}</div>
                    <div className={`mt-0.5 text-[12px] ${late ? "text-red-700" : "text-zinc-500"}`}>
                      {name(i.ownerId) ?? "nobody yet"}
                      {i.dueAt ? ` · due ${formatWhen(i.dueAt, tz)}` : ""}
                      {late ? " · overdue" : ""}
                      {i.remindedAt ? " · reminded" : ""}
                    </div>
                    {!done ? (
                      <details className="group mt-1">
                        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[12px] font-medium text-zinc-500 hover:text-zinc-900 [&::-webkit-details-marker]:hidden">
                          Change owner or due
                          <ChevronDown size={12} className="transition group-open:rotate-180" aria-hidden />
                        </summary>
                        <form action={updatePlanItem} className="mt-2 flex flex-wrap items-center gap-2">
                          {hidden}
                          <input type="hidden" name="itemId" value={i.id} />
                          <OwnerSelect crew={crew} value={i.ownerId} />
                          <input className="input w-[190px]" type="datetime-local" name="due" defaultValue={localInput(i.dueAt, tz)} aria-label="Due" />
                          <button className="btn">Save</button>
                        </form>
                      </details>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty quiet>No tasks yet. “Arjun, book the projector by Friday” in the crew room becomes one, with a reminder at the deadline.</Empty>
        )}
      </Section>

      {questions.length ? (
        <Section title="Still open" count={questions.length}>
          <ul className="card-flat divide-y divide-zinc-100">
            {questions.map((i) => (
              <Row key={i.id} item={i} hidden={hidden} doneLabel="Settled">
                <div className="text-[13.5px] text-zinc-900">{i.text}</div>
              </Row>
            ))}
          </ul>
        </Section>
      ) : null}

      <Composer label="Add to the plan">
        <form action={addPlanItem} className="card grid gap-3 p-5 sm:grid-cols-[160px_1fr] [&>*]:min-w-0">
          {hidden}
          <input type="hidden" name="eventId" value={ev.id} />
          <div>
            <label className="label" htmlFor="plan-kind">
              Kind
            </label>
            <select id="plan-kind" className="input" name="kind" defaultValue="task">
              <option value="decision">Decision</option>
              <option value="task">Task</option>
              <option value="question">Open question</option>
              <option value="owner">Owner of a topic</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="plan-text">
              Item (not needed for an owner)
            </label>
            <input id="plan-text" className="input" name="text" placeholder="Print the name badges" />
          </div>
          <div>
            <label className="label" htmlFor="plan-topic">
              Topic
            </label>
            <select id="plan-topic" className="input" name="topic" defaultValue="other">
              {TOPICS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <div className="label">Owner</div>
              <OwnerSelect crew={crew} value={null} />
            </div>
            <div>
              <label className="label" htmlFor="plan-due">
                Due (tasks)
              </label>
              <input id="plan-due" className="input w-[190px]" type="datetime-local" name="due" />
            </div>
            <label className="flex items-center gap-1.5 pb-2 text-[13px] text-zinc-700">
              <input type="checkbox" name="forMembers" value="1" /> Members need to know
            </label>
            <button className="btn-primary">Add</button>
          </div>
        </form>
      </Composer>

      <Fold title="Who owns what" count={owners.size} className="mb-2">
        <ul className="card-flat divide-y divide-zinc-100">
          {[...owners].sort(([a], [b]) => a.localeCompare(b)).map(([t, names]) => (
            <li key={t} className="flex justify-between gap-3 px-4 py-2 text-[13px]">
              <span className="text-zinc-500">{t}</span>
              <span className="text-right text-zinc-900">{names.join(", ")}</span>
            </li>
          ))}
        </ul>
        <p className="muted mt-2">Cards on a topic go to its owner first. Say “Priya will handle food” in the crew room, or add an owner item, to change it.</p>
      </Fold>

      <Fold title="Agenda draft" hint={agenda ? `${agenda.requestedBy} · ${ago(agenda.createdAt)}` : undefined}>
        {agenda ? (
          <div className="card-flat p-4">
            <pre className="font-mono text-[12.5px] leading-6 whitespace-pre-wrap text-zinc-700">{agenda.text}</pre>
          </div>
        ) : (
          <Empty quiet>No draft yet. Say “@ferri draft the agenda” in the crew room.</Empty>
        )}
      </Fold>
    </>
  );
}

function OwnerSelect({ crew, value }: { crew: CrewMember[]; value: string | null }) {
  return (
    <select className="input w-[150px]" name="ownerId" defaultValue={value ?? ""} aria-label="Owner">
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
    <li className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0">{children}</div>
      <div className="flex shrink-0 gap-1">
        {doneLabel ? (
          <form action={setPlanStatus}>
            {hidden}
            <input type="hidden" name="itemId" value={item.id} />
            <input type="hidden" name="status" value="done" />
            <button className="btn h-8 px-3 text-[12.5px]">{doneLabel}</button>
          </form>
        ) : null}
        <form action={setPlanStatus}>
          {hidden}
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="status" value="dropped" />
          <button className={quiet} title="Take it out of the plan">
            Remove
          </button>
        </form>
      </div>
    </li>
  );
}
