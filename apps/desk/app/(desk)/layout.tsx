import { CirclePause, CirclePlay, Eye, LogOut } from "lucide-react";
import { community } from "@/lib/db";
import { overview } from "@/lib/data";
import { builderRequests } from "@/lib/builder";
import { requireUser } from "@/lib/session";
import { signOut } from "../login/actions";
import { setPause } from "./actions";
import { Nav } from "./nav";

export const dynamic = "force-dynamic";
export const metadata = { title: "Desk" };

export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const c = await community();
  const [o, waiting] = await Promise.all([overview(), builderRequests(user).catch(() => [])]);
  const footer = (
    <div className="border-t border-zinc-200 p-4">
      <form action={setPause}>
        <input type="hidden" name="paused" value={c.paused ? "0" : "1"} />
        <button className={c.paused ? "btn-primary w-full" : "btn w-full"}>
          {c.paused ? <CirclePlay size={16} aria-hidden /> : <CirclePause size={16} aria-hidden />}
          {c.paused ? "Resume Ferri" : "Pause Ferri everywhere"}
        </button>
      </form>
      <div className="mt-3 flex items-center justify-between gap-2 px-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-zinc-800">
            {(user.name || "?").charAt(0).toUpperCase()}
          </span>
          <span className="truncate text-[12.5px] text-zinc-600">{user.name}</span>
        </span>
        {user.readonly ? (
          <a href="/logout" className="inline-flex items-center gap-1 text-[12.5px] text-zinc-500 hover:text-zinc-900">
            Leave
          </a>
        ) : (
          <form action={signOut}>
            <button className="inline-flex items-center gap-1 text-[12.5px] text-zinc-500 hover:text-zinc-900">
              <LogOut size={14} aria-hidden /> Sign out
            </button>
          </form>
        )}
      </div>
    </div>
  );
  return (
    <div className="min-h-screen lg:flex">
      <Nav
        community={c.name}
        footer={footer}
        counts={{
          "/cards": o.openQuestions + o.repliesWaiting,
          "/care": o.casesOpen,
          "/guests": o.guestsWaiting,
          "/announcements": o.announcementsWaiting,
          "/plan": o.planWaiting,
          "/builder": waiting.length,
          "/contacts": o.emailsWaiting,
          "/spaces": o.discovered,
        }}
      />
      <div className="min-w-0 flex-1">
        {user.readonly ? (
          <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2 text-[13px] text-amber-800 lg:px-10">
            <Eye size={15} className="shrink-0" aria-hidden />
            Guest view of Ferri&apos;s live demo: look around freely. Buttons that change something are refused.
          </div>
        ) : null}
        {c.paused ? (
          <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-5 py-2 text-[13px] text-red-700 lg:px-10">
            <CirclePause size={15} className="shrink-0" aria-hidden />
            Ferri is paused{c.pausedBy ? ` by ${c.pausedBy}` : ""}: it posts nothing anywhere. Questions are still logged; answered cards go out when you resume.
          </div>
        ) : null}
        <main className="mx-auto max-w-[1120px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">{children}</main>
      </div>
    </div>
  );
}
