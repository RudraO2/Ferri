"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";
import { signIn } from "../../login/actions";
import { Ferri } from "@/components/ferri";

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
      {state?.error ? (
        <p role="alert" className="rounded-[14px] bg-red-50 px-3 py-2 text-[14px] text-red-700">
          {state.error}
        </p>
      ) : null}
      <button className="btn-lg-primary w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function PocketLogin() {
  return (
    <main className="flex min-h-dvh flex-col justify-center px-6 pt-[env(safe-area-inset-top)] pb-16">
      <div className="mb-8 flex flex-col items-center text-center">
        <Ferri pose="wave" size={150} alive priority decorative />
        <h1 className="mt-3 font-display text-[30px] font-extrabold tracking-[-0.03em] text-zinc-900">Ferri Pocket</h1>
        <p className="mt-1 text-[15px] text-zinc-500">Your community, answered from your phone.</p>
      </div>
      <Suspense>
        <Form />
      </Suspense>
    </main>
  );
}
