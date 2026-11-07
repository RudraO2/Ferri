import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { firstName, JOB_STATUS_LABEL, type CaseView } from "@/lib/care";
import { ago } from "@/lib/data";
import { CARE_STATUS_LABEL } from "@/lib/ferri";
import { waitedFor } from "@/lib/pocket";
import { BackHeader, Toast, Where } from "./bits";
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
      <BackHeader href={backHref} title={title} right={<span className="text-[13px] text-zinc-500">{waitedFor(v.createdAt)}</span>} />
      <Toast note={note} />

      <div className="px-5 pt-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-zinc-500">
          <span>
            {v.ref} · {v.kind}
          </span>
          {v.urgent ? <span className="pill bg-red-600 text-white">urgent</span> : null}
          <span className={STATUS_PILL[v.status] ?? "pill"}>{CARE_STATUS_LABEL[v.status] ?? v.status}</span>
        </div>
        <h1 className="mt-2 font-display text-[23px] leading-snug font-extrabold tracking-[-0.02em] text-zinc-900">{v.reason}</h1>
        {v.quote ? (
          <div className="mt-3 inline-block max-w-full rounded-[18px] rounded-bl-[6px] bg-white px-3.5 py-2.5 text-[15px] leading-relaxed text-zinc-700 ring-1 ring-zinc-200">
            “{v.quote}”
          </div>
        ) : null}
      </div>

      <section className="mt-4 px-4">
        <div className="divide-y divide-zinc-100 rounded-[18px] bg-white ring-1 ring-zinc-200">
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
        <details className="group mt-7 px-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 px-1 text-[14px] font-semibold text-zinc-500 [&::-webkit-details-marker]:hidden">
            <ChevronRight size={16} className="transition group-open:rotate-90" aria-hidden />
            What happened
            <span className="font-medium text-zinc-400 tabular-nums">{v.notes.length}</span>
          </summary>
          <ol className="mt-2 divide-y divide-zinc-100 rounded-[18px] bg-white ring-1 ring-zinc-200">
            {v.notes.map((n) => (
              <li key={n.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13.5px] font-medium">{n.by}</span>
                  <span className="text-[12px] text-zinc-500">{ago(n.createdAt)}</span>
                </div>
                <div className="mt-0.5 text-[14px] whitespace-pre-wrap text-zinc-700">{n.text}</div>
              </li>
            ))}
          </ol>
        </details>
      ) : null}

      {!full ? (
        <div className="mt-3 px-5 text-center">
          <Link href={`/m/case/${v.id}`} className="inline-flex h-11 items-center text-[14px] font-medium text-zinc-600 underline underline-offset-2">
            See the whole case
          </Link>
        </div>
      ) : null}
    </>
  );
}
