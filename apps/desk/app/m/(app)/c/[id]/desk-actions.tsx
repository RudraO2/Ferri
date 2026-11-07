import { answerDeskCard } from "../../../../(desk)/desks/actions";
import { QUIET } from "../../quiet";

/** A desk card (spec 20) in Pocket: the rooms it makes (or the skill Ferri wrote), then Make them / Don't. Answers the card as you. */
export function DeskActions({ cardId, payload, what }: { cardId: string; payload: Record<string, unknown> | null; what: string | null }) {
  const type = payload?.type === "custom" ? "custom" : "pack";
  const lines = Array.isArray(payload?.lines) ? (payload.lines as unknown[]).filter((l): l is string => typeof l === "string") : [];
  const skill = typeof payload?.skill === "string" ? payload.skill : null;
  const tasks = Array.isArray(payload?.tasks) ? (payload.tasks as unknown[]).filter((t): t is string => typeof t === "string") : [];
  const back = `/m/c/${cardId}`;
  return (
    <div className="mt-3 space-y-3">
      {lines.length ? (
        <ul className="space-y-2 rounded-[18px] bg-white p-4 text-[14.5px] text-zinc-800 ring-1 ring-zinc-200">
          {lines.map((l) => (
            <li key={l} className="leading-snug">
              {l}
            </li>
          ))}
        </ul>
      ) : what ? (
        <p className="px-1 text-[14px] whitespace-pre-wrap text-zinc-600">{what}</p>
      ) : null}
      {type === "pack" && tasks.length ? <p className="px-1 text-[13px] text-zinc-500">Also adds {tasks.length} starter tasks to the plan.</p> : null}
      {skill ? (
        <details className="rounded-[18px] bg-white px-4 py-1 text-[13px] ring-1 ring-zinc-200">
          <summary className="flex min-h-11 cursor-pointer items-center text-zinc-600">The skill Ferri wrote</summary>
          <pre className="pb-3 text-[12px] whitespace-pre-wrap text-zinc-700">{skill}</pre>
        </details>
      ) : null}
      <form action={answerDeskCard}>
        <input type="hidden" name="cardId" value={cardId} />
        <input type="hidden" name="back" value={back} />
        <input type="hidden" name="choice" value="make" />
        <button className="btn-lg-primary h-14 w-full text-[16px]">{type === "custom" ? "Make it" : "Make them"}</button>
      </form>
      <form action={answerDeskCard} className="flex justify-center">
        <input type="hidden" name="cardId" value={cardId} />
        <input type="hidden" name="back" value={back} />
        <input type="hidden" name="choice" value="skip" />
        <button className={QUIET}>Don&apos;t</button>
      </form>
    </div>
  );
}
