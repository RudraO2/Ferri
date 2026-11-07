import type { OpenRequest } from "@/lib/builder";
import { answerBuilderRequest } from "../actions";

const quiet = "h-9 rounded-full px-3 text-[13px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900";

/** One of the Builder's own Switch cards (a permission it asked for, or its question), answered as the signed-in person. */
export function RequestCard({ r, back = "/builder" }: { r: OpenRequest; back?: string }) {
  const hidden = (
    <>
      <input type="hidden" name="agentId" value={r.agentId} />
      <input type="hidden" name="sessionId" value={r.sessionId} />
      <input type="hidden" name="requestId" value={r.requestId} />
      <input type="hidden" name="kind" value={r.kind} />
      <input type="hidden" name="back" value={back} />
    </>
  );
  if (r.kind === "approval") {
    return (
      <article className="card p-5 text-[13px]">
        <div className="text-[12.5px] font-medium text-amber-700">The Builder asks for permission</div>
        <h3 className="mt-1 text-[16px] font-semibold text-zinc-900">{r.title}</h3>
        {r.detail ? <pre className="mt-2 overflow-x-auto rounded-[10px] bg-zinc-100 px-2.5 py-1.5 font-mono text-[12px] text-zinc-700">{r.detail}</pre> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {r.options.map((o) => (
            <form key={o.id} action={answerBuilderRequest}>
              {hidden}
              <input type="hidden" name="option" value={o.id} />
              <button className={o.decision === "decline" ? quiet : "btn-primary"}>{o.label}</button>
            </form>
          ))}
        </div>
      </article>
    );
  }
  return (
    <article className="card p-5 text-[13px]">
      <div className="text-[12.5px] font-medium text-amber-700">The Builder has a question</div>
      <h3 className="mt-1 text-[16px] font-semibold text-zinc-900">{r.title}</h3>
      {r.questions.map((q) => (
        <div key={q.id} className="mt-3">
          <div className="font-medium text-zinc-800">{q.title}</div>
          <div className="text-zinc-600">{q.prompt}</div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {q.options.map((o, i) => (
              <form key={o.id} action={answerBuilderRequest}>
                {hidden}
                <input type="hidden" name="questionId" value={q.id} />
                <input type="hidden" name="option" value={o.id} />
                <button className={i === 0 ? "btn-primary" : "btn"} title={o.description ?? undefined}>
                  {o.label}
                </button>
              </form>
            ))}
          </div>
          {q.allowCustomAnswer ? (
            <form action={answerBuilderRequest} className="mt-2 flex gap-2">
              {hidden}
              <input type="hidden" name="questionId" value={q.id} />
              <input className="input min-w-0 flex-1" name="text" placeholder="Or answer in your own words" aria-label={`Your own answer to: ${q.title}`} />
              <button className="btn">Send</button>
            </form>
          ) : null}
        </div>
      ))}
    </article>
  );
}
