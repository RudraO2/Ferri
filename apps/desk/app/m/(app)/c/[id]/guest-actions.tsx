"use client";

import { useState } from "react";
import { pocketDontSendGuests, pocketSendGuests } from "../../../actions";

/** An email to guests: send Ferri's draft as it is, edit it first, or don't send it. */
export function GuestSendActions({ cardId, draft }: { cardId: string; draft: string }) {
  const [editing, setEditing] = useState(false);
  return (
    <form action={pocketSendGuests} className="mt-3 space-y-3">
      <input type="hidden" name="cardId" value={cardId} />
      {editing ? (
        <textarea className="textarea-lg" name="text" rows={12} defaultValue={draft} autoFocus />
      ) : (
        <>
          <input type="hidden" name="text" value="" />
          <div className="rounded-xl border border-zinc-200 bg-white p-4 text-[15px] leading-relaxed whitespace-pre-wrap">{draft}</div>
        </>
      )}
      <button className="btn-lg-primary w-full">{editing ? "Send my version" : "Send it"}</button>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" className="btn-lg" onClick={() => setEditing((e) => !e)}>
          {editing ? "Use Ferri's draft" : "Edit"}
        </button>
        <button className="btn-lg" formAction={pocketDontSendGuests}>
          Don&apos;t send
        </button>
      </div>
    </form>
  );
}
