import { allRegistrations } from "@/lib/rsvp";
import { currentUser, isAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Quote, and stop a spreadsheet from reading a cell as a formula.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** Registrations as CSV, for organizers only. */
export async function GET() {
  if (!isAdmin(await currentUser())) return new Response("Organizers only.", { status: 403 });
  type Row = { name: string; email: string; status: string; role: string; team_status: string; team_name: string | null; dietary: string | null; created_at: string };
  let data: Row[];
  try {
    data = await allRegistrations<Row>("name, email, status, role, team_status, team_name, dietary, created_at");
  } catch (err) {
    return new Response((err as Error).message, { status: 500 });
  }
  const head = ["name", "email", "status", "role", "team_status", "team_name", "dietary", "registered_at"];
  const rows = data.map((r) => [r.name, r.email, r.status, r.role, r.team_status, r.team_name, r.dietary, r.created_at].map(cell).join(","));
  return new Response([head.join(","), ...rows].join("\r\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="registrations.csv"' },
  });
}
