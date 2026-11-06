"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { tellFerri } from "@/lib/ferri";
import { adminClient, currentUser, isAdmin, userClient } from "@/lib/supabase";

const str = (f: FormData, k: string, max = 500) =>
  String(f.get(k) ?? "")
    .trim()
    .slice(0, max);
const go = (path: string, msg: string): never => redirect(`${path}?msg=${encodeURIComponent(msg)}`);

const ROLES = ["student", "professional", "designer", "other"];
const TEAM = ["have_team", "looking", "solo"];

// ── Participants ─────────────────────────────────────────────────────────

/** Create the account (already confirmed: no email is sent) and the registration, then sign in. */
export async function register(form: FormData) {
  const name = str(form, "name", 120);
  const email = str(form, "email", 200).toLowerCase();
  const password = String(form.get("password") ?? "");
  const role = str(form, "role");
  const teamStatus = str(form, "team_status");
  const teamName = str(form, "team_name", 80) || null;
  const dietary = str(form, "dietary", 200) || null;
  const consent = form.get("consent") === "on";
  let user = await currentUser();

  if (!name) go("/register", "Tell us your name.");
  if (!ROLES.includes(role) || !TEAM.includes(teamStatus)) go("/register", "Pick your role and team status.");
  if (!consent) go("/register", "Please agree to the rules and the code of conduct.");

  if (!user) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) go("/register", "That email does not look right.");
    if (password.length < 8) go("/register", "Use a password of at least 8 characters.");
    const created = await adminClient().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
    if (created.error) {
      const taken = /already|registered|exists/i.test(created.error.message);
      go(taken ? "/login" : "/register", taken ? "You already have an account. Sign in to finish." : created.error.message);
    }
    const signed = await (await userClient()).auth.signInWithPassword({ email, password });
    if (signed.error) go("/login", "Your account is ready. Sign in to finish registering.");
    user = signed.data.user;
  }

  const db = await userClient();
  const { data: before } = await db.from("registrations").select("user_id").eq("user_id", user!.id).maybeSingle();
  const { error } = await db.from("registrations").upsert({
    user_id: user!.id,
    name,
    email: user!.email ?? email,
    role,
    team_status: teamStatus,
    team_name: teamStatus === "have_team" ? teamName : null,
    dietary,
    consent,
  });
  if (error) go("/register", `Could not save your registration: ${error.message}`);

  // A new registration only: an edit (or a second click) tells the crew nothing.
  if (!before) {
    const { count } = await adminClient().from("registrations").select("*", { count: "exact", head: true });
    await tellFerri({ type: "registration", count: count ?? 0, name });
  }
  revalidatePath("/me");
  go("/me", "You're registered. See you there!");
}

export async function signIn(form: FormData) {
  const email = str(form, "email", 200).toLowerCase();
  const password = String(form.get("password") ?? "");
  const { error } = await (await userClient()).auth.signInWithPassword({ email, password });
  if (error) go("/login", "That email and password do not match.");
  redirect("/me");
}

export async function signOut() {
  await (await userClient()).auth.signOut();
  redirect("/");
}

/** Claim one code from a sponsor's pool. The database call is atomic: one code per person per sponsor. */
export async function claim(form: FormData) {
  const sponsorId = str(form, "sponsor");
  const db = await userClient();
  const { data, error } = await db.rpc("claim_code", { p_sponsor: sponsorId });
  if (error) go("/me", error.message);
  const row = (data as { code: string; left_count: number; low_at: number; already: boolean }[])[0];
  if (row && !row.already && row.left_count <= row.low_at) {
    // Once per sponsor until the pool is refilled.
    const admin = adminClient();
    const { data: flipped } = await admin.from("sponsors").update({ low_alerted: true }).eq("id", sponsorId).eq("low_alerted", false).select("name");
    const s = flipped?.[0];
    if (s) await tellFerri({ type: "pool_low", sponsor: s.name, left: row.left_count, lowAt: row.low_at });
  }
  revalidatePath("/me");
  go("/me", row?.already ? "You already have a code from this sponsor." : "Here is your code. It is yours alone.");
}

