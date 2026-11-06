import type { OpenRequest } from "@/lib/builder";
import { answerBuilderRequest } from "../actions";

const warn = "border-amber-200 bg-amber-50 text-amber-700";

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
      <div className="card border-amber-200 p-4 text-[13px]">
        <div className="flex items-center gap-2">
          <span className={`badge ${warn}`}>permission</span>
          <span className="font-medium">{r.title}</span>
        </div>
        {r.detail ? <pre className="mt-2 overflow-x-auto rounded-md bg-zinc-50 px-2.5 py-1.5 font-mono text-[12px] text-zinc-700">{r.detail}</pre> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {r.options.map((o) => (
            <form key={o.id} action={answerBuilderRequest}>
              {hidden}
              <input type="hidden" name="option" value={o.id} />
              <button className={o.decision === "decline" ? "btn" : "btn-primary"}>{o.label}</button>
            </form>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="card border-amber-200 p-4 text-[13px]">
      <div className="flex items-center gap-2">
        <span className={`badge ${warn}`}>question</span>
        <span className="font-medium">{r.title}</span>
      </div>
      {r.questions.map((q) => (
        <div key={q.id} className="mt-2">
          <div className="font-medium text-zinc-800">{q.title}</div>
          <div className="text-zinc-600">{q.prompt}</div>
          <div className="mt-2 flex flex-wrap gap-2">
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
              <input className="input flex-1" name="text" placeholder="Or answer in your own words" />
              <button className="btn">Send</button>
            </form>
          ) : null}
        </div>
      ))}
    </div>
  );
}
