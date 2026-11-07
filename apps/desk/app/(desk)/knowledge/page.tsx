import Link from "next/link";
import { Plus, Search } from "lucide-react";
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
        sub="What Ferri answers from, with a source under every answer."
        about={<p>Every edit is a new version. Ferri uses it at once, and the Switch copy follows. Crew answers from cards land here too.</p>}
        action={
          <Link href="/knowledge/new" className="btn-primary">
            <Plus size={15} aria-hidden />
            New entry
          </Link>
        }
      />
      <form className="mb-8 flex flex-wrap items-center gap-2" role="search">
        <div className="relative min-w-0 flex-1 basis-[220px] sm:max-w-[360px]">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" aria-hidden />
          <input className="input pl-9" name="q" defaultValue={q ?? ""} placeholder="Search headings and text" aria-label="Search knowledge" />
        </div>
        <label className="flex items-center gap-1.5 text-[12.5px] text-zinc-600">
          <input type="checkbox" name="archived" value="1" defaultChecked={archived === "1"} /> include archived
        </label>
        <button className="btn">Search</button>
      </form>
      {groups.size ? (
        [...groups].map(([title, list]) => (
          <Section key={title} title={title} count={list.length}>
            <div className="card-flat divide-y divide-zinc-100">
              {list.map((e) => (
                <Link key={e.id} href={`/knowledge/${e.id}`} className="block px-4 py-3 hover:bg-zinc-50">
                  <div className="flex items-baseline gap-3">
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-zinc-900">{e.heading}</span>
                    <span className="shrink-0 text-[12px] text-zinc-500">
                      {e.archivedAt ? <span className="text-red-700">archived · </span> : null}
                      {KIND[e.sourceKind] ?? e.sourceKind} · {ago(e.updatedAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 line-clamp-1 text-[12.5px] text-zinc-500">{e.body}</div>
                </Link>
              ))}
            </div>
          </Section>
        ))
      ) : q ? (
        <Empty quiet>Nothing matches “{q}”.</Empty>
      ) : (
        <Empty pose="thinking" title="No knowledge yet" action={<Link href="/knowledge/new" className="btn">Add an entry</Link>}>
          Run pnpm kb seed, or add an entry. Crew answers from cards land here too.
        </Empty>
      )}
    </>
  );
}
