import { and, desc, eq } from "drizzle-orm";
import { ago, fmt, liveEvents } from "@/lib/data";
import { community, db } from "@/lib/db";
import { cards } from "@/lib/ferri";
import { SOCIAL_STATUS_LABEL, bufferChannels, recentSocialPosts, serviceName, type SocialPost } from "@/lib/social";
import { answerSocialCard, deleteSocialPost, requestSocialPost } from "./actions";
import { AutoRefresh } from "../refresh";
import { Empty, Note, PageHead, Section } from "../ui";

const STATUS_STYLE: Record<string, string> = {
  waiting: "border-amber-200 bg-amber-50 text-amber-700",
  draft: "border-sky-200 bg-sky-50 text-sky-700",
  scheduled: "border-sky-200 bg-sky-50 text-sky-700",
  sent: "border-emerald-200 bg-emerald-50 text-emerald-700",
  failed: "border-red-200 bg-red-50 text-red-700",
};

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
        sub="Posts to the community's LinkedIn, X and Instagram through Buffer. Ferri writes each network's version from the knowledge; nothing goes out without an OK on a card. Images go to Ferri's media host until the post is out, then they are removed."
      />
      <Note note={note} />

      <Section title="Channels in Buffer">
        {channels === null ? (
          <Empty>Social posting is off: put BUFFER_API_KEY in Ferri&apos;s .env (Buffer › Settings › API).</Empty>
        ) : error ? (
          <Empty>Buffer refused: {error}</Empty>
        ) : channels.length ? (
          <div className="card divide-y divide-zinc-100">
            {channels.map((ch) => (
              <div key={ch.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                <span>
                  <span className="font-medium">{serviceName(ch.service)}</span> · {ch.displayName || ch.name}
                </span>
                <span className="badge">{ch.isQueuePaused ? "queue paused" : "connected"}</span>
              </div>
            ))}
          </div>
        ) : (
          <Empty>No channels connected in Buffer yet.</Empty>
        )}
      </Section>

      {open.length ? (
        <Section title={`Waiting for an OK · ${open.length}`}>
          <div className="space-y-3">
            {open.map((card) => {
              const ps = byCard.get(card.id) ?? [];
              return (
                <div key={card.id} className="card p-4">
                  <div className="text-[13px] font-medium">{card.question}</div>
                  <div className="muted mt-0.5">asked {ago(card.createdAt)} · also in the crew room and Pocket</div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    {ps.map((p) => (
                      <div key={p.id} className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-[13px]">
                        <div className="mb-1 font-medium">
                          {serviceName(p.service)} · {p.channelName}
                        </div>
                        <div className="whitespace-pre-wrap text-zinc-700">{p.text}</div>
                      </div>
                    ))}
                  </div>
                  {ps[0]?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ps[0].imageUrl} alt="" className="mt-3 h-40 rounded-md border border-zinc-200" />
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      ["post", ps[0]?.dueAt ? `Schedule for ${fmt(ps[0].dueAt)}` : "Post it"],
                      ["drafts", "Save as Buffer drafts"],
                      ["skip", "Don't post"],
                    ].map(([choice, label]) => (
                      <form key={choice} action={answerSocialCard}>
                        <input type="hidden" name="cardId" value={card.id} />
                        <input type="hidden" name="choice" value={choice} />
                        <button className={choice === "post" ? "btn-primary" : "btn"}>{label}</button>
                      </form>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      ) : null}

      <Section title="New post">
        <form action={requestSocialPost} className="card grid grid-cols-6 gap-3 p-4">
          <div className="col-span-2">
            <label className="label">Event</label>
            <select className="input" name="eventId" defaultValue={evs[0]?.id}>
              {evs.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">When (IST, empty: as soon as it is approved)</label>
            <input className="input" type="datetime-local" name="when" />
          </div>
          <div className="col-span-2 flex items-end gap-3 text-[12px] text-zinc-600">
            {["linkedin", "x", "instagram"].map((n) => (
              <label key={n} className="flex items-center gap-1">
                <input type="checkbox" name="network" value={n} defaultChecked /> {n === "x" ? "X" : serviceName(n)}
              </label>
            ))}
            <label className="flex items-center gap-1">
              <input type="checkbox" name="image" value="poster" defaultChecked /> with the poster
            </label>
          </div>
          <div className="col-span-6">
            <label className="label">What the posts should say</label>
            <textarea className="textarea" name="what" rows={3} placeholder="Registration for Build Night is open, 120 seats, free." />
          </div>
          <div className="col-span-6">
            <button className="btn-primary">Draft it for approval</button>
          </div>
        </form>
      </Section>

      <Section title="Posts">
        {groups.length ? (
          <div className="card divide-y divide-zinc-100">
            {groups.map(([cardId, ps]) => (
              <form key={cardId} action={deleteSocialPost} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[13px] font-medium">{ps[0]!.ask?.slice(0, 120)}</div>
                  <div className="muted">
                    {ps[0]!.requestedBy} · {ago(ps[0]!.createdAt)}
                    {ps[0]!.dueAt ? ` · for ${fmt(ps[0]!.dueAt)}` : ""}
                  </div>
                </div>
                <div className="mt-2 space-y-1.5">
                  {ps.map((p) => (
                    <div key={p.id} className="flex items-start gap-2 text-[13px]">
                      {p.status === "draft" || p.status === "scheduled" ? <input type="checkbox" name="id" value={p.id} className="mt-1" /> : <span className="w-[13px]" />}
                      <span className={`badge ${STATUS_STYLE[p.status] ?? ""}`}>{SOCIAL_STATUS_LABEL[p.status] ?? p.status}</span>
                      <span className="font-medium">{serviceName(p.service)}</span>
                      <span className="text-zinc-600">{p.text.slice(0, 140)}{p.text.length > 140 ? "…" : ""}</span>
                      {p.deleteRequestedAt && p.status !== "deleted" ? <span className="muted">deleting…</span> : null}
                      {p.error ? <span className="text-red-600">{p.error.slice(0, 120)}</span> : null}
                    </div>
                  ))}
                </div>
                {ps.some((p) => p.status === "draft" || p.status === "scheduled") ? <button className="btn mt-2">Delete the ticked ones in Buffer</button> : null}
              </form>
            ))}
          </div>
        ) : (
          <Empty>No social posts yet. Ask in the crew room (“@ferri post the poster on LinkedIn, X and Instagram”) or use the form above.</Empty>
        )}
      </Section>
    </>
  );
}
