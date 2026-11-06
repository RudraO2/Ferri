import Link from "next/link";
import { magicLink, signIn } from "../actions";
import { Msg } from "../msg";

export default async function Login({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  return (
    <div className="wrap page">
      <h1>Sign in</h1>
      <Msg msg={msg} />
      <form action={signIn} className="stack">
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button className="btn">Sign in</button>
        <p className="muted">
          New here? <Link href="/register">Register</Link>.
        </p>
      </form>
      {process.env.SITE_EMAIL === "on" ? (
        <form action={magicLink} className="stack" style={{ marginTop: 32 }}>
          <h2>Or get a sign-in link</h2>
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <button className="btn ghost">Email me a link</button>
        </form>
      ) : null}
    </div>
  );
}
