"use client";

import { useState } from "react";
import { pocketConfirmPlan, pocketDropPlan } from "../../../actions";

/** Confirm Ferri's proposal, confirm your own version, or drop it. */
export function PlanActions({ cardId, proposal }: { cardId: string; proposal: string }) {
  const [editing, setEditing] = useState(false);
  return (
    <form action={pocketConfirmPlan} className="mt-2 space-y-3">
      <input type="hidden" name="cardId" value={cardId} />
      {editing ? (
        <textarea className="textarea-lg" name="text" rows={4} defaultValue={proposal} autoFocus />
      ) : (
        <>
          <input type="hidden" name="text" value="" />
          <div className="rounded-xl border border-zinc-200 bg-white p-4 text-[15px] leading-relaxed whitespace-pre-wrap">{proposal}</div>
        </>
      )}
      <button className="btn-lg-primary w-full">{editing ? "Confirm my version" : "Confirm"}</button>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" className="btn-lg" onClick={() => setEditing((e) => !e)}>
          {editing ? "Use Ferri's proposal" : "Change it"}
        </button>
        <button className="btn-lg" formAction={pocketDropPlan} formNoValidate>
          Drop
        </button>
      </div>
    </form>
  );
}
