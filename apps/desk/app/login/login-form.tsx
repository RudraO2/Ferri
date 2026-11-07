"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight } from "lucide-react";
import { Ferri, FerriLogo } from "@/components/ferri";
import { ThemeToggle } from "@/components/theme-toggle";
import { signIn } from "./actions";

export function LoginForm({ guest }: { guest: React.ReactNode }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <main className="grid min-h-screen lg:grid-cols-[1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-brand p-12 text-white lg:flex">
        <Link href="/welcome" aria-label="Ferri home" className="w-fit rounded-full bg-white/95 py-1.5 pr-4 pl-1.5">
          <FerriLogo size={30} />
        </Link>
        <div>
          <h1 className="display max-w-[480px] text-[56px]">Your crew&apos;s side of Ferri.</h1>
          <p className="mt-4 max-w-[440px] text-[17px] leading-relaxed text-white/85">Cards, care cases, announcements and everything Ferri knows, in one place.</p>
        </div>
        <Ferri pose="wave" size={300} alive decorative className="absolute -right-6 -bottom-4" />
        <span className="text-[13px] text-white/70">Built on Switch.</span>
      </section>

      <section className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between lg:justify-end">
          <Link href="/welcome" aria-label="Ferri home" className="lg:hidden">
            <FerriLogo size={30} />
          </Link>
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center py-10">
          <Ferri pose="wave" size={96} decorative className="mb-4 lg:hidden" />
          <h2 className="h1">Sign in to Desk</h2>
          <p className="muted mt-1.5">Use your Switch account.</p>
          <form action={action} className="mt-7 space-y-4">
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input className="input h-11" id="email" name="email" type="email" autoComplete="username" required />
            </div>
            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <input className="input h-11" id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            {state?.error ? (
              <p role="alert" className="rounded-[12px] bg-red-50 px-3 py-2 text-[13px] text-red-700">
                {state.error}
              </p>
            ) : null}
            <button className="btn-primary h-11 w-full text-[14.5px]" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
              {pending ? null : <ArrowRight size={16} aria-hidden />}
            </button>
          </form>
          {guest}
        </div>
      </section>
    </main>
  );
}
