import { LoginForm } from "./login-form";
import { viewAsGuest } from "./actions";

// Read DESK_GUEST_VIEW when the page is served, not when the image is built.
export const dynamic = "force-dynamic";

/**
 * Desk's sign-in. With DESK_GUEST_VIEW=on (our public demo), anyone can also look around
 * read-only: every page opens, nothing can be changed.
 */
export default function LoginPage() {
  const guest =
    process.env.DESK_GUEST_VIEW === "on" ? (
      <form action={viewAsGuest} className="mt-6 rounded-[20px] border border-dashed border-brand-line bg-brand-soft/60 p-5">
        <p className="text-[14px] font-semibold text-zinc-900">Judging or just curious?</p>
        <p className="muted mt-0.5">Look around the live demo without an account. Nothing can be changed.</p>
        <button className="btn mt-3 h-11 w-full">Look around (read-only)</button>
      </form>
    ) : null;
  return <LoginForm guest={guest} />;
}
