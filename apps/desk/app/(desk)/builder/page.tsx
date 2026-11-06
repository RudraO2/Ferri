import { ago, liveEvents } from "@/lib/data";
import { community, db } from "@/lib/db";
import { builderView, metricLabel } from "@/lib/builder";
import { jobFiles, jobRef, listBuilderJobs, type BuilderJob } from "@/lib/ferri";
import { requireUser } from "@/lib/session";
import { cancelBuilderJob, queueBuilderJob } from "../actions";
import { RequestCard } from "./request-card";
import { AutoRefresh } from "../refresh";
import { Empty, Note, PageHead, Section } from "../ui";

const STATUS_STYLE: Record<string, string> = {
  queued: "border-zinc-200 bg-zinc-50 text-zinc-600",
  handed: "border-sky-200 bg-sky-50 text-sky-700",
  working: "border-sky-200 bg-sky-50 text-sky-700",
  done: "border-emerald-200 bg-emerald-50 text-emerald-700",
  stuck: "border-amber-200 bg-amber-50 text-amber-700",
  failed: "border-red-200 bg-red-50 text-red-700",
  cancelled: "border-zinc-200 bg-zinc-50 text-zinc-500",
};
const STATUS_LABEL: Record<string, string> = { handed: "handed over", working: "working" };
const ok = "border-emerald-200 bg-emerald-50 text-emerald-700";
const warn = "border-amber-200 bg-amber-50 text-amber-700";
const size = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`);

export default async function BuilderPage({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  const { note } = await searchParams;
  const user = await requireUser();
  const c = await community();
  const [view, jobs, evs] = await Promise.all([builderView(user), listBuilderJobs(db(), c.id, 40), liveEvents(c.id)]);
  const a = view.agent;
  const claude = view.machine?.providers.find((p) => p.provider === "claude");
  const running = a?.status?.process === "running" && view.machine?.state === "online";
  const effort = typeof a?.definition.advanced_config?.effort === "string" ? a.definition.advanced_config.effort : null;

  return (
    <>
      <AutoRefresh seconds={6} />
      <PageHead
        title="Builder"
        sub="Ferri Builder is a Claude Code agent that Switch runs on your machine, with its own folder, its own budget and the Switch tools. Ferri hands it work in the crew room; it shows its progress there and asks on a card before anything goes public."
      />
      <Note note={note} />
      {view.error ? <div className="card mb-6 p-4 text-[13px] text-red-700">{view.error}</div> : null}

      <Section title="In Switch">
        {a ? (
          <div className="grid grid-cols-3 gap-3">
            <div className="card p-4 text-[13px]">
              <div className="flex items-center gap-2">
                <span className="font-medium">{a.display_name ?? a.name}</span>
                <span className={`badge ${running ? ok : warn}`}>{running ? "ready" : (a.status?.process ?? "not running")}</span>
              </div>
              <div className="mt-2 space-y-0.5 text-zinc-600">
                <div>
                  Claude Code · {a.definition.model ?? "default model"}
                  {effort ? ` · ${effort} effort` : ""}
                </div>
                <div>{a.status?.sessions?.active ? `${a.status.sessions.active} session open` : "no session open (Switch starts one when it is addressed)"}</div>
                <div>
                  Permissions: {a.definition.auto_approve ? "everything allowed" : a.definition.auto_mode ? "Claude's auto review, public steps always ask" : "asks for everything"}
                </div>
              </div>
            </div>
            <div className="card p-4 text-[13px]">
              <div className="flex items-center gap-2">
                <span className="font-medium">Machine {a.controller_name ?? "none"}</span>
                <span className={`badge ${view.machine?.state === "online" ? ok : warn}`}>{view.machine?.state ?? "unknown"}</span>
              </div>
              <div className="mt-2 space-y-0.5 text-zinc-600">
                <div>Switch agent controller (headless)</div>
                <div>{claude ? `Claude Code ${claude.version ?? ""} · ${claude.auth === "ok" ? "signed in" : (claude.auth ?? "?")}` : "Claude Code not reported"}</div>
                <div className="truncate" title={a.status?.directory ?? a.definition.directory ?? ""}>
                  Folder {a.status?.directory ?? a.definition.directory ?? "not set"}
                </div>
              </div>
            </div>
            <div className="card p-4 text-[13px]">
              <div className="font-medium">Budget in Switch</div>
              {view.budgets.length ? (
                <div className="mt-2 space-y-2">
                  {view.budgets.map((b) => {
                    const pct = Math.min(100, Math.round((b.spent / b.amount_limit) * 100));
                    return (
                      <div key={b.id}>
                        <div className="flex justify-between text-zinc-600">
                          <span>
                            {b.spent.toLocaleString("en-IN")} / {b.amount_limit.toLocaleString("en-IN")} {metricLabel(b.metric)}
                          </span>
                          <span className={b.exhausted ? "text-red-600" : "text-zinc-400"}>{b.exhausted ? "spent" : `per ${b.period_hours} h`}</span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-zinc-100">
                          <div className={`h-1.5 rounded-full ${b.exhausted ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-zinc-900"}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  <div className="text-[12px] text-zinc-400">Resets {new Date(view.budgets[0]!.resets_at).toLocaleString("en-IN", { timeZone: c.timezone, hour: "numeric", minute: "2-digit", day: "numeric", month: "short" })}</div>
                </div>
              ) : (
                <div className="mt-2 text-zinc-500">No budget set. Run pnpm builder:setup.</div>
              )}
            </div>
          </div>
        ) : view.error ? null : (
          <Empty>No Builder yet. Run pnpm builder:setup, with pnpm builder:controller running.</Empty>
        )}
      </Section>

      <Section title={`Waiting for you · ${view.requests.length}`}>
        {view.requests.length ? (
          <div className="space-y-3">
            {view.requests.map((r) => (
              <RequestCard key={r.requestId} r={r} />
            ))}
          </div>
        ) : (
          <Empty>The Builder is not waiting on anyone. When it wants to do something public, its card shows here and in the crew room.</Empty>
        )}
      </Section>

      <Section title="New job">
        <form action={queueBuilderJob} className="card grid grid-cols-6 gap-3 p-4">
          <div className="col-span-2">
            <label className="label">Event</label>
            <select className="input" name="eventId" defaultValue={evs[0]?.id ?? ""}>
              {evs.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
              <option value="">No event (community)</option>
            </select>
          </div>
          <div className="col-span-1">
            <label className="label">Kind</label>
            <select className="input" name="kind" defaultValue="site">
              <option value="site">Page or site</option>
              <option value="checklist">Checklist</option>
              <option value="poster">Poster</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="col-span-3">
            <label className="label">Title (optional)</label>
            <input className="input" name="title" placeholder="Sponsor one-pager" />
          </div>
          <div className="col-span-6">
            <label className="label">What should it make?</label>
            <textarea className="input min-h-[70px]" name="brief" placeholder="A one-page site for Build Night with the schedule, the venue map link and how to register." required />
          </div>
          <div className="col-span-6 flex justify-end">
            <button className="btn-primary">Hand to the Builder</button>
          </div>
        </form>
      </Section>

      <Section title={`Jobs · ${jobs.length}`}>
        {jobs.length ? (
          <div className="card divide-y divide-zinc-100">
            {jobs.map((j) => (
              <JobRow key={j.id} j={j} />
            ))}
          </div>
        ) : (
          <Empty>No jobs yet. Ask in the crew room: @ferri get the builder to make a one-page site.</Empty>
        )}
      </Section>
    </>
  );
}

