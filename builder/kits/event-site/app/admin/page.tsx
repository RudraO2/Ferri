import { redirect } from "next/navigation";
import { capacity, event } from "@/lib/event";
import { counts, waitlistOrder } from "@/lib/rsvp";
import { adminClient, currentUser, isAdmin } from "@/lib/supabase";
import { addCodes, addSponsor, revoke, setLowAt } from "../actions";
import { Msg } from "../msg";

interface Reg {
  user_id: string;
  name: string;
  email: string;
  role: string;
  team_status: string;
  team_name: string | null;
  dietary: string | null;
  status: "going" | "waitlist" | "cancelled";
  created_at: string;
}
interface Code {
  id: string;
  sponsor_id: string;
  code: string;
  claimed_by: string | null;
  claimed_at: string | null;
  revoked_at: string | null;
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "");

export default async function Admin({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const user = await currentUser();
  if (!isAdmin(user)) redirect("/login?msg=" + encodeURIComponent("Sign in with an organizer account."));
  const db = adminClient();
  const [{ data: regs }, { data: sponsors }, { data: codes }, { data: log }, tally, queue] = await Promise.all([
    db.from("registrations").select("*").order("created_at", { ascending: false }).limit(1000),
    db.from("sponsors").select("*").order("name"),
    db.from("sponsor_codes").select("*").limit(10000),
    db.from("claim_log").select("*").order("at", { ascending: false }).limit(30),
    counts(),
    waitlistOrder(),
  ]);
  const people = new Map((regs as Reg[] | null ?? []).map((r) => [r.user_id, r]));
  const all = (codes as Code[] | null) ?? [];
  const byRole = (regs as Reg[] | null ?? []).reduce<Record<string, number>>((m, r) => ((m[r.role] = (m[r.role] ?? 0) + 1), m), {});
  const looking = (regs as Reg[] | null ?? []).filter((r) => r.team_status === "looking" && r.status !== "cancelled").length;
  const place = new Map(queue.map((id, i) => [id, i + 1]));

  return (
    <div className="wrap page">
      <h1>Admin</h1>
      <p className="muted">{event.name} · signed in as {user!.email}</p>
      <Msg msg={msg} />

      <div className="stats">
        <div className="card">
          <b>{tally.going}</b>going{capacity !== null ? ` of ${capacity} spots` : ""}
        </div>
        <div className="card">
          <b>{tally.waitlist}</b>on the waitlist
        </div>
        <div className="card">
          <b>{tally.cancelled}</b>freed their spot
        </div>
        <div className="card">
          <b>{looking}</b>looking for a team
        </div>
        <div className="card">
          <b>{all.filter((c) => c.claimed_by && !c.revoked_at).length}</b>codes claimed
        </div>
        <div className="card">
          <b>{all.filter((c) => !c.claimed_by && !c.revoked_at).length}</b>codes left
        </div>
      </div>

      <h2>Sponsor credits</h2>
      <div className="grid2">
        {(sponsors ?? []).map((s) => {
          const mine = all.filter((c) => c.sponsor_id === s.id);
          const left = mine.filter((c) => !c.claimed_by && !c.revoked_at).length;
          const claimed = mine.filter((c) => c.claimed_by && !c.revoked_at);
          return (
            <div className="card" key={s.id}>
              <h3>
                {s.name} <span className={`pill ${left <= s.low_at ? "warn" : "ok"}`}>{left} left</span>
              </h3>
              {s.offer ? <p className="muted">{s.offer}</p> : null}
              <form action={addCodes} className="stack" style={{ marginBottom: 12 }}>
                <input type="hidden" name="sponsor" value={s.id} />
                <label>
                  Paste codes (one per line)
                  <textarea name="codes" rows={3} />
                </label>
                <button className="btn ghost">Add codes</button>
              </form>
              <form action={setLowAt} className="row gap" style={{ justifyContent: "flex-start", marginBottom: 12 }}>
                <input type="hidden" name="sponsor" value={s.id} />
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
                  Tell the crew at
                  <input name="low_at" type="number" min={0} defaultValue={s.low_at} style={{ width: 80 }} />
                  left
                </label>
                <button className="link">Save</button>
              </form>
              {claimed.length ? (
                <table>
                  <thead>
                    <tr>
                      <th>Claimed by</th>
                      <th>Code</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {claimed.map((c) => (
                      <tr key={c.id}>
                        <td>
                          {people.get(c.claimed_by!)?.name ?? "someone"}
                          <div className="muted">{when(c.claimed_at)}</div>
                        </td>
                        <td>
                          <code>{c.code}</code>
                        </td>
                        <td>
                          <form action={revoke}>
                            <input type="hidden" name="code" value={c.id} />
                            <button className="link">Revoke</button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted">Nobody has claimed one yet.</p>
              )}
            </div>
          );
        })}
        <div className="card">
          <h3>Add a sponsor</h3>
          <form action={addSponsor} className="stack">
            <label>
              Name
              <input name="name" required maxLength={80} />
            </label>
            <label>
              What participants get
              <input name="offer" maxLength={300} placeholder="$50 of cloud credits" />
            </label>
            <label>
              Tell the crew when this many are left
              <input name="low_at" type="number" min={0} defaultValue={5} />
            </label>
            <button className="btn">Add sponsor</button>
          </form>
        </div>
      </div>

      <h2 style={{ marginTop: 40 }}>
        Registrations <a href="/admin/export" className="link" style={{ fontSize: "0.9rem", marginLeft: 12 }}>Download CSV</a>
      </h2>
      <p className="muted">
        {capacity !== null ? `Capacity ${capacity} · ${Math.max(0, capacity - tally.going)} spots open · ` : "No capacity set: everyone is going · "}
        {Object.entries(byRole).map(([r, n]) => `${n} ${r}`).join(" · ")}
      </p>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Email</th>
              <th>Role</th>
              <th>Team</th>
              <th>Food</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {(regs as Reg[] | null ?? []).map((r) => (
              <tr key={r.user_id}>
                <td>{r.name}</td>
                <td>
                  {r.status === "waitlist" ? (
                    <span className="pill warn">waitlist{place.get(r.user_id) ? ` #${place.get(r.user_id)}` : ""}</span>
                  ) : r.status === "cancelled" ? (
                    <span className="pill">cancelled</span>
                  ) : (
                    <span className="pill ok">going</span>
                  )}
                </td>
                <td>{r.email}</td>
                <td>{r.role}</td>
                <td>{r.team_status === "have_team" ? r.team_name ?? "has a team" : r.team_status.replace("_", " ")}</td>
                <td>{r.dietary ?? ""}</td>
                <td className="muted">{when(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ marginTop: 40 }}>Audit log</h2>
      <div className="card">
        <table>
          <tbody>
            {(log ?? []).map((l) => (
              <tr key={l.id}>
                <td className="muted">{when(l.at)}</td>
                <td>{l.action}</td>
                <td>{(sponsors ?? []).find((s) => s.id === l.sponsor_id)?.name ?? ""}</td>
                <td>{l.by_email ?? people.get(l.user_id)?.name ?? ""}</td>
                <td className="muted">{l.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
