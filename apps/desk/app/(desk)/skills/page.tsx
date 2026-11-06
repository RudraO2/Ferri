import Link from "next/link";
import { community } from "@/lib/db";
import { ago } from "@/lib/data";
import { promptPreview, skillDetail, skillList } from "@/lib/skills";
import { Empty, Note, PageHead, Section } from "../ui";
import { resetSkillText, saveSkillText } from "./actions";

/**
 * Customization (spec 21): the skills that shape Ferri, as this community runs
 * them. Ferri reads them on every use, so a save applies from the next message.
 */
export default async function SkillsPage({ searchParams }: { searchParams: Promise<{ key?: string; note?: string }> }) {
  const { key: wanted, note } = await searchParams;
  const c = await community();
  const list = await skillList(c.id);
  const key = wanted && list.some((s) => s.key === wanted) ? wanted : (list[0]?.key ?? null);
  const detail = key ? await skillDetail(c.id, key) : null;
  const preview = key ? await promptPreview(c.id, key) : "";
  return (
    <>
      <PageHead
        title="Skills"
        sub="The instructions that shape Ferri: its persona, its answer rules, every desk and event pack. Edit them for your community; the files are the defaults."
      />
      <Note note={note} />
      <p className="muted mb-5">
        Safety stays in code, whatever a skill says: an answer still needs a real citation from the knowledge (or it becomes the holding reply), nothing new goes out
        without an approval card, and the pause still stops everything.
      </p>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-4">
          <Section title={`All skills · ${list.length}`}>
            {list.length ? (
              <div className="card divide-y divide-zinc-100">
                {list.map((s) => (
                  <Link
                    key={s.key}
                    href={`/skills?key=${encodeURIComponent(s.key)}`}
                    className={`block px-3 py-2 text-[13px] ${s.key === key ? "bg-zinc-100 font-medium" : "hover:bg-zinc-50"}`}
                  >
                    <div>{s.key}</div>
                    <div className="text-[12px] font-normal text-zinc-500">{s.source}</div>
                  </Link>
                ))}
              </div>
            ) : (
              <Empty>No skill files found. Desk looks for the repo&apos;s skills/ folder (or FERRI_SKILLS_DIR).</Empty>
            )}
          </Section>
        </div>

        <div className="col-span-8">
          {detail ? (
            <>
              <Section
                title={detail.key}
                aside={
                  <span className="text-[12px] text-zinc-500">
                    {detail.live === "edited" ? "Ferri uses the edited text" : "Ferri uses the default file"} · {detail.source}
                  </span>
                }
              >
                <form action={saveSkillText} className="card space-y-3 p-4">
                  <input type="hidden" name="key" value={detail.key} />
                  <textarea className="textarea font-mono text-[12px]" name="body" rows={22} defaultValue={detail.text} />
                  <div className="flex items-center justify-between">
                    <button className="btn-primary">Save new version</button>
                    {detail.hasDefault && detail.live === "edited" ? (
                      <button className="btn" formAction={resetSkillText}>
                        Reset to default
                      </button>
                    ) : null}
                  </div>
                </form>
              </Section>

              <Section title="Preview of the prompt head">
                <details className="card p-4">
                  <summary className="cursor-pointer text-[13px] text-zinc-600">
                    What Ferri reads before the knowledge{detail.key.startsWith("desks/") ? " in this desk" : ""} (the community&apos;s tone and language last)
                  </summary>
                  <pre className="mt-3 max-h-[480px] overflow-auto whitespace-pre-wrap text-[12px] text-zinc-700">{preview}</pre>
                </details>
              </Section>

              <Section title={`Revisions · ${detail.revisions.length}`}>
                {detail.revisions.length ? (
                  <div className="card divide-y divide-zinc-100">
                    {detail.revisions.map((r) => (
                      <details key={r.id} className="px-4 py-2.5">
                        <summary className="cursor-pointer text-[13px]">
                          v{r.version} · {r.change === "reset" ? "reset to the default" : r.change} by {r.editedBy} · {ago(r.createdAt)}
                        </summary>
                        <pre className="mt-2 max-h-[320px] overflow-auto whitespace-pre-wrap text-[12px] text-zinc-600">{r.body}</pre>
                      </details>
                    ))}
                  </div>
                ) : (
                  <Empty>No edits yet: Ferri uses the default file.</Empty>
                )}
              </Section>
            </>
          ) : (
            <Empty>Pick a skill.</Empty>
          )}
        </div>
      </div>
    </>
  );
}
