import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { community } from "@/lib/db";
import { ago } from "@/lib/data";
import { promptPreview, skillDetail, skillList } from "@/lib/skills";
import { Empty, Fold, Note, PageHead } from "../ui";
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
        sub="The instructions that shape Ferri. Edit them for your community."
        about={
          <>
            <p>Ferri&apos;s persona, its answer rules, every desk and event pack. The files are the defaults; a save applies from the next message.</p>
            <p>
              Safety stays in code, whatever a skill says: an answer still needs a real citation from the knowledge (or it becomes the holding reply), nothing new goes
              out without an approval card, and the pause still stops everything.
            </p>
          </>
        }
      />
      <Note note={note} />

      {list.length ? (
        <div className="grid gap-8 lg:grid-cols-[240px_1fr] [&>*]:min-w-0">
          {/* Phones: one picker instead of a long list. */}
          <form className="flex gap-2 lg:hidden">
            <label className="sr-only" htmlFor="skill-pick">
              Skill
            </label>
            <select id="skill-pick" className="input min-w-0 flex-1" name="key" defaultValue={key ?? undefined}>
              {list.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.key}
                </option>
              ))}
            </select>
            <button className="btn">Open</button>
          </form>
          <nav aria-label="Skills" className="hidden lg:block">
            <ul className="space-y-px lg:sticky lg:top-6">
              {list.map((s) => (
                <li key={s.key}>
                  <Link
                    href={`/skills?key=${encodeURIComponent(s.key)}`}
                    aria-current={s.key === key ? "page" : undefined}
                    className={`block rounded-[10px] px-3 py-1.5 text-[13px] ${s.key === key ? "bg-white font-semibold text-zinc-900 shadow-[0_0_0_1px_var(--n-200)]" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"}`}
                  >
                    <span className="block truncate">{s.key}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            {detail ? (
              <>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="h2 break-all">{detail.key}</h2>
                  <span className="text-[12px] text-zinc-500">
                    {detail.live === "edited" ? "Edited text in use" : "Default file in use"} · {detail.source}
                  </span>
                </div>
                <form action={saveSkillText} className="card mb-8 space-y-3 p-4">
                  <input type="hidden" name="key" value={detail.key} />
                  <label className="sr-only" htmlFor="skill-body">
                    Skill text
                  </label>
                  <textarea id="skill-body" className="textarea font-mono text-[12px]" name="body" rows={22} defaultValue={detail.text} />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button className="btn-primary">Save new version</button>
                    {detail.hasDefault && detail.live === "edited" ? (
                      <button className="h-9 rounded-full px-3 text-[13px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900" formAction={resetSkillText}>
                        Reset to default
                      </button>
                    ) : null}
                  </div>
                </form>

                <Fold title="Preview of the prompt head" hint={detail.key.startsWith("desks/") ? "in this desk" : undefined} className="mb-2">
                  <p className="muted mb-2">What Ferri reads before the knowledge, with the community&apos;s tone and language last.</p>
                  <pre className="card-flat max-h-[480px] overflow-auto p-4 text-[12px] whitespace-pre-wrap text-zinc-700">{preview}</pre>
                </Fold>

                <Fold title="Revisions" count={detail.revisions.length}>
                  {detail.revisions.length ? (
                    <div className="card-flat divide-y divide-zinc-100">
                      {detail.revisions.map((r) => (
                        <details key={r.id} className="group px-4 py-2.5">
                          <summary className="flex cursor-pointer list-none items-center gap-1 text-[13px] text-zinc-700 [&::-webkit-details-marker]:hidden">
                            v{r.version} · {r.change === "reset" ? "reset to the default" : r.change} by {r.editedBy} · {ago(r.createdAt)}
                            <ChevronDown size={13} className="ml-auto shrink-0 text-zinc-400 transition group-open:rotate-180" aria-hidden />
                          </summary>
                          <pre className="mt-2 max-h-[320px] overflow-auto text-[12px] whitespace-pre-wrap text-zinc-600">{r.body}</pre>
                        </details>
                      ))}
                    </div>
                  ) : (
                    <Empty quiet>No edits yet: Ferri uses the default file.</Empty>
                  )}
                </Fold>
              </>
            ) : (
              <Empty quiet>Pick a skill.</Empty>
            )}
          </div>
        </div>
      ) : (
        <Empty pose="lost" title="No skill files found">
          Desk looks for the repo&apos;s skills/ folder (or FERRI_SKILLS_DIR).
        </Empty>
      )}
    </>
  );
}
