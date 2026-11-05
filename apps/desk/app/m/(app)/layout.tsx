import { community } from "@/lib/db";
import { pocketCounts } from "@/lib/pocket";
import { requirePocketUser } from "@/lib/session";
import { AutoRefresh } from "../../(desk)/refresh";
import { Tabs } from "./tabs";

export const dynamic = "force-dynamic";

export default async function PocketApp({ children }: { children: React.ReactNode }) {
  const user = await requirePocketUser();
  const c = await community();
  const counts = await pocketCounts(user);
  return (
    <>
      <AutoRefresh seconds={10} />
      {c.paused ? (
        <div className="bg-red-50 px-5 py-2 text-[13px] text-red-700">Ferri is paused: nothing is posted anywhere. Answers go out when it resumes.</div>
      ) : null}
      {children}
      <Tabs needsYou={counts.needsYou} stuck={counts.stuck} />
    </>
  );
}
