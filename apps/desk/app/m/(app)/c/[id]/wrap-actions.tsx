import { closeEvent, notYet } from "../../../../(desk)/wrap/actions";
import { QUIET } from "../../quiet";

/** The close card (spec 19) in Pocket: Off, move (when the card offers it), Not yet. Answers the card as you. */
export function WrapActions({ cardId, payload, what }: { cardId: string; payload: Record<string, unknown> | null; what: string | null }) {
  const eventId = typeof payload?.eventId === "string" ? payload.eventId : "";
  const moveTo = typeof payload?.moveTo === "string" ? payload.moveTo : null;
  const moveToName = typeof payload?.moveToName === "string" ? payload.moveToName : null;
  const back = `/m/c/${cardId}`;
  const ids = (
    <>
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="back" value={back} />
    </>
  );
  return (
    <div className="mt-3 space-y-3">
      {what ? <p className="px-1 text-[14px] text-zinc-600">{what}</p> : null}
      <form action={closeEvent}>
        {ids}
        <input type="hidden" name="how" value="off" />
        <button className="btn-lg-primary h-14 w-full text-[16px]">Close, spaces Off</button>
      </form>
      {moveTo ? (
        <form action={closeEvent}>
          {ids}
          <input type="hidden" name="how" value="move" />
          <input type="hidden" name="moveTo" value={moveTo} />
          <button className="btn-lg w-full">Close and move spaces to {moveToName ?? "the next event"}</button>
        </form>
      ) : null}
      <form action={notYet} className="flex justify-center">
        {ids}
        <button className={QUIET}>Not yet</button>
      </form>
    </div>
  );
}