// ── Admin ────────────────────────────────────────────────────────────────

async function requireAdmin(): Promise<string> {
  const user = await currentUser();
  if (!isAdmin(user)) go("/login", "Sign in with an organizer account.");
  return user!.email!;
}

export async function addSponsor(form: FormData) {
  const by = await requireAdmin();
  const name = str(form, "name", 80);
  if (!name) go("/admin", "Give the sponsor a name.");
  const lowAt = Math.max(0, Number(str(form, "low_at")) || 5);
  const { error } = await adminClient().from("sponsors").insert({ name, offer: str(form, "offer", 300), low_at: lowAt });
  if (error) go("/admin", error.message.includes("duplicate") ? "That sponsor is already there." : error.message);
  console.log(`sponsor ${name} added by ${by}`);
  revalidatePath("/admin");
  go("/admin", `Added ${name}. Paste its codes next.`);
}

/** Paste codes, one per line (or separated by commas). Duplicates are skipped. */
export async function addCodes(form: FormData) {
  const by = await requireAdmin();
  const sponsorId = str(form, "sponsor");
  const codes = [...new Set(String(form.get("codes") ?? "").split(/[\s,;]+/).map((c) => c.trim()).filter(Boolean))].slice(0, 5000);
  if (!codes.length) go("/admin", "Paste at least one code.");
  const admin = adminClient();
  const { data, error } = await admin
    .from("sponsor_codes")
    .upsert(codes.map((code) => ({ sponsor_id: sponsorId, code })), { onConflict: "sponsor_id,code", ignoreDuplicates: true })
    .select("id");
  if (error) go("/admin", error.message);
  const added = data?.length ?? 0;
  await admin.from("claim_log").insert({ sponsor_id: sponsorId, action: "add", by_email: by, note: `${added} code(s)` });
  // Refilled above the threshold: the next low pool is news again.
  const { data: s } = await admin.from("sponsors").select("name, low_at, low_alerted").eq("id", sponsorId).single();
  const { count } = await admin.from("sponsor_codes").select("*", { count: "exact", head: true }).eq("sponsor_id", sponsorId).is("claimed_by", null).is("revoked_at", null);
  if (s?.low_alerted && (count ?? 0) > s.low_at) {
    await admin.from("sponsors").update({ low_alerted: false }).eq("id", sponsorId);
    await tellFerri({ type: "pool_refilled", sponsor: s.name, left: count ?? 0 });
  }
  revalidatePath("/admin");
  go("/admin", `Added ${added} new code(s)${added < codes.length ? `, skipped ${codes.length - added} already there` : ""}.`);
}

/** Take a code back from its holder. The code is burnt; they may claim another. */
export async function revoke(form: FormData) {
  const by = await requireAdmin();
  const id = str(form, "code");
  const admin = adminClient();
  const { data, error } = await admin.from("sponsor_codes").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("revoked_at", null).select("sponsor_id, claimed_by");
  if (error) go("/admin", error.message);
  const row = data?.[0];
  if (row) await admin.from("claim_log").insert({ sponsor_id: row.sponsor_id, code_id: id, user_id: row.claimed_by, action: "revoke", by_email: by });
  revalidatePath("/admin");
  go("/admin", row ? "Revoked. That person can claim a new code." : "That code was already revoked.");
}

export async function setLowAt(form: FormData) {
  await requireAdmin();
  const lowAt = Math.max(0, Number(str(form, "low_at")) || 0);
  await adminClient().from("sponsors").update({ low_at: lowAt }).eq("id", str(form, "sponsor"));
  revalidatePath("/admin");
  go("/admin", `The crew hears about it at ${lowAt} code(s) left.`);
}
