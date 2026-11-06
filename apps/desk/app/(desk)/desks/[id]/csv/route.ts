import { and, eq } from "drizzle-orm";
import { community, db } from "@/lib/db";
import { skillsDir } from "@/lib/desks";
import { deskRowsOf, desks, loadDeskSkill, sheetCsv } from "@/lib/ferri";
import { currentUser } from "@/lib/session";

/** A desk's sheet as CSV (spec 20). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return new Response("Sign in first.", { status: 401 });
  const { id } = await ctx.params;
  const c = await community();
  const [d] = await db()
    .select()
    .from(desks)
    .where(and(eq(desks.id, id), eq(desks.communityId, c.id)))
    .limit(1);
  if (!d) return new Response("No such desk.", { status: 404 });
  const s = await loadDeskSkill(db(), skillsDir(), c.id, d.skillKey);
  if (!s || !("skill" in s) || !s.skill.sheet) return new Response("This desk keeps no sheet.", { status: 404 });
  const rows = await deskRowsOf(db(), d.id);
  const file = `${d.roomName}-${s.skill.sheet.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
  return new Response(`﻿${sheetCsv(s.skill.sheet, rows)}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${file}"`,
      "cache-control": "no-store",
    },
  });
}
