"use client";

import { useState } from "react";
import { pocketConfirmPlan, pocketDropPlan } from "../../../actions";
import { QUIET } from "../../quiet";

/** Confirm Ferri's proposal, confirm your own version, or drop it. */
export function PlanActions({ cardId, proposal }: { cardId: string; proposal: string }) {
  const [editing, setEditing] = useState(false);
  return (
    <form action={pocketConfirmPlan} className="mt-3 space-y-3">
      <input type="hidden" name="cardId" value={cardId} />
      {editing ? (
        <>
          <label htmlFor={`text-${cardId}`} className="sr-only">
            Your version
          </label>
          <textarea id={`text-${cardId}`} className="textarea-lg" name="text" rows={4} defaultValue={proposal} autoFocus />
        </>
      ) : (
        <>
          <input type="hidden" name="text" value="" />
          <div className="rounded-[18px] bg-white p-4 text-[15px] leading-relaxed whitespace-pre-wrap text-zinc-800 ring-1 ring-zinc-200">{proposal}</div>
        </>
      )}
      <button className="btn-lg-primary h-14 w-full text-[16px]">{editing ? "Confirm my version" : "Confirm"}</button>
      <div className="flex justify-center gap-1">
        <button type="button" className={QUIET} onClick={() => setEditing((e) => !e)}>
          {editing ? "Use Ferri's proposal" : "Change it"}
        </button>
        <button className={QUIET} formAction={pocketDropPlan} formNoValidate>
          Drop
        </button>
      </div>
    </form>
  );
}
