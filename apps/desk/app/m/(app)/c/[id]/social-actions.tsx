import { answerSocialCard } from "../../../../(desk)/social/actions";
import { recentSocialPosts, serviceName } from "@/lib/social";

/** A social card (spec 18) in Pocket: every network's text, the image, and Post it / Save as drafts / Don't post. */
export async function SocialActions({ cardId }: { cardId: string }) {
  const posts = (await recentSocialPosts(200)).filter((p) => p.cardId === cardId);
  const back = `/m/c/${cardId}`;
  const due = posts[0]?.dueAt ?? null;
  return (
    <div className="mt-2 space-y-3">
      {posts.map((p) => (
        <div key={p.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-[14px]">
          <div className="mb-1 text-[12px] font-semibold tracking-wide text-zinc-500 uppercase">
            {serviceName(p.service)} · {p.channelName}
          </div>
          <div className="whitespace-pre-wrap text-zinc-800">{p.text}</div>
        </div>
      ))}
      {posts[0]?.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={posts[0].imageUrl} alt="" className="w-full rounded-xl border border-zinc-200" />
      ) : null}
      {[
        ["post", due ? "Schedule it" : "Post it", "btn-lg-primary"],
        ["drafts", "Save as Buffer drafts", "btn-lg"],
        ["skip", "Don't post", "btn-lg"],
      ].map(([choice, label, cls]) => (
        <form key={choice} action={answerSocialCard}>
          <input type="hidden" name="cardId" value={cardId} />
          <input type="hidden" name="choice" value={choice} />
          <input type="hidden" name="back" value={back} />
          <button className={`${cls} w-full`}>{label}</button>
        </form>
      ))}
    </div>
  );
}
