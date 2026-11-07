import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { event } from "@/lib/event";
import { accent, accentVars, hasLook, look } from "@/lib/look";
import { currentUser, isAdmin } from "@/lib/supabase";
import { signOut } from "./actions";
import { Menu } from "./menu";
import "./globals.css";

export const dynamic = "force-dynamic";

/** The live address (scripts/vercel-env.mjs sets it), so the link preview image gets a full URL. */
function siteUrl(): URL | undefined {
  try {
    return process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : undefined;
  } catch {
    return undefined;
  }
}

// The poster's link card is the site's preview image, so a shared link looks like the posters.
const card = hasLook ? (look.card ?? null) : null;
// The community logo from the poster job: the header mark and the favicon.
const logo = hasLook ? (look.logo ?? null) : null;

/** Without a logo, the favicon is the event's first letter on the accent. */
function letterIcon(): string {
  const letter = /[A-Za-z0-9]/.exec(event.name.replace(/^\[.*\]$/, ""))?.[0]?.toUpperCase() ?? "E";
  const fill = /^[#a-z0-9(),.%\s-]+$/i.test(accent) ? accent : "#2563eb";
  const ink = accentVars(fill)["--on-accent"] ?? "#ffffff";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${fill}"/><text x="32" y="44" font-family="system-ui,-apple-system,Segoe UI,Arial,sans-serif" font-size="34" font-weight="700" text-anchor="middle" fill="${ink}">${letter}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: `${event.name} · ${event.dates}`,
  description: event.tagline,
  icons: { icon: [logo ? { url: logo } : { url: letterIcon(), type: "image/svg+xml" }] },
  openGraph: {
    title: event.name,
    description: `${event.tagline} ${event.dates}, ${event.venue.name}.`,
    images: card ? [{ url: card.image, width: card.width, height: card.height, alt: `${event.name} poster` }] : undefined,
  },
  twitter: card ? { card: "summary_large_image", title: event.name, description: event.tagline, images: [card.image] } : undefined,
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: accent };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const admin = user ? isAdmin(user) : false;
  const mark = logo ? (
    <img src={logo} alt="" width={28} height={28} />
  ) : (
    <span className="brand-mark" aria-hidden="true">
      {/[A-Za-z0-9]/.exec(event.name.replace(/^\[.*\]$/, ""))?.[0]?.toUpperCase() ?? "E"}
    </span>
  );
  return (
    <html lang="en" data-look={hasLook ? "poster" : undefined} style={accentVars(accent)}>
      {look.css ? (
        <head>
          {/* The poster's fonts and font variables, written by scripts/poster-look.mjs. */}
          <style dangerouslySetInnerHTML={{ __html: look.css }} />
        </head>
      ) : null}
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header className="top">
          <div className="wrap top-row">
            <Link href="/" className="brand">
              {mark}
              <span className="brand-name">{event.name}</span>
            </Link>
            <nav className="nav" aria-label="Main">
              <Link href="/#schedule">Schedule</Link>
              <Link href="/#venue">Venue</Link>
              <Link href="/#faq">FAQ</Link>
              {user ? (
                <>
                  {admin ? <Link href="/admin">Admin</Link> : null}
                  <form action={signOut}>
                    <button className="link">Sign out</button>
                  </form>
                </>
              ) : (
                <Link href="/login">Sign in</Link>
              )}
            </nav>
            <div className="top-actions">
              {user ? (
                <Link href="/me" className="btn small">
                  My registration
                </Link>
              ) : (
                <Link href="/register" className="btn small">
                  Register
                </Link>
              )}
              <Menu>
                <summary aria-label="Menu">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden="true">
                    <path d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                </summary>
                <div className="menu-panel">
                  <Link href="/#schedule">Schedule</Link>
                  <Link href="/#venue">Venue</Link>
                  <Link href="/#faq">FAQ</Link>
                  {user ? (
                    <>
                      {admin ? <Link href="/admin">Admin</Link> : null}
                      <form action={signOut}>
                        <button className="link">Sign out</button>
                      </form>
                    </>
                  ) : (
                    <Link href="/login">Sign in</Link>
                  )}
                </div>
              </Menu>
            </div>
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className="foot">
          <div className="wrap foot-grid">
            <div className="foot-brand">
              {mark}
              <div>
                <b>{event.community}</b>
                <span>
                  {event.name}, {event.dates}
                </span>
              </div>
            </div>
            <p className="foot-contact">
              {event.contact.text}
              {event.contact.email ? (
                <>
                  {" "}
                  <a href={`mailto:${event.contact.email}`}>{event.contact.email}</a>
                </>
              ) : null}
            </p>
            <nav className="foot-links" aria-label="Footer">
              <Link href="/#schedule">Schedule</Link>
              <Link href="/#venue">Venue</Link>
              <Link href="/#faq">FAQ</Link>
              {user ? <Link href="/me">My registration</Link> : <Link href="/login">Sign in</Link>}
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
