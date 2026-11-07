import { community } from "@/lib/db";
import { builderRequests } from "@/lib/builder";
import { pocketCounts } from "@/lib/pocket";
import { requirePocketUser } from "@/lib/session";
import { AutoRefresh } from "../../(desk)/refresh";
import { Tabs } from "./tabs";

export const dynamic = "force-dynamic";

export default async function PocketApp({ children }: { children: React.ReactNode }) {
  const user = await requirePocketUser();
  const c = await community();
  const [counts, builderAsks] = await Promise.all([pocketCounts(user), builderRequests(user).catch(() => [])]);
  return (
    <>
      <AutoRefresh seconds={10} />
      {c.paused ? (
        <div className="bg-red-50 px-5 py-2 text-[13px] text-red-700">Ferri is paused. Answers go out when it resumes.</div>
      ) : null}
      {/* Room below the last card, so the floating tab bar never covers it. */}
      <main className="pb-10">{children}</main>
      <Tabs needsYou={counts.needsYou + builderAsks.length} stuck={counts.stuck} />
    </>
  );
}
