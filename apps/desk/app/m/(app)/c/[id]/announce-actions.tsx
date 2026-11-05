"use client";

import { useState } from "react";
import { pocketDontPost, pocketPostAnnouncement } from "../../../actions";

/** Post the announcement as drafted (or edit it everywhere), write your own version first, or don't post. */
export function AnnounceActions({ cardId, draft, edit, scheduled }: { cardId: string; draft: string; edit: boolean; scheduled: boolean }) {
  const [editing, setEditing] = useState(false);
  const go = edit ? "Edit everywhere" : scheduled ? "Approve for its time" : "Post it";
  return (
    <form action={pocketPostAnnouncement} className="mt-2 space-y-3">
      <input type="hidden" name="cardId" value={cardId} />
      {editing ? (
        <textarea className="textarea-lg" name="text" rows={7} defaultValue={draft} autoFocus />
      ) : (
        <>
          <input type="hidden" name="text" value="" />
          <div className="rounded-xl border border-zinc-200 bg-white p-4 text-[15px] leading-relaxed whitespace-pre-wrap">{draft}</div>
        </>
      )}
      <button className="btn-lg-primary w-full">{editing ? `${go} with my version` : go}</button>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" className="btn-lg" onClick={() => setEditing((e) => !e)}>
          {editing ? "Use Ferri's draft" : "Edit"}
        </button>
        <button className="btn-lg" formAction={pocketDontPost} formNoValidate>
          {edit ? "Keep it as is" : "Don't post"}
        </button>
      </div>
    </form>
  );
}
