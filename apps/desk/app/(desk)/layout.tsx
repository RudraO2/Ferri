import { community } from "@/lib/db";
import { overview } from "@/lib/data";
import { builderRequests } from "@/lib/builder";
import { requireUser } from "@/lib/session";
import { signOut } from "../login/actions";
import { setPause } from "./actions";
import { Nav } from "./nav";

export const dynamic = "force-dynamic";

export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const c = await community();
  const [o, waiting] = await Promise.all([overview(), builderRequests(user).catch(() => [])]);
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-[220px] shrink-0 flex-col border-r border-zinc-200 bg-white">
        <div className="flex items-center gap-2 px-4 py-4">
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
            <rect width="24" height="24" rx="6" fill="#18181b" />
            <path d="M6 15c3-6 9-6 12 0" stroke="#fafafa" strokeWidth="2" fill="none" strokeLinecap="round" />
            <circle cx="12" cy="15" r="1.6" fill="#fafafa" />
          </svg>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold">Ferri Desk</div>
            <div className="text-[11px] text-zinc-500">{c.name}</div>
          </div>
        </div>
        <Nav
          counts={{
            "/cards": o.openQuestions + o.repliesWaiting,
            "/care": o.casesOpen,
            "/announcements": o.announcementsWaiting,
            "/plan": o.planWaiting,
            "/builder": waiting.length,
            "/contacts": o.emailsWaiting,
            "/spaces": o.discovered,
          }}
        />
        <div className="mt-auto border-t border-zinc-200 p-3">
          <form action={setPause}>
            <input type="hidden" name="paused" value={c.paused ? "0" : "1"} />
            <button className={c.paused ? "btn-primary w-full" : "btn w-full"}>{c.paused ? "Resume Ferri" : "Pause Ferri everywhere"}</button>
          </form>
          <div className="mt-3 flex items-center justify-between">
            <span className="truncate text-[12px] text-zinc-500">{user.name}</span>
            <form action={signOut}>
              <button className="text-[12px] text-zinc-500 hover:text-zinc-900">Sign out</button>
            </form>
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        {c.paused ? (
          <div className="border-b border-red-200 bg-red-50 px-8 py-2 text-[13px] text-red-700">
            Ferri is paused{c.pausedBy ? ` by ${c.pausedBy}` : ""}: it posts nothing anywhere. Questions are still logged; answered cards go out when you resume.
          </div>
        ) : null}
        <main className="mx-auto max-w-[1040px] px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
