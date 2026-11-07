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
      <form action={viewAsGuest} className="mt-8 border-t border-zinc-200 pt-6 text-center">
        <p className="muted">No account? Look around the live demo, read-only.</p>
        <button className="btn mt-3 h-11 w-full">Look around</button>
      </form>
    ) : null;
  return <LoginForm guest={guest} />;
}
