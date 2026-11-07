import { answerSocialCard } from "../../../../(desk)/social/actions";
import { recentSocialPosts, serviceName } from "@/lib/social";
import { QUIET } from "../../quiet";

/** A social card (spec 18) in Pocket: every network's text, the image, and Post it / Save as drafts / Don't post. */
export async function SocialActions({ cardId }: { cardId: string }) {
  const posts = (await recentSocialPosts(200)).filter((p) => p.cardId === cardId);
  const back = `/m/c/${cardId}`;
  const due = posts[0]?.dueAt ?? null;
  const choice = (value: string, label: string, cls: string) => (
    <form action={answerSocialCard}>
      <input type="hidden" name="cardId" value={cardId} />
      <input type="hidden" name="choice" value={value} />
      <input type="hidden" name="back" value={back} />
      <button className={cls}>{label}</button>
    </form>
  );
  return (
    <div className="mt-3 space-y-3">
      {posts[0]?.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={posts[0].imageUrl} alt="" className="w-full rounded-[18px] ring-1 ring-zinc-200" />
      ) : null}
      {posts.map((p) => (
        <div key={p.id} className="rounded-[18px] bg-white px-4 py-3 text-[14.5px] ring-1 ring-zinc-200">
          <div className="mb-1 text-[12.5px] font-semibold text-zinc-500">
            {serviceName(p.service)} · {p.channelName}
          </div>
          <div className="whitespace-pre-wrap text-zinc-800">{p.text}</div>
        </div>
      ))}
      {choice("post", due ? "Schedule it" : "Post it", "btn-lg-primary h-14 w-full text-[16px]")}
      <div className="flex flex-wrap justify-center gap-1">
        {choice("drafts", "Save as Buffer drafts", QUIET)}
        {choice("skip", "Don't post", QUIET)}
      </div>
    </div>
  );
}
