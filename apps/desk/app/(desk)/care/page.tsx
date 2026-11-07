import { PlatformLogo } from "@/components/platform";
import { closedCaseList, firstName, JOB_STATUS_LABEL, openCaseList, type CaseView } from "@/lib/care";
import { ago, fmt } from "@/lib/data";
import { CARE_STATUS_LABEL } from "@/lib/ferri";
import { PLATFORM_LABEL } from "@/lib/pocket";
import { actOnCase } from "../actions";
import { AutoRefresh } from "../refresh";
import { Empty, Note, PageHead, Section } from "../ui";

const STATUS_STYLE: Record<string, string> = {
  open: "border-amber-200 bg-amber-50 text-amber-700",
  helping: "border-sky-200 bg-sky-50 text-sky-700",
  builder: "border-violet-200 bg-violet-50 text-violet-700",
  solved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  dropped: "border-zinc-200 bg-zinc-50 text-zinc-500",
};
const JOB_STYLE: Record<string, string> = {
  queued: "border-violet-200 bg-violet-50 text-violet-700",
  handed: "border-violet-200 bg-violet-50 text-violet-700",
  working: "border-violet-200 bg-violet-50 text-violet-700",
  done: "border-emerald-200 bg-emerald-50 text-emerald-700",
  stuck: "border-amber-200 bg-amber-50 text-amber-700",
  failed: "border-red-200 bg-red-50 text-red-700",
  cancelled: "border-zinc-200 bg-zinc-50 text-zinc-500",
};
const urgent = "border-red-200 bg-red-50 text-red-700";

const where = (v: CaseView) => `${v.spaceName ?? "a space"}${v.platform ? ` · ${PLATFORM_LABEL[v.platform] ?? v.platform}` : ""}`;

