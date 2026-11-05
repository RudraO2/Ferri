import { NextResponse, type NextRequest } from "next/server";

/**
 * Sends anyone without a session cookie to the sign-in page. The cookie itself
 * is checked (decrypted, expiry) on the server by every page and action.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.get("ferri_desk")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|_next/|favicon.ico).*)"],
};
