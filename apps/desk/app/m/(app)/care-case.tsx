import Link from "next/link";
import { firstName, JOB_STATUS_LABEL, type CaseView } from "@/lib/care";
import { ago } from "@/lib/data";
import { CARE_STATUS_LABEL } from "@/lib/ferri";
import { waitedFor } from "@/lib/pocket";
import { Toast, Where } from "./bits";
import { CareActions } from "./care-actions";

export const STATUS_PILL: Record<string, string> = {
  open: "pill bg-amber-100 text-amber-800",
  helping: "pill bg-sky-100 text-sky-800",
  builder: "pill bg-violet-100 text-violet-800",
  solved: "pill bg-emerald-100 text-emerald-800",
  dropped: "pill",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="w-[72px] shrink-0 text-[13px] text-zinc-500">{label}</span>
      <div className="min-w-0 flex-1 text-[14.5px]">{children}</div>
    </div>
  );
}

/**
 * A case on the phone: the reason big, the member's words, who and where,
 * the owner, and the actions. `full` adds the Builder job, the status and
 * the timeline (the case page); a care card shows the short form.
 */
export function CareScreen({
  v,
  title,
  backHref,
  here,
  done,
  note,
  myIds,
  full,
}: {
  v: CaseView;
  title: string;
  backHref: string;
  here: string;
  done: string;
  note?: string;
  myIds: Set<string>;
  full: boolean;
}) {
  const first = firstName(v.personName);
  const mine = !!v.ownerId && myIds.has(v.ownerId) && v.status === "helping";
  return (
    <>
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-200 bg-zinc-50/95 px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-3 backdrop-blur">
        <Link href={backHref} className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 active:bg-zinc-200" aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <div className="text-[15px] font-semibold">{title}</div>
        <span className="ml-auto text-[12px] text-zinc-400">{waitedFor(v.createdAt)}</span>
      </header>
      <Toast note={note} />

      <div className="px-5 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="pill bg-rose-100 text-rose-800">
            {v.ref} · {v.kind}
          </span>
          {v.urgent ? <span className="pill bg-red-600 text-white">urgent</span> : null}
          <span className={STATUS_PILL[v.status] ?? "pill"}>{CARE_STATUS_LABEL[v.status] ?? v.status}</span>
        </div>
        <div className="mt-3 text-[20px] leading-snug font-semibold tracking-tight">{v.reason}</div>
        {v.quote ? <div className="mt-2 text-[15px] leading-relaxed text-zinc-600 italic">“{v.quote}”</div> : null}
      </div>

      <section className="mt-4 px-4">
        <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
          <Row label="Who">
            <div className="font-medium">{v.personName}</div>
            <div className="mt-0.5">
              <Where platform={v.platform} space={v.spaceName} />
            </div>
          </Row>
          <Row label="Owner">
            {v.ownerName ? (
              <span>
                {v.ownerName}
                {mine ? " (you)" : ""}
              </span>
            ) : (
              <span className="font-medium text-amber-700">Nobody is on it yet</span>
            )}
          </Row>
          {full && v.job ? (
            <Row label="Builder">
              {v.job.ref} · {JOB_STATUS_LABEL[v.job.status] ?? v.job.status}
            </Row>
          ) : null}
          {full ? (
            v.isOpen ? (
              <Row label="Open for">
                {waitedFor(v.createdAt)} · last heard from {first} {ago(v.lastMessageAt)}
              </Row>
            ) : (
              <Row label="Closed">
                {v.status === "dropped" ? "Not a case" : "Solved"}
                {v.closedBy ? ` by ${v.closedBy}` : ""} · {ago(v.closedAt ?? v.updatedAt)}
                {v.resolution ? <div className="mt-0.5 text-zinc-600">{v.resolution}</div> : null}
              </Row>
            )
          ) : null}
        </div>
      </section>

      <CareActions caseId={v.id} first={first} isOpen={v.isOpen} mine={mine} canBuilder={v.canBuilder} canMessage={v.canMessage} back={here} done={done} />

      {full && v.notes.length ? (
        <section className="mt-7 px-4">
          <h2 className="px-1 text-[12px] font-semibold tracking-wide text-zinc-500 uppercase">What happened</h2>
          <ol className="mt-2 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
            {v.notes.map((n) => (
              <li key={n.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13.5px] font-medium">{n.by}</span>
                  <span className="text-[12px] text-zinc-400">{ago(n.createdAt)}</span>
                </div>
                <div className="mt-0.5 text-[14px] whitespace-pre-wrap text-zinc-700">{n.text}</div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {!full ? (
        <div className="mt-5 px-5 text-center">
          <Link href={`/m/case/${v.id}`} className="text-[14px] font-medium text-zinc-600 underline underline-offset-2">
            See the whole case
          </Link>
        </div>
      ) : null}
    </>
  );
}
