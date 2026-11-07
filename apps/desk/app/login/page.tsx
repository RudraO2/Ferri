import { LoginForm } from "./login-form";
import { viewAsGuest } from "./actions";

/**
 * Desk's sign-in. With DESK_GUEST_VIEW=on (our public demo), anyone can also look around
 * read-only: every page opens, nothing can be changed.
 */
export default function LoginPage() {
  const guest =
    process.env.DESK_GUEST_VIEW === "on" ? (
      <form action={viewAsGuest} className="card mt-3 space-y-2 p-5">
        <p className="muted">Judging or just curious? Look around without an account. Nothing can be changed.</p>
        <button className="btn w-full">Look around (read-only)</button>
      </form>
    ) : null;
  return <LoginForm guest={guest} />;
}
