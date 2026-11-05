import { crewToPick, myCrew } from "@/lib/pocket";
import { requirePocketUser } from "@/lib/session";
import { signOut } from "../../../login/actions";
import { linkMe, unlinkMe } from "../../actions";
import { Header, Toast } from "../bits";
import { InstallHint, PushPanel } from "../push";

export default async function Me({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  const { note } = await searchParams;
  const user = await requirePocketUser("/m/me");
  const [me, crew] = await Promise.all([myCrew(user), crewToPick()]);
  const linked = me[0];
  return (
    <>
      <Header title="Me" sub={`${user.name} · ${user.email}`} />
      <Toast note={note} />
      <div className="mt-3 space-y-3 px-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="text-[15px] font-medium">On the crew</div>
          {linked ? (
            <>
              <p className="mt-1 text-[13.5px] text-zinc-500">
                You are <span className="font-medium text-zinc-900">{linked.name}</span>
                {me.flatMap((m) => m.topics).length ? `, owner of ${[...new Set(me.flatMap((m) => m.topics))].join(", ")}` : ""}
                {me.some((m) => m.onDuty) ? ", on duty" : ""}. Cards for you buzz this phone.
              </p>
              <form action={unlinkMe} className="mt-3">
                <input type="hidden" name="crewMemberId" value={linked.id} />
                <button className="btn-lg w-full">I am not {linked.name}</button>
              </form>
            </>
          ) : (
            <>
              <p className="mt-1 text-[13.5px] text-zinc-500">Which crew member are you? Pocket then shows and buzzes you for your own cards.</p>
              <div className="mt-3 space-y-2">
                {crew.map((c) => (
                  <form key={c.id} action={linkMe}>
                    <input type="hidden" name="crewMemberId" value={c.id} />
                    <button className="btn-lg w-full justify-between" disabled={!!c.handles.switch && c.handles.switch.toLowerCase() !== user.email.toLowerCase()}>
                      <span>I am {c.name}</span>
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
        <PushPanel />
        <InstallHint />
        <form action={signOut}>
          <input type="hidden" name="next" value="/m" />
          <button className="btn-lg w-full text-zinc-500">Sign out</button>
        </form>
      </div>
    </>
  );
}
