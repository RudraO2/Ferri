import type { OpenRequest } from "@/lib/builder";
import { answerBuilderRequest } from "../../(desk)/actions";

/** The Builder's own Switch cards in Pocket: a permission it asked for, or its question. */
export function BuilderCards({ requests }: { requests: OpenRequest[] }) {
  if (!requests.length) return null;
  return (
    <div className="mt-3 space-y-3 px-4">
      {requests.map((r) => {
        const hidden = (
          <>
            <input type="hidden" name="agentId" value={r.agentId} />
            <input type="hidden" name="sessionId" value={r.sessionId} />
            <input type="hidden" name="requestId" value={r.requestId} />
            <input type="hidden" name="kind" value={r.kind} />
            <input type="hidden" name="back" value="/m" />
          </>
        );
        return (
          <div key={r.requestId} className="rounded-xl border border-amber-200 bg-white p-4 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="pill bg-amber-100 text-amber-800">{r.kind === "approval" ? "Builder wants to" : "Builder asks"}</span>
            </div>
            <div className="mt-2 text-[16px] leading-snug font-medium">{r.kind === "approval" ? r.title : (r.questions[0]?.title ?? r.title)}</div>
            {r.kind === "approval" && r.detail ? (
              <pre className="mt-2 overflow-x-auto rounded-md bg-zinc-50 px-2.5 py-1.5 font-mono text-[12px] text-zinc-700">{r.detail}</pre>
            ) : r.questions[0]?.prompt ? (
              <div className="mt-1 text-[14px] text-zinc-600">{r.questions[0].prompt}</div>
            ) : null}
            <div className="mt-3 grid gap-2">
              {r.kind === "approval"
                ? r.options
                    .filter((o) => o.decision !== "acceptForSession")
                    .map((o) => (
                      <form key={o.id} action={answerBuilderRequest}>
                        {hidden}
                        <input type="hidden" name="option" value={o.id} />
                        <button className={`w-full ${o.decision === "decline" ? "btn-lg" : "btn-lg-primary"}`}>{o.decision === "decline" ? "No" : "Yes, once"}</button>
                      </form>
                    ))
                : (r.questions[0]?.options ?? []).map((o, i) => (
                    <form key={o.id} action={answerBuilderRequest}>
                      {hidden}
                      <input type="hidden" name="questionId" value={r.questions[0]!.id} />
                      <input type="hidden" name="option" value={o.id} />
                      <button className={`w-full ${i === 0 ? "btn-lg-primary" : "btn-lg"}`}>{o.label}</button>
                    </form>
                  ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
