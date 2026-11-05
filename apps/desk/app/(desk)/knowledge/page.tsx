import Link from "next/link";
import { community } from "@/lib/db";
import { ago, allEvents, knowledgeList } from "@/lib/data";
import { Empty, PageHead, Section } from "../ui";

const KIND: Record<string, string> = { markdown: "seeded", desk: "edited in Desk", crew_answer: "crew answer" };

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ q?: string; archived?: string }> }) {
  const { q, archived } = await searchParams;
  const c = await community();
  const [entries, evs] = await Promise.all([knowledgeList(c.id, { q, archived: archived === "1" }), allEvents(c.id)]);
  const eventName = new Map(evs.map((e) => [e.id, e.name]));
  const groups = new Map<string, typeof entries>();
  for (const e of entries) {
    const scope = e.eventId ? (eventName.get(e.eventId) ?? "Event") : `${c.name} (community)`;
    const key = `${scope} › ${e.sourceTitle}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return (
    <>
      <PageHead
        title="Knowledge"
        sub="What Ferri answers from. Every edit is a new version, Ferri uses it at once, and the Switch copy follows."
        action={
          <Link href="/knowledge/new" className="btn-primary">
            New entry
          </Link>
        }
      />
      <form className="mb-6 flex gap-2">
        <input className="input max-w-[360px]" name="q" defaultValue={q ?? ""} placeholder="Search headings and text" />
        <label className="flex items-center gap-1.5 text-[12px] text-zinc-600">
          <input type="checkbox" name="archived" value="1" defaultChecked={archived === "1"} /> include archived
        </label>
        <button className="btn">Search</button>
      </form>
      {groups.size ? (
        [...groups].map(([title, list]) => (
          <Section key={title} title={title}>
            <div className="card divide-y divide-zinc-100">
              {list.map((e) => (
                <Link key={e.id} href={`/knowledge/${e.id}`} className="block px-4 py-2.5 hover:bg-zinc-50">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium">{e.heading}</span>
                    <span className="badge">{KIND[e.sourceKind] ?? e.sourceKind}</span>
                    {e.archivedAt ? <span className="badge text-red-600">archived</span> : null}
                    <span className="ml-auto text-[12px] text-zinc-400">
                      v{e.version} · {ago(e.updatedAt)}
                    </span>
                  </div>
                  <div className="line-clamp-1 text-[12.5px] text-zinc-500">{e.body}</div>
                </Link>
              ))}
            </div>
          </Section>
        ))
      ) : (
        <Empty>{q ? "Nothing matches." : "No knowledge yet. Run `pnpm kb seed`, or add an entry."}</Empty>
      )}
    </>
  );
}
