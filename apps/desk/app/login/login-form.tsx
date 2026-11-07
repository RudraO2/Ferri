"use client";

import { useActionState } from "react";
import { signIn } from "./actions";

export function LoginForm({ guest }: { guest: React.ReactNode }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-[340px]">
        <div className="mb-6 flex items-center gap-2">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">Ferri Desk</span>
        </div>
        <form action={action} className="card space-y-3 p-5">
          <p className="muted">Sign in with your Switch account.</p>
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input className="input" id="email" name="email" type="email" autoComplete="username" required />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          {state?.error ? <p className="text-[13px] text-red-600">{state.error}</p> : null}
          <button className="btn-primary w-full" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
        {guest}
      </div>
    </main>
  );
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <rect width="24" height="24" rx="6" fill="#18181b" />
      <path d="M6 15c3-6 9-6 12 0" stroke="#fafafa" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="12" cy="15" r="1.6" fill="#fafafa" />
    </svg>
  );
}
