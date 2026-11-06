import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { userClient } from "@/lib/supabase";

/**
 * Where the links in Supabase's emails land (spec 15): a sign-in link or an
 * email confirmation. `code` is the PKCE flow (the default for @supabase/ssr),
 * `token_hash` the email template flow. Either signs the person in.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const next = url.searchParams.get("next")?.startsWith("/") ? url.searchParams.get("next")! : "/me";
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = (url.searchParams.get("type") ?? "email") as EmailOtpType;
  const db = await userClient();
  const { error } = code ? await db.auth.exchangeCodeForSession(code) : tokenHash ? await db.auth.verifyOtp({ type, token_hash: tokenHash }) : { error: new Error("no code") };
  if (error) console.error(`auth confirm: ${error.message}`);
  const to = new URL(error ? "/login" : next, url.origin);
  to.searchParams.set("msg", error ? "That link has expired or was already used. Ask for a new one below." : "You're signed in, and your email is confirmed.");
  return NextResponse.redirect(to);
}
