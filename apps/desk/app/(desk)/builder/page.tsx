import { ago, liveEvents } from "@/lib/data";
import { community, db } from "@/lib/db";
import { builderView, metricLabel } from "@/lib/builder";
import { jobFiles, jobRef, listBuilderJobs, type BuilderJob } from "@/lib/ferri";
import { requireUser } from "@/lib/session";
import { cancelBuilderJob, queueBuilderJob } from "../actions";
import { RequestCard } from "./request-card";
import { AutoRefresh } from "../refresh";
import { Composer, Empty, Fold, Note, PageHead, Section } from "../ui";

const STATUS_STYLE: Record<string, string> = {
  queued: "bg-zinc-100 text-zinc-600",
  handed: "bg-sky-50 text-sky-700",
  working: "bg-sky-50 text-sky-700",
  done: "bg-emerald-50 text-emerald-700",
  stuck: "bg-amber-50 text-amber-700",
  failed: "bg-red-50 text-red-700",
  cancelled: "bg-zinc-100 text-zinc-500",
};
const STATUS_LABEL: Record<string, string> = { handed: "handed over", working: "working" };
const size = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`);
const LIVE = ["queued", "handed", "working", "stuck"];

export default async function BuilderPage({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  const { note } = await searchParams;
  const user = await requireUser();
  const c = await community();
  const [view, jobs, evs] = await Promise.all([builderView(user), listBuilderJobs(db(), c.id, 40), liveEvents(c.id)]);
  const a = view.agent;
  const claude = view.machine?.providers.find((p) => p.provider === "claude");
  const running = a?.status?.process === "running" && view.machine?.state === "online";
  const effort = typeof a?.definition.advanced_config?.effort === "string" ? a.definition.advanced_config.effort : null;
  const liveJobs = jobs.filter((j) => LIVE.includes(j.status));
  const pastJobs = jobs.filter((j) => !LIVE.includes(j.status));
  const budget = view.budgets[0];

  return (
    <>
      <AutoRefresh seconds={6} />
      <PageHead
        title="Builder"
        sub="A Claude Code agent that makes sites, posters and listings for the crew."
        about={
          <>
            <p>Switch runs Ferri Builder on your machine, with its own folder, its own budget and the Switch tools.</p>
            <p>Ferri hands it work in the crew room (“@ferri get the builder to make a one-page site”). It shows its progress there and asks on a card before anything goes public.</p>
          </>
        }
      />
      <Note note={note} />
      {view.error ? (
        <div role="alert" className="mb-6 rounded-[14px] bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          {view.error}
        </div>
      ) : null}

      {a ? (
        <div className="mb-8 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-zinc-600">
          <span className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${running ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden />
            <b className="font-semibold text-zinc-900">{a.display_name ?? a.name}</b>
            {running ? "is ready" : `is ${a.status?.process ?? "not running"}`}
          </span>
          {budget ? (
            <span className={budget.exhausted ? "text-red-700" : "text-zinc-500"}>
              · {budget.spent.toLocaleString("en-IN")} of {budget.amount_limit.toLocaleString("en-IN")} {metricLabel(budget.metric)} {budget.exhausted ? "spent" : `per ${budget.period_hours} h`}
            </span>
          ) : null}
        </div>
      ) : view.error ? null : (
        <div className="mb-8">
          <Empty pose="sleep" title="No Builder yet">
            Run pnpm builder:setup, with pnpm builder:controller running.
          </Empty>
        </div>
      )}

      {view.requests.length ? (
        <Section title="Waiting for you" count={view.requests.length}>
          <div className="space-y-4">
            {view.requests.map((r) => (
              <RequestCard key={r.requestId} r={r} />
            ))}
          </div>
        </Section>
      ) : null}

      <Composer label="New job">
        <form action={queueBuilderJob} className="card grid gap-3 p-5 sm:grid-cols-6">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="job-event">
              Event
            </label>
            <select id="job-event" className="input" name="eventId" defaultValue={evs[0]?.id ?? ""}>
              {evs.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
              <option value="">No event (community)</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="job-kind">
              Kind
            </label>
            <select id="job-kind" className="input" name="kind" defaultValue="site">
              <option value="site">Page or site</option>
              <option value="checklist">Checklist</option>
              <option value="poster">Poster</option>
              <option value="listing">Listing (Luma, ...)</option>
              <option value="outreach">Find partners</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="job-title">
              Title (optional)
            </label>
            <input id="job-title" className="input" name="title" placeholder="Sponsor one-pager" />
          </div>
          <div className="sm:col-span-6">
            <label className="label" htmlFor="job-brief">
              What should it make?
            </label>
            <textarea id="job-brief" className="textarea min-h-[70px]" name="brief" placeholder="A one-page site for Build Night with the schedule, the venue map link and how to register." required />
          </div>
          <div className="sm:col-span-6">
            <button className="btn-primary">Hand to the Builder</button>
          </div>
        </form>
      </Composer>

      <Section title="Working on" count={liveJobs.length}>
        {liveJobs.length ? (
          <div className="card-flat divide-y divide-zinc-100">
            {liveJobs.map((j) => (
              <JobRow key={j.id} j={j} />
            ))}
          </div>
        ) : (
          <Empty quiet>Nothing in progress. Ask in the crew room: “@ferri get the builder to make a one-page site”.</Empty>
        )}
      </Section>

      {pastJobs.length ? (
        <Fold title="Finished jobs" count={pastJobs.length} className="mb-2">
          <div className="card-flat divide-y divide-zinc-100">
            {pastJobs.map((j) => (
              <JobRow key={j.id} j={j} />
            ))}
          </div>
        </Fold>
      ) : null}

      {a ? (
        <Fold title="Agent, machine and budget" className="mb-10">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="card-flat p-4 text-[13px]">
              <div className="font-medium text-zinc-900">{a.display_name ?? a.name}</div>
              <div className="mt-2 space-y-0.5 text-zinc-600">
                <div>
                  Claude Code · {a.definition.model ?? "default model"}
                  {effort ? ` · ${effort} effort` : ""}
                </div>
                <div>{a.status?.sessions?.active ? `${a.status.sessions.active} session open` : "No session open (Switch starts one when it is addressed)"}</div>
                <div>Permissions: {a.definition.auto_approve ? "everything allowed" : a.definition.auto_mode ? "Claude's auto review, public steps always ask" : "asks for everything"}</div>
              </div>
            </div>
            <div className="card-flat p-4 text-[13px]">
              <div className="font-medium text-zinc-900">
                Machine {a.controller_name ?? "none"} · <span className={view.machine?.state === "online" ? "text-emerald-700" : "text-amber-700"}>{view.machine?.state ?? "unknown"}</span>
              </div>
              <div className="mt-2 space-y-0.5 text-zinc-600">
                <div>Switch agent controller (headless)</div>
                <div>{claude ? `Claude Code ${claude.version ?? ""} · ${claude.auth === "ok" ? "signed in" : (claude.auth ?? "?")}` : "Claude Code not reported"}</div>
                <div className="truncate" title={a.status?.directory ?? a.definition.directory ?? ""}>
                  Folder {a.status?.directory ?? a.definition.directory ?? "not set"}
                </div>
              </div>
            </div>
            <div className="card-flat p-4 text-[13px]">
              <div className="font-medium text-zinc-900">Budget in Switch</div>
              {view.budgets.length ? (
                <div className="mt-2 space-y-2">
                  {view.budgets.map((b) => {
                    const pct = Math.min(100, Math.round((b.spent / b.amount_limit) * 100));
                    return (
                      <div key={b.id}>
                        <div className="flex justify-between gap-2 text-zinc-600">
                          <span>
                            {b.spent.toLocaleString("en-IN")} / {b.amount_limit.toLocaleString("en-IN")} {metricLabel(b.metric)}
                          </span>
                          <span className={b.exhausted ? "text-red-700" : "text-zinc-500"}>{b.exhausted ? "spent" : `per ${b.period_hours} h`}</span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-zinc-100" aria-hidden>
                          <div className={`h-1.5 rounded-full ${b.exhausted ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-brand"}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  <div className="text-[12px] text-zinc-500">
                    Resets {new Date(view.budgets[0]!.resets_at).toLocaleString("en-IN", { timeZone: c.timezone, hour: "numeric", minute: "2-digit", day: "numeric", month: "short" })}
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-zinc-500">No budget set. Run pnpm builder:setup.</div>
              )}
            </div>
          </div>
        </Fold>
      ) : null}
    </>
  );
}

