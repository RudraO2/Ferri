import { NextResponse, type NextRequest } from "next/server";

/** Leave Desk with a plain link (the read-only guest view cannot run the sign-out action). */
export function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", request.url));
  res.cookies.delete("ferri_desk");
  return res;
}
