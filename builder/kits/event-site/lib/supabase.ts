import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const url = () => need("NEXT_PUBLIC_SUPABASE_URL");
const publicKey = () => need("NEXT_PUBLIC_SUPABASE_ANON_KEY");

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

/** Supabase as the signed-in person (their session cookie). Row level security applies. */
export async function userClient(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(url(), publicKey(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // A server component cannot set cookies; the next action or route will.
        }
      },
    },
  });
}

/** Supabase with the secret key, for the server only (admin pages, creating accounts). */
export function adminClient(): SupabaseClient {
  return createClient(url(), need("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function currentUser(): Promise<User | null> {
  try {
    const { data } = await (await userClient()).auth.getUser();
    return data.user ?? null;
  } catch {
    return null;
  }
}

/** Admins are the crew emails in ADMIN_EMAILS (comma separated). */
export function isAdmin(user: User | null): boolean {
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return !!user?.email && list.includes(user.email.toLowerCase());
}
