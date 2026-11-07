"use client";

import { useState } from "react";
import { pocketDontSendGuests, pocketSendGuests } from "../../../actions";
import { QUIET } from "../../quiet";

/** An email to guests: send Ferri's draft as it is, edit it first, or don't send it. */
export function GuestSendActions({ cardId, draft }: { cardId: string; draft: string }) {
  const [editing, setEditing] = useState(false);
  return (
    <form action={pocketSendGuests} className="mt-3 space-y-3">
      <input type="hidden" name="cardId" value={cardId} />
      {editing ? (
        <>
          <label htmlFor={`text-${cardId}`} className="sr-only">
            Your version
          </label>
          <textarea id={`text-${cardId}`} className="textarea-lg" name="text" rows={12} defaultValue={draft} autoFocus />
        </>
      ) : (
        <>
          <input type="hidden" name="text" value="" />
          <div className="rounded-[18px] bg-white p-4 text-[15px] leading-relaxed whitespace-pre-wrap text-zinc-800 ring-1 ring-zinc-200">{draft}</div>
        </>
      )}
      <button className="btn-lg-primary h-14 w-full text-[16px]">{editing ? "Send my version" : "Send it"}</button>
      <div className="flex justify-center gap-1">
        <button type="button" className={QUIET} onClick={() => setEditing((e) => !e)}>
          {editing ? "Use Ferri's draft" : "Edit"}
        </button>
        <button className={QUIET} formAction={pocketDontSendGuests}>
          Don&apos;t send
        </button>
      </div>
    </form>
  );
}
