"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";
import { signIn } from "../../login/actions";
import { PocketLogo } from "../logo";

function Form() {
  const next = useSearchParams().get("next") || "/m";
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next.startsWith("/m") ? next : "/m"} />
      <div>
        <label className="label" htmlFor="email">
          Switch email
        </label>
        <input className="input-lg" id="email" name="email" type="email" autoComplete="username" inputMode="email" required />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input className="input-lg" id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state?.error ? <p className="text-[14px] text-red-600">{state.error}</p> : null}
      <button className="btn-lg-primary w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function PocketLogin() {
  return (
    <main className="flex min-h-dvh flex-col justify-center px-6 pb-16">
      <div className="mb-8 flex items-center gap-3">
        <PocketLogo size={36} />
        <div>
          <div className="text-[18px] font-semibold tracking-tight">Ferri Pocket</div>
          <div className="text-[13px] text-zinc-500">Your community, answered from your phone.</div>
        </div>
      </div>
      <Suspense>
        <Form />
      </Suspense>
    </main>
  );
}
