"use server";

import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { guests } from "@/lib/ferri";
import { RSVP_CHOICES, cleanCode, rsvpGuest, rsvpState, type RsvpAnswer } from "@/lib/rsvp";

/**
 * A guest's answer on their RSVP page. Public (the code is the guest's key),
 * so it only records the answer; Ferri's tick applies it (statuses, the
 * waitlist, telling the crew). An answer the page no longer offers (the
 * offer ran out, Ferri moved them meanwhile) records nothing.
 */
export async function answerRsvp(form: FormData) {
  const code = cleanCode(String(form.get("code") ?? ""));
  if (!code) notFound();
  const row = await rsvpGuest(code);
  if (!row) notFound();
  const answer = String(form.get("answer") ?? "") as RsvpAnswer;
  const state = rsvpState(row.guest);
  if (!RSVP_CHOICES[state].includes(answer)) redirect(`/rsvp/${code}?changed=1`);
  await db().update(guests).set({ rsvpAnswer: answer, rsvpAt: new Date(), rsvpHandledAt: null }).where(eq(guests.code, code));
  redirect(`/rsvp/${code}?done=${answer}&was=${state}`);
}
