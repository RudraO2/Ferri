import { community, db } from "@/lib/db";
import { kitById, slugify } from "@/lib/ferri";
import { currentUser } from "@/lib/session";

/** The starter kit as a markdown download (spec 19). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return new Response("Sign in first.", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const c = await community();
  const kit = await kitById(db(), id);
  if (!kit || kit.communityId !== c.id) return new Response("Not found", { status: 404 });
  return new Response(kit.markdown, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${slugify(kit.name)}.md"`,
      "cache-control": "no-store",
    },
  });
}
