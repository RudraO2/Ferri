import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { entry, fmt } from "@/lib/data";
import { entryRevisions } from "@/lib/ferri";
import { archiveEntry, saveEntry } from "../../actions";
import { Fold, Note, PageHead } from "../../ui";

const KIND: Record<string, string> = {
  markdown: "Seeded from markdown. Editing it here makes it a Desk entry, and the seed will not overwrite it.",
  desk: "Edited in Desk. The seed leaves it alone.",
  crew_answer: "A crew answer Ferri saved from a question card or a 'remember'.",
};

export default async function EntryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ note?: string }> }) {
  const { id } = await params;
  const { note } = await searchParams;
  const e = await entry(id);
  if (!e) notFound();
  const revisions = await entryRevisions(db(), id);
  return (
    <>
      <PageHead
        eyebrow="Knowledge"
        title={e.heading}
        sub={`${e.sourceTitle} · version ${e.version}${e.archivedAt ? " · archived" : ""}`}
        about={KIND[e.sourceKind] ? <p>{KIND[e.sourceKind]}</p> : undefined}
      />
      <Note note={note} />

      <form action={saveEntry} className="card mb-10 max-w-[760px] space-y-4 p-5 sm:p-6">
        <input type="hidden" name="entryId" value={e.id} />
        <div>
          <label className="label" htmlFor="kn-heading">
            Heading
          </label>
          <input id="kn-heading" className="input" name="heading" defaultValue={e.heading} />
        </div>
        <div>
          <label className="label" htmlFor="kn-body">
            Text
          </label>
          <textarea id="kn-body" className="textarea" name="body" rows={8} defaultValue={e.body} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary">Save as a new version</button>
          <button
            className="h-9 rounded-full px-3 text-[13px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            formAction={archiveEntry}
            name="archived"
            value={e.archivedAt ? "0" : "1"}
          >
            {e.archivedAt ? "Restore" : "Archive"}
          </button>
        </div>
      </form>

      <Fold title="History" count={revisions.length}>
        <ol className="card-flat divide-y divide-zinc-100">
          {revisions.map((r) => (
            <li key={r.id} className="px-4 py-3">
              <div className="text-[12px] text-zinc-500">
                v{r.version} · {r.change} by {r.editedBy} · {fmt(r.createdAt)}
              </div>
              <div className="mt-0.5 text-[13px] font-medium">{r.heading}</div>
              <div className="whitespace-pre-wrap text-[12.5px] text-zinc-600">{r.body}</div>
            </li>
          ))}
        </ol>
      </Fold>
    </>
  );
}
