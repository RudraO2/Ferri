"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { event } from "@/lib/event";
import { tellFerri } from "@/lib/ferri";
import { cancel, countOf, type Profile, rejoin, saveRegistration, type Status, waitlistNumber } from "@/lib/rsvp";
import { adminClient, currentUser, isAdmin, userClient } from "@/lib/supabase";

const str = (f: FormData, k: string, max = 500) =>
  String(f.get(k) ?? "")
    .trim()
    .slice(0, max);
const go = (path: string, msg: string): never => redirect(`${path}?msg=${encodeURIComponent(msg)}`);

/** Real email (spec 15): Supabase sends sign-in links and confirmations through the community's SMTP. */
const emailOn = () => process.env.SITE_EMAIL === "on";

/** This site's own address, for the links in emails. */
async function origin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Email a sign-in link to someone who already has an account. */
async function sendLink(email: string): Promise<string | null> {
  const { error } = await (await userClient()).auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${await origin()}/auth/confirm?next=/me` },
  });
  if (error) console.error(`sign-in link for ${email}: ${error.message}`);
  return error ? error.message : null;
}

const ROLES = ["student", "professional", "designer", "other"];
const TEAM = ["have_team", "looking", "solo"];

/** One plain sentence on where someone stands after registering. */
async function standing(userId: string, status: Status): Promise<string> {
  if (status === "going") return "You're registered. See you there!";
  if (status === "waitlist") {
    const n = await waitlistNumber(userId);
    return `The event is full, so you're on the waitlist${n ? ` (number ${n})` : ""}. We'll email you if a spot opens.`;
  }
  return "Your details are saved. You freed your spot earlier: you can register again on your page.";
}

/** Save the registration on the server and tell Ferri about a new one. */
async function join(userId: string, profile: Profile): Promise<Status> {
  let saved: { status: Status; created: boolean } | null = null;
  let failed = "";
  try {
    saved = await saveRegistration(userId, profile);
  } catch (err) {
    failed = (err as Error).message;
  }
  if (!saved) return go("/register", `Could not save your registration: ${failed}`);
  // A new registration only: an edit (or a second click) tells the crew nothing.
  if (saved.created) {
    const count = await countOf().catch(() => 0);
    await tellFerri({ type: "registration", id: userId, email: profile.email, name: profile.name, status: saved.status, count });
  }
  return saved.status;
}

// ── Participants ─────────────────────────────────────────────────────────

/**
 * Create the account and the registration. With email on, the account waits
 * for its email to be confirmed: a link goes to the address, and opening it
 * signs the person in. Without email, the account is confirmed at once.
 */
export async function register(form: FormData) {
  const name = str(form, "name", 120);
  const email = str(form, "email", 200).toLowerCase();
  const password = String(form.get("password") ?? "");
  const role = str(form, "role");
  const teamStatus = str(form, "team_status");
  const teamName = str(form, "team_name", 80) || null;
  const dietary = str(form, "dietary", 200) || null;
  const consent = form.get("consent") === "on";
  const profile = (address: string): Profile => ({
    name,
    email: address,
    role,
    team_status: teamStatus,
    team_name: teamStatus === "have_team" ? teamName : null,
    dietary,
    consent,
  });
  let user = await currentUser();

  if (!name) go("/register", "Tell us your name.");
  if (!ROLES.includes(role) || !TEAM.includes(teamStatus)) go("/register", "Pick your role and team status.");
  if (!consent) go("/register", "Please agree to the rules and the code of conduct.");

  if (!user) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) go("/register", "That email does not look right.");
    if (password.length < 8) go("/register", "Use a password of at least 8 characters.");
    const created = await adminClient().auth.admin.createUser({ email, password, email_confirm: !emailOn(), user_metadata: { name } });
    if (created.error) {
      const taken = /already|registered|exists/i.test(created.error.message);
      go(taken ? "/login" : "/register", taken ? "You already have an account. Sign in to finish." : created.error.message);
    }
    if (emailOn()) {
      const id = created.data.user!.id;
      const status = await join(id, profile(email));
      const failed = await sendLink(email);
      if (!failed) go("/login", `${await standing(id, status)} We sent a link to ${email}: open it to confirm your email and sign in.`);
      // The email did not go out: confirm the account here, so nobody is stuck.
      await adminClient().auth.admin.updateUserById(created.data.user!.id, { email_confirm: true });
    }
    const signed = await (await userClient()).auth.signInWithPassword({ email, password });
    if (signed.error) go("/login", "Your account is ready. Sign in to finish registering.");
    user = signed.data.user;
  }

  // The server writes the row with the secret key, for the signed-in person only.
  const status = await join(user!.id, profile(user!.email ?? email));
  revalidatePath("/me");
  go("/me", await standing(user!.id, status));
}

/** Free my spot (or leave the waitlist). The spot goes back to the crew and Ferri. */
export async function freeSpot() {
  const user = await currentUser();
  if (!user) return go("/login", "Sign in first.");
  let done: Awaited<ReturnType<typeof cancel>> = null;
  let failed = "";
  try {
    done = await cancel(user.id);
  } catch (err) {
    failed = (err as Error).message;
  }
  if (failed) go("/me", `That did not work just now: ${failed}`);
  if (!done) go("/me", "There was no spot to free.");
  const count = await countOf("going").catch(() => 0);
  await tellFerri({ type: "cancelled", id: user.id, email: done!.email, name: done!.name, count });
  revalidatePath("/me");
  go("/me", done!.was === "waitlist" ? "You left the waitlist." : "Done. Your spot is free for someone else. Thanks for telling us.");
}

/** Someone who freed their spot registers again: a spot if there is room, else the waitlist. */
export async function registerAgain() {
  const user = await currentUser();
  if (!user) return go("/login", "Sign in first.");
  if (!event.registration.open) go("/me", "Registration is closed.");
  let back: Awaited<ReturnType<typeof rejoin>> = null;
  let failed = "";
  try {
    back = await rejoin(user.id);
  } catch (err) {
    failed = (err as Error).message;
  }
  if (failed) go("/me", `That did not work just now: ${failed}`);
  if (!back) go("/me", "You are already on the list.");
  await tellFerri({ type: "status", id: user.id, email: back!.email, name: back!.name, status: back!.status });
  revalidatePath("/me");
  go("/me", back!.status === "going" ? "You're going again. See you there!" : await standing(user.id, back!.status));
}

export async function signIn(form: FormData) {
  const email = str(form, "email", 200).toLowerCase();
  const password = String(form.get("password") ?? "");
  const { error } = await (await userClient()).auth.signInWithPassword({ email, password });
  if (error && /not confirmed/i.test(error.message)) {
    const failed = await sendLink(email);
    go("/login", failed ? "Confirm your email first; the link could not be sent just now. Try again in a minute." : `Confirm your email first: we sent a new link to ${email}.`);
  }
  if (error) go("/login", "That email and password do not match.");
  redirect("/me");
}

/** Sign in without a password: a link by email (only for people who have an account). */
export async function magicLink(form: FormData) {
  const email = str(form, "email", 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) go("/login", "That email does not look right.");
  if (!emailOn()) go("/login", "Sign in with your password.");
  const failed = await sendLink(email);
  // The same answer whether or not there is an account, so the form tells nobody who registered.
  if (failed && !/not found|signups not allowed|no user/i.test(failed)) go("/login", "The link could not be sent just now. Try again in a minute.");
  go("/login", `If ${email} is registered, a sign-in link is on its way.`);
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
