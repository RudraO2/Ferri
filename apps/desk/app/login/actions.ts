"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { GatewayClient, deskUsers } from "@/lib/ferri";
import { endSession, startSession, switchUrl } from "@/lib/session";

export async function signIn(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your Switch email and password." };

  const gateway = new GatewayClient(switchUrl(), email, password);
  let me;
  try {
    await gateway.login();
    me = await gateway.me();
  } catch {
    return { error: "Switch did not accept that email and password." };
  }
  // Remembered so that a card answered from Desk shows this person's name.
  await db()
    .insert(deskUsers)
    .values({ switchUserId: me.id, email: me.email, name: me.name || me.email })
    .onConflictDoUpdate({ target: deskUsers.switchUserId, set: { email: me.email, name: me.name || me.email, lastLoginAt: new Date() } });
  await startSession({ uid: me.id, email: me.email, name: me.name || me.email, gw: gateway.session });
  // Pocket signs in here too and goes back to the Pocket page it came from.
  const next = String(form.get("next") ?? "/");
  redirect(next === "/m" || /^\/m\/[A-Za-z0-9/_-]*$/.test(next) ? next : "/");
}

/**
 * The public demo's guest view (DESK_GUEST_VIEW=on): a read-only session that reads through the
 * Switch admin's Gateway session. proxy.ts refuses every change (any non-GET request) for it.
 */
export async function viewAsGuest(): Promise<void> {
  if (process.env.DESK_GUEST_VIEW !== "on") redirect("/login");
  const email = process.env.SWITCH_ADMIN_EMAIL || "admin@switch.local";
  const password = process.env.SWITCH_ADMIN_PASSWORD || process.env.GATEWAY_ADMIN_PASSWORD;
  if (!password) redirect("/login");
  const gateway = new GatewayClient(switchUrl(), email, password);
  await gateway.login();
  const me = await gateway.me();
  await startSession({ uid: me.id, email: "guest", name: "Guest (read-only)", gw: gateway.session, readonly: true });
  redirect("/");
}

export async function signOut(form?: FormData): Promise<void> {
  await endSession();
  redirect(form?.get("next") === "/m" ? "/m/login" : "/login");
}
