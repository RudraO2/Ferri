import { ChevronDown } from "lucide-react";
import { PlatformLogo } from "@/components/platform";
import { closedCaseList, firstName, JOB_STATUS_LABEL, openCaseList, type CaseView } from "@/lib/care";
import { ago, fmt } from "@/lib/data";
import { CARE_STATUS_LABEL } from "@/lib/ferri";
import { shortSpace } from "@/lib/pocket";
import { actOnCase } from "../actions";
import { AutoRefresh } from "../refresh";
import { Empty, Fold, Note, PageHead, Section } from "../ui";

const STATUS_STYLE: Record<string, string> = {
  open: "bg-amber-50 text-amber-700",
  helping: "bg-sky-50 text-sky-700",
  builder: "bg-violet-50 text-violet-700",
  solved: "bg-emerald-50 text-emerald-700",
  dropped: "bg-zinc-100 text-zinc-500",
};
const JOB_STYLE: Record<string, string> = {
  queued: "bg-violet-50 text-violet-700",
  handed: "bg-violet-50 text-violet-700",
  working: "bg-violet-50 text-violet-700",
  done: "bg-emerald-50 text-emerald-700",
  stuck: "bg-amber-50 text-amber-700",
  failed: "bg-red-50 text-red-700",
  cancelled: "bg-zinc-100 text-zinc-500",
};
const quiet = "h-9 rounded-full px-3 text-[13px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900";

// The logo already names the platform, so the text names only the space.
const where = (v: CaseView) => shortSpace(v.spaceName);

export default async function CarePage({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  const { note } = await searchParams;
  const [open, closed] = await Promise.all([openCaseList(), closedCaseList(20)]);
  return (
    <>
      <AutoRefresh seconds={8} />
      <PageHead
        title="Care"
        sub="Members who are confused, stuck, upset or unsafe."
        about={
          <p>Ferri reads every member message in attached spaces. When someone needs a person, it opens a case with an owner from the crew. A case stays open until it is solved or someone says it is not a case.</p>
        }
      />
      <Note note={note} />

      {open.length ? (
        <Section title="Open cases" count={open.length}>
          <div className="space-y-4">
            {open.map((v) => (
              <OpenCase key={v.id} v={v} />
            ))}
          </div>
        </Section>
      ) : (
        <div className="mb-10">
          <Empty pose="main" title="All calm">
            Nobody needs the crew right now. When a member is confused, stuck, upset or unsafe, Ferri opens a case here and in Pocket.
          </Empty>
        </div>
      )}

      <Fold title="Closed recently" count={closed.length}>
        {closed.length ? (
          <ul className="card-flat divide-y divide-zinc-100">
            {closed.map((v) => (
              <li key={v.id} className="flex items-start justify-between gap-4 px-4 py-3 text-[13px]">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-zinc-900">{v.reason}</div>
                  {v.resolution ? <div className="mt-0.5 text-zinc-600">{v.resolution}</div> : null}
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-zinc-500">
                    <PlatformLogo platform={v.platform} size={12} />
                    {v.ref} · {v.personName} · {v.status === "dropped" ? "not a case" : "solved"}
                    {v.closedBy ? ` by ${v.closedBy}` : ""} · {ago(v.closedAt ?? v.updatedAt)}
                  </div>
                </div>
                <form action={actOnCase}>
                  <input type="hidden" name="caseId" value={v.id} />
                  <input type="hidden" name="act" value="reopen" />
                  <button className={quiet}>Reopen</button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <Empty quiet>No case has been closed yet.</Empty>
        )}
      </Fold>
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
    <article className={`card p-5 sm:p-6 ${v.urgent ? "border-red-200" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-zinc-500">
        {v.urgent ? <span className="badge bg-red-50 text-red-700">urgent</span> : null}
        <span className="inline-flex items-center gap-1.5">
          <PlatformLogo platform={v.platform} size={13} />
          {v.personName} · {where(v)}
        </span>
        <span aria-hidden>·</span>
        <span>
          {v.ref} · {v.kind} · {ago(v.createdAt)}
        </span>
        <span className="ml-auto flex flex-wrap gap-1.5">
          {v.status !== "open" ? <span className={`badge ${STATUS_STYLE[v.status] ?? ""}`}>{CARE_STATUS_LABEL[v.status] ?? v.status}</span> : null}
          {v.job ? (
            <span className={`badge ${JOB_STYLE[v.job.status] ?? ""}`}>
              {v.job.ref} · {JOB_STATUS_LABEL[v.job.status] ?? v.job.status}
            </span>
          ) : null}
        </span>
      </div>
      <h3 className="mt-2 font-display text-[20px] leading-snug font-extrabold tracking-[-0.02em] text-zinc-900">{v.reason}</h3>
      {v.quote ? <p className="mt-1.5 text-[13.5px] text-zinc-600 italic">“{v.quote}”</p> : null}
      <div className="mt-2 text-[12.5px] text-zinc-500">
        Owner: {v.ownerName ?? <span className="text-amber-700">nobody yet</span>} · last heard from {first} {ago(v.lastMessageAt)}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
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
        <form action={actOnCase}>
          <Hidden v={v} act="solved" />
          <button className="btn">Solved</button>
        </form>
        <form action={actOnCase}>
          <Hidden v={v} act="drop" />
          <button className={quiet}>Not a case</button>
        </form>
      </div>

      <details className="group mt-3">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[12.5px] font-medium text-zinc-500 hover:text-zinc-900 [&::-webkit-details-marker]:hidden">
          {v.canMessage ? `Write to ${first}, add a note` : "Add a note"}
          {v.notes.length ? ` · timeline ${v.notes.length}` : ""}
          <ChevronDown size={13} className="transition group-open:rotate-180" aria-hidden />
        </summary>
        <div className="mt-3 space-y-4">
          {v.canMessage ? (
            <form action={actOnCase} className="space-y-2">
              <Hidden v={v} act="message" />
              <label className="label" htmlFor={`msg-${v.id}`}>
                Write to {first} (Ferri sends it in {v.spaceName ?? "their space"}, as the crew&apos;s words)
              </label>
              <textarea id={`msg-${v.id}`} className="textarea" name="note" rows={2} required placeholder={`Hi ${first}, someone from the crew is coming over to help.`} />
              <button className="btn">Send to {first}</button>
            </form>
          ) : (
            <p className="text-[12.5px] text-zinc-500">
              Ferri {v.mode ? "only listens" : "is off"} in {v.spaceName ?? "this space"}, so it cannot write to {first} there. Reach them yourself.
            </p>
          )}
          <form action={actOnCase} className="flex flex-wrap gap-2">
            <Hidden v={v} act="solved" />
            <input className="input min-w-0 flex-1 basis-[220px]" name="note" placeholder="How was it solved? (optional)" aria-label="How was it solved?" />
            <button className="btn shrink-0">Solved with this note</button>
          </form>
          {v.notes.length ? (
            <ol className="space-y-1.5 border-l-2 border-zinc-100 pl-3 text-[13px]">
              {v.notes.map((n) => (
                <li key={n.id}>
                  <span className="text-[12px] text-zinc-500">{fmt(n.createdAt)}</span> <span className="font-medium text-zinc-700">{n.by}</span>
                  <span className="whitespace-pre-wrap text-zinc-600">: {n.text}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </details>
    </article>
  );
}
