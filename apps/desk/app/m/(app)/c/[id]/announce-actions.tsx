"use client";

import { useState } from "react";
import { pocketDontPost, pocketPostAnnouncement } from "../../../actions";
import { QUIET } from "../../quiet";

/** Post the announcement as drafted (or edit it everywhere), write your own version first, or don't post. */
export function AnnounceActions({ cardId, draft, edit, scheduled }: { cardId: string; draft: string; edit: boolean; scheduled: boolean }) {
  const [editing, setEditing] = useState(false);
  const go = edit ? "Edit everywhere" : scheduled ? "Approve for its time" : "Post it";
  return (
    <form action={pocketPostAnnouncement} className="mt-3 space-y-3">
      <input type="hidden" name="cardId" value={cardId} />
      {editing ? (
        <>
          <label htmlFor={`text-${cardId}`} className="sr-only">
            Your version
          </label>
          <textarea id={`text-${cardId}`} className="textarea-lg" name="text" rows={7} defaultValue={draft} autoFocus />
        </>
      ) : (
        <>
          <input type="hidden" name="text" value="" />
          <div className="rounded-[18px] bg-white p-4 text-[15px] leading-relaxed whitespace-pre-wrap text-zinc-800 ring-1 ring-zinc-200">{draft}</div>
        </>
      )}
      <button className="btn-lg-primary h-14 w-full text-[16px]">{editing ? `${go} with my version` : go}</button>
      <div className="flex justify-center gap-1">
        <button type="button" className={QUIET} onClick={() => setEditing((e) => !e)}>
          {editing ? "Use Ferri's draft" : "Edit"}
        </button>
        <button className={QUIET} formAction={pocketDontPost} formNoValidate>
          {edit ? "Keep it as is" : "Don't post"}
        </button>
      </div>
    </form>
  );
}
