import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { GatewayClient } from "./ferri";

/**
 * Desk signs people in with their Switch account. The session cookie is
 * encrypted (AES-256-GCM) and holds the person's Switch Gateway session, so
 * Desk can act in Switch as them, for example to answer a card.
 */
export const COOKIE = "ferri_desk";
const MAX_AGE_S = 12 * 60 * 60;

export interface DeskUser {
  /** Switch user id. */
  uid: string;
  email: string;
  name: string;
  /** The Switch Gateway session cookie. */
  gw: string;
  exp: number;
}

function key(): Buffer {
  const secret = process.env.DESK_SESSION_SECRET || process.env.FERRI_AGENT_KEY;
  if (!secret) throw new Error("Set DESK_SESSION_SECRET in .env (run `pnpm setup:switch`).");
  return createHash("sha256").update(`ferri-desk-session:${secret}`).digest();
}

export function seal(user: DeskUser): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(user), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function unseal(token: string | undefined): DeskUser | null {
  if (!token) return null;
  try {
    const raw = Buffer.from(token, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    const user = JSON.parse(json) as DeskUser;
    return user.exp > Date.now() ? user : null;
  } catch {
    return null;
  }
}

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