function JobRow({ j }: { j: BuilderJob }) {
  const files = jobFiles(j);
  const live = ["queued", "handed", "working", "stuck"].includes(j.status);
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3 text-[13px]">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12px] text-zinc-400">{jobRef(j)}</span>
          <span className="font-medium">{j.title}</span>
          <span className={`badge ${STATUS_STYLE[j.status] ?? ""}`}>{STATUS_LABEL[j.status] ?? j.status}</span>
        </div>
        <div className="mt-0.5 text-zinc-500">
          {j.requestedBy} asked {j.origin === "desk" ? "in Desk" : "in the crew room"} · {ago(j.createdAt)}
          {j.finishedAt && j.status !== "cancelled" ? ` · finished ${ago(j.finishedAt)}` : ""}
        </div>
        <div className="mt-1 text-zinc-700">{j.brief}</div>
        {j.report ? (
          <div className={`mt-1.5 rounded-md px-2.5 py-1.5 ${j.status === "stuck" ? "bg-amber-50 text-amber-800" : "bg-zinc-50 text-zinc-700"}`}>
            {j.status === "cancelled" ? `Cancelled by ${j.report}` : j.report}
          </div>
        ) : null}
        {files.length ? (
          <div className="mt-1.5 flex flex-wrap gap-2">
            {files.map((f) => (
              <a key={f.name} className="badge hover:bg-zinc-100" href={`/builder/file?job=${encodeURIComponent(j.id)}&name=${encodeURIComponent(f.name)}`} target="_blank" rel="noreferrer">
                {f.name} · {size(f.bytes)}
              </a>
            ))}
          </div>
        ) : null}
      </div>
      {live ? (
        <form action={cancelBuilderJob}>
          <input type="hidden" name="id" value={j.id} />
          <button className="btn">Cancel</button>
        </form>
      ) : null}
    </div>
  );
}
