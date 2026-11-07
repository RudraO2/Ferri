import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { GatewayClient } from "./ferri";
import { seal, unseal, type DeskUser } from "./seal";

export { seal, unseal, type DeskUser };

/**
 * Desk signs people in with their Switch account. The session cookie is
 * encrypted (AES-256-GCM, lib/seal.ts) and holds the person's Switch Gateway session, so
 * Desk can act in Switch as them, for example to answer a card.
 */
export const COOKIE = "ferri_desk";
const MAX_AGE_S = 12 * 60 * 60;

export async function currentUser(): Promise<DeskUser | null> {
  return unseal((await cookies()).get(COOKIE)?.value);
}

/** For pages and actions: the signed-in person, or a redirect to the sign-in page. */
export async function requireUser(): Promise<DeskUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** For Pocket pages and actions: the signed-in person, or Pocket's sign-in page. */
export async function requirePocketUser(next?: string): Promise<DeskUser> {
  const user = await currentUser();
  if (!user) redirect(next ? `/m/login?next=${encodeURIComponent(next)}` : "/m/login");
  return user;
}

export async function startSession(user: Omit<DeskUser, "exp">): Promise<void> {
  (await cookies()).set(COOKIE, seal({ ...user, exp: Date.now() + MAX_AGE_S * 1000 }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export const switchUrl = () => process.env.SWITCH_URL ?? "http://localhost:8000";

/** A Gateway client acting as the signed-in person. */
export function gatewayAs(user: DeskUser): GatewayClient {
  return GatewayClient.withSession(switchUrl(), user.gw);
}
