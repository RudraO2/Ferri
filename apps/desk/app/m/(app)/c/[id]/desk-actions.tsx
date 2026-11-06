import { answerDeskCard } from "../../../../(desk)/desks/actions";

/** A desk card (spec 20) in Pocket: the rooms it makes (or the skill Ferri wrote), then Make them / Don't. Answers the card as you. */
export function DeskActions({ cardId, payload, what }: { cardId: string; payload: Record<string, unknown> | null; what: string | null }) {
  const type = payload?.type === "custom" ? "custom" : "pack";
  const lines = Array.isArray(payload?.lines) ? (payload.lines as unknown[]).filter((l): l is string => typeof l === "string") : [];
  const skill = typeof payload?.skill === "string" ? payload.skill : null;
  const tasks = Array.isArray(payload?.tasks) ? (payload.tasks as unknown[]).filter((t): t is string => typeof t === "string") : [];
  const back = `/m/c/${cardId}`;
  return (
    <div className="mt-2 space-y-3">
      {lines.length ? (
        <ul className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4 text-[14px]">
          {lines.map((l) => (
            <li key={l} className="leading-snug">
              {l}
            </li>
          ))}
        </ul>
      ) : what ? (
        <p className="px-1 text-[13px] whitespace-pre-wrap text-zinc-500">{what}</p>
      ) : null}
      {type === "pack" && tasks.length ? <p className="px-1 text-[13px] text-zinc-500">Also puts {tasks.length} starter tasks on the plan and adds the pack&apos;s instructions to the event.</p> : null}
      {skill ? (
        <details className="rounded-xl border border-zinc-200 bg-white p-4 text-[13px]">
          <summary className="cursor-pointer text-zinc-600">The skill Ferri wrote</summary>
          <pre className="mt-2 text-[12px] whitespace-pre-wrap text-zinc-700">{skill}</pre>
        </details>
      ) : null}
      <form action={answerDeskCard}>
        <input type="hidden" name="cardId" value={cardId} />
        <input type="hidden" name="back" value={back} />
        <input type="hidden" name="choice" value="make" />
        <button className="btn-lg-primary w-full">{type === "custom" ? "Make it" : "Make them"}</button>
      </form>
      <form action={answerDeskCard}>
        <input type="hidden" name="cardId" value={cardId} />
        <input type="hidden" name="back" value={back} />
        <input type="hidden" name="choice" value="skip" />
        <button className="btn-lg w-full">Don&apos;t</button>
      </form>
    </div>
  );
}
