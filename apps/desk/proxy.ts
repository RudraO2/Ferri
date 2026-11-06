import { NextResponse, type NextRequest } from "next/server";

/**
 * Sends anyone without a session cookie to the sign-in page (Pocket's own for
 * /m). The cookie itself is checked (decrypted, expiry) on the server by every
 * page and action.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.get("ferri_desk")) {
    const pocket = request.nextUrl.pathname === "/m" || request.nextUrl.pathname.startsWith("/m/");
    const to = new URL(pocket ? "/m/login" : "/login", request.url);
    if (pocket && request.nextUrl.pathname !== "/m") to.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(to);
  }
  return NextResponse.next();
}

export const config = {
  // Pocket's sign-in, service worker, manifest and icons load without a session.
  matcher: ["/((?!login|api/site|m/login|m/sw\.js|m/manifest\.webmanifest|m/icon|_next/|favicon.ico).*)"],
};
