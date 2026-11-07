import { NextResponse, type NextRequest } from "next/server";
import { unseal } from "./lib/seal";

/**
 * Sends anyone without a session cookie to the sign-in page (Pocket's own for
 * /m). The cookie itself is checked (decrypted, expiry) on the server by every
 * page and action.
 *
 * A read-only guest (the public demo's "Look around") may open every page but
 * change nothing: every request that is not a plain read (server actions are
 * POSTs) is refused here, before any action runs.
 */
export function proxy(request: NextRequest) {
  const cookie = request.cookies.get("ferri_desk");
  if (!cookie) {
    const pocket = request.nextUrl.pathname === "/m" || request.nextUrl.pathname.startsWith("/m/");
    // Signed out, Desk's home is the public landing page (spec 24).
    const to = new URL(pocket ? "/m/login" : request.nextUrl.pathname === "/" ? "/welcome" : "/login", request.url);
    if (pocket && request.nextUrl.pathname !== "/m") to.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(to);
  }
  if (request.method !== "GET" && request.method !== "HEAD" && unseal(cookie.value)?.readonly) {
    return new NextResponse("This is a read-only guest view of Ferri's demo. Nothing can be changed here.", {
      status: 403,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return NextResponse.next();
}

export const config = {
  // Pocket's sign-in, service worker, manifest and icons load without a session,
  // guests' own RSVP pages (/rsvp/<code>, spec 17), the public landing page and the
  // character art and design system (/welcome, /brand, /design; spec 24), and the
  // public site's other pages (/product, /use-cases, /switch, /start), and /demo, the public
  // demo's direct link into the read-only guest view.
  matcher: ["/((?!login|demo|api/site|api/email|rsvp/|welcome|product|use-cases|switch|start|design|brand/|site/|m/login|m/sw\\.js|m/manifest\\.webmanifest|m/icon|m/splash|_next/|favicon.ico).*)"],
};
