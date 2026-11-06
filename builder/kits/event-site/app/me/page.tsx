import Link from "next/link";
import { redirect } from "next/navigation";
import { event } from "@/lib/event";
import { waitlistNumber } from "@/lib/rsvp";
import { currentUser, userClient } from "@/lib/supabase";
import { claim, freeSpot, registerAgain } from "../actions";
import { Msg } from "../msg";

const ROLE: Record<string, string> = { student: "Student", professional: "Working developer", designer: "Designer or product", other: "Other" };
const TEAM: Record<string, string> = { have_team: "Has a team", looking: "Looking for a team", solo: "Building alone" };

export default async function Me({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const user = await currentUser();
  if (!user) redirect("/login");
  const db = await userClient();
  const [{ data: reg }, { data: sponsors }, { data: codes }] = await Promise.all([
    db.from("registrations").select("*").eq("user_id", user.id).maybeSingle(),
    db.from("sponsors").select("id, name, offer").order("name"),
    db.from("sponsor_codes").select("sponsor_id, code, claimed_at").eq("claimed_by", user.id).is("revoked_at", null),
  ]);
  const mine = new Map((codes ?? []).map((c) => [c.sponsor_id as string, c as { code: string; claimed_at: string }]));
  const status: string = reg?.status ?? "going";
  const going = !!reg && status === "going";
  const place = reg && status === "waitlist" ? await waitlistNumber(user.id).catch(() => null) : null;

  return (
    <div className="wrap page">
      <h1>My registration</h1>
      <Msg msg={msg} />
      {reg ? (
        <div className="card">
          {status === "waitlist" ? (
            <p>
              <span className="pill warn">You&apos;re on the waitlist{place ? ` (number ${place})` : ""}</span> for <b>{event.name}</b>, {event.dates}. We&apos;ll
              email you if a spot opens.
            </p>
          ) : status === "cancelled" ? (
            <p>
              <span className="pill">You freed your spot</span> at <b>{event.name}</b>. Thanks for making room for someone else.
            </p>
          ) : (
            <p>
              <span className="pill ok">You&apos;re going</span> to <b>{event.name}</b>, {event.dates}.
            </p>
          )}
          <table>
            <tbody>
              <tr>
                <th>Name</th>
                <td>{reg.name}</td>
              </tr>
              <tr>
                <th>Email</th>
                <td>{reg.email}</td>
              </tr>
              <tr>
                <th>You are</th>
                <td>{ROLE[reg.role] ?? reg.role}</td>
              </tr>
              <tr>
                <th>Team</th>
                <td>
                  {TEAM[reg.team_status] ?? reg.team_status}
                  {reg.team_name ? `: ${reg.team_name}` : ""}
                </td>
              </tr>
              {reg.dietary ? (
                <tr>
                  <th>Food needs</th>
                  <td>{reg.dietary}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {status === "cancelled" ? (
            event.registration.open ? (
              <form action={registerAgain} className="stack" style={{ marginTop: 16 }}>
                <p className="muted" style={{ margin: 0 }}>
                  Can you come after all? You get a spot if there is room, otherwise a place on the waitlist.
                </p>
                <div>
                  <button className="btn">Register again</button>
                </div>
              </form>
            ) : (
              <p className="muted" style={{ marginTop: 16 }}>
                Registration is closed.
              </p>
            )
          ) : (
            <details className="confirm">
              <summary className="btn ghost">{going ? "Free my spot" : "Leave the waitlist"}</summary>
              <div className="confirm-body">
                <p>
                  {going
                    ? "Can't come after all? Your spot goes to someone on the waitlist. You can register again later if there is room."
                    : "You lose your place on the waitlist. You can register again later."}
                </p>
                <form action={freeSpot}>
                  <button className="btn danger">{going ? "Yes, free my spot" : "Yes, leave the waitlist"}</button>
                </form>
              </div>
            </details>
          )}
        </div>
      ) : (
        <div className="card">
          <p>You have an account but you are not registered yet.</p>
          <Link className="btn" href="/register">
            Finish registering
          </Link>
        </div>
      )}

      <h2 style={{ marginTop: 36 }}>Sponsor credits</h2>
      {reg && !going && sponsors?.length ? <p className="muted">Sponsor credits are for people with a spot.</p> : null}
      {sponsors?.length ? (
        <div className="grid2">
          {sponsors.map((s) => {
            const got = mine.get(s.id);
            return (
              <div className="card" key={s.id}>
                <h3>{s.name}</h3>
                {s.offer ? <p className="muted">{s.offer}</p> : null}
                {got ? (
                  <>
                    <div className="code">{got.code}</div>
                    <p className="muted" style={{ marginTop: 8 }}>
                      Yours alone. Do not share it.
                    </p>
                  </>
                ) : (
                  <form action={claim}>
                    <input type="hidden" name="sponsor" value={s.id} />
                    <button className="btn" disabled={!going}>
                      Claim my code
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="muted">No sponsor credits yet. Check back closer to the event.</p>
      )}
    </div>
  );
}
