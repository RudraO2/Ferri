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
    <div className="space-y-1 border-t border-zinc-200 px-3 py-3">
      <form action={setPause} className="flex items-center justify-between gap-2 rounded-[10px] px-2.5 py-1.5">
        <input type="hidden" name="paused" value={c.paused ? "0" : "1"} />
        <span className="flex items-center gap-2 text-[12.5px] text-zinc-600">
          <span className={`h-2 w-2 rounded-full ${c.paused ? "bg-red-500" : "bg-emerald-500"}`} aria-hidden />
          {c.paused ? "Paused" : "Live everywhere"}
        </span>
        <button
          className={c.paused ? "btn-primary h-7 px-3 text-[12px]" : "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"}
          aria-label={c.paused ? "Resume Ferri" : "Pause Ferri everywhere"}
        >
          {c.paused ? <CirclePlay size={14} aria-hidden /> : <CirclePause size={14} aria-hidden />}
          {c.paused ? "Resume" : "Pause"}
        </button>
      </form>
      <div className="flex items-center justify-between gap-2 px-2.5 py-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-zinc-800">
            {(user.name || "?").charAt(0).toUpperCase()}
          </span>
          <span className="truncate text-[12.5px] text-zinc-600">{user.name}</span>
        </span>
        {user.readonly ? (
          <a href="/logout" className="inline-flex items-center gap-1 text-[12px] text-zinc-500 hover:text-zinc-900">
            Leave
          </a>
        ) : (
          <form action={signOut}>
            <button className="inline-flex items-center gap-1 text-[12px] text-zinc-500 hover:text-zinc-900" aria-label="Sign out">
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
          <div className="flex items-center gap-2 bg-amber-50 px-5 py-1.5 text-[12.5px] text-amber-800 lg:px-10">
            <Eye size={15} className="shrink-0" aria-hidden />
            Guest view: look around freely. Changes are switched off.
          </div>
        ) : null}
        {c.paused ? (
          <div className="flex items-center gap-2 bg-red-50 px-5 py-1.5 text-[12.5px] text-red-700 lg:px-10">
            <CirclePause size={15} className="shrink-0" aria-hidden />
            Ferri is paused{c.pausedBy ? ` by ${c.pausedBy}` : ""} and posts nothing. Questions are still logged.
          </div>
        ) : null}
        <main className="mx-auto max-w-[1080px] px-4 py-7 sm:px-6 lg:px-12 lg:py-11">{children}</main>
      </div>
    </div>
  );
}
