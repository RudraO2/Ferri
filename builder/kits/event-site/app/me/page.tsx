import Link from "next/link";
import { redirect } from "next/navigation";
import { event } from "@/lib/event";
import { currentUser, userClient } from "@/lib/supabase";
import { claim } from "../actions";
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

  return (
    <div className="wrap page">
      <h1>My registration</h1>
      <Msg msg={msg} />
      {reg ? (
        <div className="card">
          <p>
            <span className="pill ok">Registered</span> for <b>{event.name}</b>, {event.dates}.
          </p>
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
                    <button className="btn" disabled={!reg}>
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
