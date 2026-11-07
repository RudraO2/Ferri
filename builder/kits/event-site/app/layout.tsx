import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { event } from "@/lib/event";
import { accent, accentVars, hasLook, look } from "@/lib/look";
import { currentUser, isAdmin } from "@/lib/supabase";
import { signOut } from "./actions";
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

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: `${event.name} · ${event.dates}`,
  description: event.tagline,
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
  return (
    <html lang="en" data-look={hasLook ? "poster" : undefined} style={accentVars(accent)}>
      {look.css ? (
        <head>
          {/* The poster's fonts and font variables, written by scripts/poster-look.mjs. */}
          <style dangerouslySetInnerHTML={{ __html: look.css }} />
        </head>
      ) : null}
      <body>
        <header className="top">
          <div className="wrap row">
            <Link href="/" className="brand">
              {hasLook && look.logo ? <img src={look.logo} alt="" width={28} height={28} /> : null}
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
