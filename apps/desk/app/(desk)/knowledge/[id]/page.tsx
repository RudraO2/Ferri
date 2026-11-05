import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { entry, fmt } from "@/lib/data";
import { entryRevisions } from "@/lib/ferri";
import { archiveEntry, saveEntry } from "../../actions";
import { Note, PageHead, Section } from "../../ui";

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
      <PageHead title={e.heading} sub={`${e.sourceTitle} · version ${e.version}${e.archivedAt ? " · archived" : ""}`} />
      <Note note={note} />
      <p className="muted mb-4">{KIND[e.sourceKind]}</p>

      <Section title="Edit">
        <form action={saveEntry} className="card space-y-3 p-4">
          <input type="hidden" name="entryId" value={e.id} />
          <div>
            <label className="label">Heading</label>
            <input className="input" name="heading" defaultValue={e.heading} />
          </div>
          <div>
            <label className="label">Text</label>
            <textarea className="textarea" name="body" rows={8} defaultValue={e.body} />
          </div>
          <div className="flex gap-2">
            <button className="btn-primary">Save as a new version</button>
            <button className="btn" formAction={archiveEntry} name="archived" value={e.archivedAt ? "0" : "1"}>
              {e.archivedAt ? "Restore" : "Archive"}
            </button>
          </div>
        </form>
      </Section>

      <Section title={`History · ${revisions.length}`}>
        <div className="card divide-y divide-zinc-100">
          {revisions.map((r) => (
            <div key={r.id} className="px-4 py-2.5">
              <div className="text-[12px] text-zinc-500">
                v{r.version} · {r.change} by {r.editedBy} · {fmt(r.createdAt)}
              </div>
              <div className="mt-0.5 text-[13px] font-medium">{r.heading}</div>
              <div className="whitespace-pre-wrap text-[12.5px] text-zinc-600">{r.body}</div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