function JobRow({ j }: { j: BuilderJob }) {
  const files = jobFiles(j);
  // Posters and cards (spec 13): the rendered PNGs as thumbnails; listings (spec 14): the form and live-page screenshots.
  const shown = j.kind === "listing" ? /^out\/[^/]+-(filled|live|needs-you)\.jpg$|^out\/needs-you\.jpg$/i : /^out\/[^/]+\.png$/i;
  const images = files.filter((f) => shown.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));
  const others = files.filter((f) => !images.includes(f));
  const live = LIVE.includes(j.status);
  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 text-[13px] sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-medium text-zinc-900">{j.title}</span>
          <span className={`badge ${STATUS_STYLE[j.status] ?? ""}`}>{STATUS_LABEL[j.status] ?? j.status}</span>
        </div>
        <div className="mt-0.5 text-[12px] text-zinc-500">
          {jobRef(j)} · {j.requestedBy} {j.origin === "desk" ? "in Desk" : "in the crew room"} · {ago(j.createdAt)}
          {j.finishedAt && j.status !== "cancelled" ? ` · finished ${ago(j.finishedAt)}` : ""}
        </div>
        <div className="mt-1.5 text-zinc-700">{j.brief}</div>
        {j.url ? (
          <div className="mt-1.5 text-[12.5px]">
            <span className="text-zinc-500">{j.kind === "site" ? "Live at " : j.kind === "listing" ? "Listed at " : "Points to "}</span>
            <a className="font-medium break-all text-zinc-900 underline underline-offset-2" href={j.url} target="_blank" rel="noreferrer">
              {j.url}
            </a>
          </div>
        ) : null}
        {j.report ? (
          <div className={`mt-2 rounded-[10px] px-2.5 py-1.5 ${j.status === "stuck" ? "bg-amber-50 text-amber-800" : "bg-zinc-100 text-zinc-700"}`}>
            {j.status === "cancelled" ? `Cancelled by ${j.report}` : j.report}
          </div>
        ) : null}
        {images.length ? (
          <div className="mt-2.5 flex flex-wrap items-end gap-3">
            {images.map((f) => (
              <a key={f.name} className="block text-center text-[11px] text-zinc-500 hover:text-zinc-900" href={fileHref(j, f.name)} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fileHref(j, f.name)} alt={f.name} className="h-28 w-auto max-w-full rounded-[10px] bg-zinc-100 object-contain" loading="lazy" />
                <span className="mt-1 block">{f.name.replace(/^out\//, "").replace(/\.(png|jpg)$/, "").split("-").pop()}</span>
              </a>
            ))}
          </div>
        ) : null}
        {others.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {others.map((f) => (
              <a key={f.name} className="badge max-w-full truncate hover:bg-zinc-200" href={fileHref(j, f.name)} target="_blank" rel="noreferrer">
                {f.name} · {size(f.bytes)}
              </a>
            ))}
          </div>
        ) : null}
      </div>
      {live ? (
        <form action={cancelBuilderJob}>
          <input type="hidden" name="id" value={j.id} />
          <button className="h-9 rounded-full px-3 text-[13px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900" aria-label={`Cancel ${j.title}`}>
            Cancel
          </button>
        </form>
      ) : null}
    </div>
  );
}

const fileHref = (j: BuilderJob, name: string) => `/builder/file?job=${encodeURIComponent(j.id)}&name=${encodeURIComponent(name)}`;
