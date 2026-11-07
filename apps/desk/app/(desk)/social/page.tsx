import { and, desc, eq } from "drizzle-orm";
import { ago, fmt, liveEvents } from "@/lib/data";
import { community, db } from "@/lib/db";
import { cards } from "@/lib/ferri";
import { SOCIAL_STATUS_LABEL, bufferChannels, recentSocialPosts, serviceName, type SocialPost } from "@/lib/social";
import { answerSocialCard, deleteSocialPost, requestSocialPost } from "./actions";
import { AutoRefresh } from "../refresh";
import { Composer, Empty, Fold, Note, PageHead, Section } from "../ui";

const STATUS_STYLE: Record<string, string> = {
  waiting: "bg-amber-50 text-amber-700",
  draft: "bg-sky-50 text-sky-700",
  scheduled: "bg-sky-50 text-sky-700",
  sent: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
};

const quiet = "h-9 rounded-full px-3 text-[13px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900";

export default async function SocialPage({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  const { note } = await searchParams;
  const c = await community();
  const [{ channels, error }, posts, evs, open] = await Promise.all([
    bufferChannels(),
    recentSocialPosts(),
    liveEvents(c.id),
    db().select().from(cards).where(and(eq(cards.communityId, c.id), eq(cards.kind, "social"), eq(cards.status, "open"))).orderBy(desc(cards.createdAt)),
  ]);
  const byCard = new Map<string, SocialPost[]>();
  for (const p of posts) if (p.cardId) byCard.set(p.cardId, [...(byCard.get(p.cardId) ?? []), p]);
  const groups = [...byCard.entries()];
  return (
    <>
      <AutoRefresh seconds={10} />
      <PageHead
        title="Social"
        sub="LinkedIn, X and Instagram through Buffer, after one OK."
        about={
          <>
            <p>Ferri writes each network&apos;s version from the knowledge. Nothing goes out without an OK on a card, here, in Pocket or in the crew room.</p>
            <p>Images go to Ferri&apos;s media host until the post is out, then they are removed.</p>
          </>
        }
      />
      <Note note={note} />

      {channels === null ? (
        <div className="mb-8">
          <Empty pose="sleep" title="Social posting is off">
            Put BUFFER_API_KEY in Ferri&apos;s .env (Buffer › Settings › API).
          </Empty>
        </div>
      ) : error ? (
        <div className="mb-8">
          <Empty pose="oops" title="Buffer refused">
            {error}
          </Empty>
        </div>
      ) : null}

      {open.length ? (
        <Section title="Waiting for your OK" count={open.length}>
          <div className="space-y-4">
            {open.map((card) => {
              const ps = byCard.get(card.id) ?? [];
              return (
                <article key={card.id} className="card p-5 sm:p-6">
                  <div className="text-[12.5px] text-zinc-500">Asked {ago(card.createdAt)}</div>
                  <h3 className="mt-1 text-[16px] font-semibold text-zinc-900">{card.question}</h3>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {ps.map((p) => (
                      <div key={p.id} className="rounded-[14px] bg-zinc-100 p-3 text-[13px]">
                        <div className="mb-1 text-[12px] font-semibold text-zinc-700">
                          {serviceName(p.service)} · {p.channelName}
                        </div>
                        <div className="whitespace-pre-wrap text-zinc-700">{p.text}</div>
                      </div>
                    ))}
                  </div>
                  {ps[0]?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ps[0].imageUrl} alt="The image that goes with the posts" className="mt-3 h-40 max-w-full rounded-[12px]" />
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {[
                      ["post", ps[0]?.dueAt ? `Schedule for ${fmt(ps[0].dueAt)}` : "Post it"],
                      ["drafts", "Save as Buffer drafts"],
                      ["skip", "Don't post"],
                    ].map(([choice, label]) => (
                      <form key={choice} action={answerSocialCard}>
                        <input type="hidden" name="cardId" value={card.id} />
                        <input type="hidden" name="choice" value={choice} />
                        <button className={choice === "post" ? "btn-primary" : choice === "drafts" ? "btn" : quiet}>{label}</button>
                      </form>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </Section>
      ) : null}

      <Composer label="New post">
        <form action={requestSocialPost} className="card space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="social-event">
                Event
              </label>
              <select id="social-event" className="input" name="eventId" defaultValue={evs[0]?.id}>
                {evs.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="social-when">
                When (IST, optional)
              </label>
              <input id="social-when" className="input" type="datetime-local" name="when" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="social-what">
              What the posts should say
            </label>
            <textarea id="social-what" className="textarea" name="what" rows={3} placeholder="Registration for Build Night is open, 120 seats, free." />
          </div>
          <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-zinc-700">
            <legend className="label">Networks</legend>
            {["linkedin", "x", "instagram"].map((n) => (
              <label key={n} className="flex items-center gap-1.5">
                <input type="checkbox" name="network" value={n} defaultChecked /> {n === "x" ? "X" : serviceName(n)}
              </label>
            ))}
            <label className="flex items-center gap-1.5">
              <input type="checkbox" name="image" value="poster" defaultChecked /> with the poster
            </label>
          </fieldset>
          <button className="btn-primary">Draft it for approval</button>
        </form>
      </Composer>

      <Section title="Posts" count={groups.length}>
        {groups.length ? (
          <div className="card-flat divide-y divide-zinc-100">
            {groups.map(([cardId, ps]) => (
              <form key={cardId} action={deleteSocialPost} className="px-4 py-3.5">
                <div className="text-[13.5px] font-medium text-zinc-900">{ps[0]!.ask?.slice(0, 120)}</div>
                <div className="mt-0.5 text-[12px] text-zinc-500">
                  {ps[0]!.requestedBy} · {ago(ps[0]!.createdAt)}
                  {ps[0]!.dueAt ? ` · for ${fmt(ps[0]!.dueAt)}` : ""}
                </div>
                <ul className="mt-2.5 space-y-1.5">
                  {ps.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-start gap-x-2 gap-y-1 text-[13px]">
                      {p.status === "draft" || p.status === "scheduled" ? (
                        <input type="checkbox" name="id" value={p.id} className="mt-1" aria-label={`Delete the ${serviceName(p.service)} post in Buffer`} />
                      ) : (
                        <span className="w-[13px]" />
                      )}
                      <span className={`badge ${STATUS_STYLE[p.status] ?? ""}`}>{SOCIAL_STATUS_LABEL[p.status] ?? p.status}</span>
                      <span className="font-medium text-zinc-800">{serviceName(p.service)}</span>
                      <span className="min-w-0 flex-1 text-zinc-600">
                        {p.text.slice(0, 140)}
                        {p.text.length > 140 ? "…" : ""}
                      </span>
                      {p.deleteRequestedAt && p.status !== "deleted" ? <span className="muted">deleting…</span> : null}
                      {p.error ? <span className="w-full pl-[21px] text-[12px] text-red-700">{p.error.slice(0, 120)}</span> : null}
                    </li>
                  ))}
                </ul>
                {ps.some((p) => p.status === "draft" || p.status === "scheduled") ? <button className="btn mt-3">Delete the ticked ones in Buffer</button> : null}
              </form>
            ))}
          </div>
        ) : (
          <Empty quiet>No social posts yet. Try “@ferri post the poster on LinkedIn, X and Instagram” in the crew room.</Empty>
        )}
      </Section>

      {channels?.length ? (
        <Fold title="Channels in Buffer" count={channels.length}>
          <ul className="card-flat divide-y divide-zinc-100">
            {channels.map((ch) => (
              <li key={ch.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{serviceName(ch.service)}</span> · {ch.displayName || ch.name}
                </span>
                <span className="shrink-0 text-[12px] text-zinc-500">{ch.isQueuePaused ? "queue paused" : "connected"}</span>
              </li>
            ))}
          </ul>
        </Fold>
      ) : channels && !error ? (
        <Empty quiet>No channels connected in Buffer yet.</Empty>
      ) : null}
    </>
  );
}