export default async function CarePage({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  const { note } = await searchParams;
  const [open, closed] = await Promise.all([openCaseList(), closedCaseList(20)]);
  return (
    <>
      <AutoRefresh seconds={8} />
      <PageHead
        title="Care"
        sub="Members who are confused, stuck, upset or unsafe. Each case has an owner from the crew and stays open until it is solved or someone says it is not a case."
      />
      <Note note={note} />

      <Section title={`Open cases · ${open.length}`}>
        {open.length ? (
          <div className="space-y-3">
            {open.map((v) => (
              <OpenCase key={v.id} v={v} />
            ))}
          </div>
        ) : (
          <Empty>Nobody needs the crew right now. When a member is confused, stuck, upset or unsafe, Ferri opens a case here and in Pocket.</Empty>
        )}
      </Section>

      <Section title="Closed recently">
        {closed.length ? (
          <div className="card divide-y divide-zinc-100">
            {closed.map((v) => (
              <div key={v.id} className="flex items-start justify-between gap-4 px-4 py-3 text-[13px]">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[12px] text-zinc-400">{v.ref}</span>
                    <span className="font-medium">{v.personName}</span>
                    <span className={`badge ${STATUS_STYLE[v.status] ?? ""}`}>{CARE_STATUS_LABEL[v.status] ?? v.status}</span>
                    <span className="text-[12px] text-zinc-400">
                      <span className="inline-flex items-center gap-1.5">
                        <PlatformLogo platform={v.platform} size={13} />
                        {v.kind} · {where(v)}
                      </span>
                    </span>
                  </div>
                  <div className="mt-0.5 text-zinc-700">{v.reason}</div>
                  {v.resolution ? <div className="mt-0.5 text-zinc-500">{v.resolution}</div> : null}
                  <div className="mt-0.5 text-[12px] text-zinc-400">
                    {v.status === "dropped" ? "Closed as not a case" : "Solved"}
                    {v.closedBy ? ` by ${v.closedBy}` : ""} · {ago(v.closedAt ?? v.updatedAt)}
                  </div>
                </div>
                <form action={actOnCase}>
                  <input type="hidden" name="caseId" value={v.id} />
                  <input type="hidden" name="act" value="reopen" />
                  <button className="btn">Reopen</button>
                </form>
              </div>
            ))}
          </div>
        ) : (
          <Empty>No case has been closed yet.</Empty>
        )}
      </Section>
    </>
  );
}

function Hidden({ v, act }: { v: CaseView; act: string }) {
  return (
    <>
      <input type="hidden" name="caseId" value={v.id} />
      <input type="hidden" name="act" value={act} />
    </>
  );
}

function OpenCase({ v }: { v: CaseView }) {
  const first = firstName(v.personName);
  return (
    <div className={`card p-4 ${v.urgent ? "border-red-200" : ""}`}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[12px] text-zinc-400">{v.ref}</span>
        <span className="badge">{v.kind}</span>
        {v.urgent ? <span className={`badge ${urgent}`}>urgent</span> : null}
        <span className={`badge ${STATUS_STYLE[v.status] ?? ""}`}>{CARE_STATUS_LABEL[v.status] ?? v.status}</span>
        {v.job ? (
          <span className={`badge ${JOB_STYLE[v.job.status] ?? ""}`}>
            {v.job.ref} · {JOB_STATUS_LABEL[v.job.status] ?? v.job.status}
          </span>
        ) : null}
        <span className="text-[12px] text-zinc-400">
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <PlatformLogo platform={v.platform} size={13} />
            {v.personName} in {where(v)} · opened {ago(v.createdAt)}
          </span>
        </span>
      </div>
      <div className="text-[15px] font-medium">{v.reason}</div>
      {v.quote ? <div className="mt-1 text-[13px] text-zinc-500 italic">“{v.quote}”</div> : null}
      <div className="mt-1 text-[12px] text-zinc-500">
        Owner: {v.ownerName ?? <span className="text-amber-700">nobody yet</span>} · last heard from {first} {ago(v.lastMessageAt)}
      </div>

      {v.notes.length ? (
        <details className="mt-2 text-[13px]">
          <summary className="cursor-pointer text-[12px] text-zinc-500 hover:text-zinc-900">Timeline · {v.notes.length}</summary>
          <ol className="mt-2 space-y-1.5 border-l-2 border-zinc-100 pl-3">
            {v.notes.map((n) => (
              <li key={n.id}>
                <span className="text-[12px] text-zinc-400">{fmt(n.createdAt)}</span> <span className="font-medium text-zinc-700">{n.by}</span>
                <span className="whitespace-pre-wrap text-zinc-600">: {n.text}</span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}

      <div className="mt-3 flex flex-wrap items-start gap-2">
        <form action={actOnCase}>
          <Hidden v={v} act="mine" />
          <button className="btn-primary">I&apos;m on it</button>
        </form>
        {v.canBuilder ? (
          <form action={actOnCase}>
            <Hidden v={v} act="builder" />
            <button className="btn">Send the Builder</button>
          </form>
        ) : null}
        <form action={actOnCase} className="flex min-w-[320px] flex-1 gap-2">
          <Hidden v={v} act="solved" />
          <input className="input" name="note" placeholder="How was it solved? (optional)" />
          <button className="btn shrink-0">Solved</button>
        </form>
        <form action={actOnCase}>
          <Hidden v={v} act="drop" />
          <button className="btn">Not a case</button>
        </form>
      </div>

      {v.canMessage ? (
        <form action={actOnCase} className="mt-3 space-y-2">
          <Hidden v={v} act="message" />
          <label className="label">Write to {first} (Ferri sends it in {v.spaceName ?? "their space"}, as the crew&apos;s words)</label>
          <textarea className="textarea" name="note" rows={2} required placeholder={`Hi ${first}, someone from the crew is coming over to help.`} />
          <button className="btn">Send to {first}</button>
        </form>
      ) : (
        <div className="mt-3 text-[12px] text-zinc-400">
          Ferri {v.mode ? "only listens" : "is off"} in {v.spaceName ?? "this space"}, so it cannot write to {first} there. Reach them yourself.
        </div>
      )}
    </div>
  );
}
