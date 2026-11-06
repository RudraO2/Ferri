"use client";

import { useState } from "react";
import { pocketCare } from "../actions";

type Props = {
  caseId: string;
  /** The member's first name, for "Write to Meera". */
  first: string;
  isOpen: boolean;
  /** The signed-in person already owns the case. */
  mine: boolean;
  canBuilder: boolean;
  canMessage: boolean;
  /** This page, for errors. */
  back: string;
  /** Where to go once it is sent. */
  done: string;
};

/** A case's actions as big phone buttons: I'm on it, Send the Builder, Solved, Not a case, Write to them; Reopen once closed. */
export function CareActions({ caseId, first, isOpen, mine, canBuilder, canMessage, back, done }: Props) {
  const [panel, setPanel] = useState<null | "solved" | "message">(null);
  const hidden = (act: string) => (
    <>
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="act" value={act} />
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="done" value={done} />
    </>
  );

  if (!isOpen) {
    return (
      <form action={pocketCare} className="mt-5 px-4">
        {hidden("reopen")}
        <button className="btn-lg w-full">Reopen this case</button>
      </form>
    );
  }

  if (panel === "solved") {
    return (
      <form action={pocketCare} className="mt-5 space-y-3 px-4">
        {hidden("solved")}
        <textarea className="textarea-lg" name="note" rows={3} autoFocus placeholder="How was it solved? (optional)" />
        <button className="btn-lg-primary w-full">Mark it solved</button>
        <button type="button" className="btn-lg w-full" onClick={() => setPanel(null)}>
          Back
        </button>
      </form>
    );
  }

  if (panel === "message") {
    return (
      <form action={pocketCare} className="mt-5 space-y-3 px-4">
        {hidden("message")}
        <textarea className="textarea-lg" name="note" rows={4} required autoFocus placeholder={`Hi ${first}, someone from the crew is coming over to help.`} />
        <p className="px-1 text-[13px] text-zinc-500">Ferri posts it to {first} in their space, as the crew&apos;s words.</p>
        <button className="btn-lg-primary w-full">Send to {first}</button>
        <button type="button" className="btn-lg w-full" onClick={() => setPanel(null)}>
          Back
        </button>
      </form>
    );
  }

  return (
    <div className="mt-5 space-y-3 px-4">
      {mine ? null : (
        <form action={pocketCare}>
          {hidden("mine")}
          <button className="btn-lg-primary w-full">I&apos;m on it</button>
        </form>
      )}
      {canBuilder ? (
        <form action={pocketCare}>
          {hidden("builder")}
          <button className="btn-lg w-full">Send the Builder</button>
        </form>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <button type="button" className={mine ? "btn-lg-primary" : "btn-lg"} onClick={() => setPanel("solved")}>
          Solved
        </button>
        <form action={pocketCare}>
          {hidden("drop")}
          <button className="btn-lg w-full">Not a case</button>
        </form>
      </div>
      {canMessage ? (
        <button type="button" className="btn-lg w-full" onClick={() => setPanel("message")}>
          Write to {first}
        </button>
      ) : null}
    </div>
  );
}
