import { closeEvent, notYet } from "../../../../(desk)/wrap/actions";

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
    <div className="mt-2 space-y-3">
      {what ? <p className="px-1 text-[13px] text-zinc-500">{what}</p> : null}
      <form action={closeEvent}>
        {ids}
        <input type="hidden" name="how" value="off" />
        <button className="btn-lg-primary w-full">Close, spaces Off</button>
      </form>
      {moveTo ? (
        <form action={closeEvent}>
          {ids}
          <input type="hidden" name="how" value="move" />
          <input type="hidden" name="moveTo" value={moveTo} />
          <button className="btn-lg w-full">Close and move the spaces to {moveToName ?? "the next event"}</button>
        </form>
      ) : null}
      <form action={notYet}>
        {ids}
        <button className="btn-lg w-full">Not yet</button>
      </form>
    </div>
  );
}
