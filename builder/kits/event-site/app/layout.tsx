import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { event } from "@/lib/event";
import { currentUser, isAdmin } from "@/lib/supabase";
import { signOut } from "./actions";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `${event.name} · ${event.dates}`,
  description: event.tagline,
  openGraph: { title: event.name, description: `${event.tagline} ${event.dates}, ${event.venue.name}.` },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: event.accent };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en" style={{ ["--accent" as string]: event.accent }}>
      <body>
        <header className="top">
          <div className="wrap row">
            <Link href="/" className="brand">
              {event.name}
            </Link>
            <nav className="row gap">
              <Link href="/#schedule">Schedule</Link>
              <Link href="/#faq">FAQ</Link>
              {user ? (
                <>
                  <Link href="/me">My registration</Link>
                  {isAdmin(user) ? <Link href="/admin">Admin</Link> : null}
                  <form action={signOut}>
                    <button className="link">Sign out</button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/login">Sign in</Link>
                  <Link href="/register" className="btn small">
                    Register
                  </Link>
                </>
              )}
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="wrap foot">
          <span>
            {event.community} · {event.contact.text}
            {event.contact.email ? (
              <>
                {" "}
                · <a href={`mailto:${event.contact.email}`}>{event.contact.email}</a>
              </>
            ) : null}
          </span>
        </footer>
      </body>
    </html>
  );
}
