import { crewToPick, myCrew } from "@/lib/pocket";
import { requirePocketUser } from "@/lib/session";
import { signOut } from "../../../login/actions";
import { linkMe, unlinkMe } from "../../actions";
import { Header, QUIET, Toast } from "../bits";
import { InstallHint, PushPanel } from "../push";

export default async function Me({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  const { note } = await searchParams;
  const user = await requirePocketUser("/m/me");
  const [me, crew] = await Promise.all([myCrew(user), crewToPick()]);
  const linked = me[0];
  const topics = [...new Set(me.flatMap((m) => m.topics))];
  return (
    <>
      <Header title="Me" sub={`${user.name} · ${user.email}`} />
      <Toast note={note} />
      <div className="mt-3 space-y-3 px-4">
        <div className="rounded-[20px] bg-white p-4 ring-1 ring-zinc-200">
          <div className="text-[15px] font-semibold text-zinc-900">On the crew</div>
          {linked ? (
            <>
              <p className="mt-1 text-[13.5px] text-zinc-500">
                You are <span className="font-medium text-zinc-900">{linked.name}</span>
                {topics.length ? `, owner of ${topics.join(", ")}` : ""}
                {me.some((m) => m.onDuty) ? ", on duty" : ""}.
              </p>
              <form action={unlinkMe} className="mt-1 -ml-4">
                <input type="hidden" name="crewMemberId" value={linked.id} />
                <button className={QUIET}>I am not {linked.name}</button>
              </form>
            </>
          ) : (
            <>
              <p className="mt-1 text-[13.5px] text-zinc-500">Which one are you? Pocket then buzzes you for your own cards.</p>
              <div className="mt-3 space-y-2">
                {crew.map((c) => (
                  <form key={c.id} action={linkMe}>
                    <input type="hidden" name="crewMemberId" value={c.id} />
                    <button className="btn-lg w-full justify-between" disabled={!!c.handles.switch && c.handles.switch.toLowerCase() !== user.email.toLowerCase()}>
                      <span>{c.name}</span>
                      <span className="truncate pl-3 text-[12.5px] font-normal text-zinc-500">
                        {c.handles.switch ? "linked to someone else" : c.topicsAll.join(", ") || "crew"}
                      </span>
                    </button>
                  </form>
                ))}
              </div>
            </>
          )}
        </div>
        {user.readonly ? (
          <p className="px-1 text-[13.5px] text-zinc-500">Notifications are for crew accounts. This is a read-only guest view.</p>
        ) : (
          <PushPanel />
        )}
        <InstallHint />
        <form action={signOut} className="flex justify-center pt-2">
          <input type="hidden" name="next" value="/m" />
          <button className={QUIET}>Sign out</button>
        </form>
      </div>
    </>
  );
}
