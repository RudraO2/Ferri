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
  redirect("/");
}

export async function signOut(): Promise<void> {
  await endSession();
  redirect("/login");
}
