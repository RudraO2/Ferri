import Link from "next/link";
import { redirect } from "next/navigation";
import { capacity, event } from "@/lib/event";
import { isFull } from "@/lib/rsvp";
import { currentUser, userClient } from "@/lib/supabase";
import { register } from "../actions";
import { Msg } from "../msg";

export default async function Register({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const user = await currentUser();
  if (user) {
    const { data } = await (await userClient()).from("registrations").select("user_id").eq("user_id", user.id).maybeSingle();
    if (data) redirect("/me");
  }
  if (!event.registration.open) {
    return (
      <div className="wrap page">
        <h1>Registration is closed</h1>
        <p className="muted">{event.registration.note ?? "Follow the community channels for the next event."}</p>
      </div>
    );
  }
  // Unknown (the database did not answer): register as usual; the server decides the status.
  const full = await isFull().catch(() => false);
  return (
    <div className="wrap page">
      <h1>Register for {event.name}</h1>
      <p className="muted">
        {event.dates} · {event.venue.name}. {event.registration.closes ? `Registration closes ${event.registration.closes}.` : ""}
      </p>
      {full ? (
        <p className="msg" role="status">
          Every spot is taken right now. Register to join the waitlist, and we&apos;ll email you if a spot opens.
        </p>
      ) : capacity !== null ? (
        <p className="muted">There are {capacity} spots. When they are gone, new registrations join a waitlist.</p>
      ) : null}
      <Msg msg={msg} />
      <form action={register} className="stack">
        <label>
          Your name
          <input name="name" autoComplete="name" required maxLength={120} />
        </label>
        {user ? (
          <p className="muted">Signed in as {user.email}.</p>
        ) : (
          <>
            <label>
              Email
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              Password (to sign in later)
              <input name="password" type="password" autoComplete="new-password" minLength={8} required />
            </label>
          </>
        )}
        <label>
          You are
          <select name="role" required defaultValue="">
            <option value="" disabled>
              Pick one
            </option>
            <option value="student">A student</option>
            <option value="professional">A working developer</option>
            <option value="designer">A designer or product person</option>
            <option value="other">Something else</option>
          </select>
        </label>
        <label>
          Team
          <select name="team_status" required defaultValue="">
            <option value="" disabled>
              Pick one
            </option>
            <option value="have_team">I have a team</option>
            <option value="looking">I'm looking for a team</option>
            <option value="solo">I'll build alone</option>
          </select>
        </label>
        <label>
          Team name (if you have one)
          <input name="team_name" maxLength={80} />
        </label>
        <label>
          Food needs or allergies
          <input name="dietary" maxLength={200} placeholder="vegetarian, nut allergy, ..." />
        </label>
        <label className="check">
          <input type="checkbox" name="consent" required />
          <span>I agree to the event rules and the code of conduct, and that the organizers may contact me about this event.</span>
        </label>
        <button className="btn">{full ? "Join the waitlist" : "Register"}</button>
        {!user ? (
          <p className="muted">
            Already have an account? <Link href="/login">Sign in</Link>.
          </p>
        ) : null}
      </form>
    </div>
  );
}
