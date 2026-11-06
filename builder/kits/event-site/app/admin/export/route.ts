import { adminClient, currentUser, isAdmin } from "@/lib/supabase";

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
  const { data, error } = await adminClient().from("registrations").select("name, email, role, team_status, team_name, dietary, created_at").order("created_at");
  if (error) return new Response(error.message, { status: 500 });
  const head = ["name", "email", "role", "team_status", "team_name", "dietary", "registered_at"];
  const rows = (data ?? []).map((r) => [r.name, r.email, r.role, r.team_status, r.team_name, r.dietary, r.created_at].map(cell).join(","));
  return new Response([head.join(","), ...rows].join("\r\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="registrations.csv"' },
  });
}
