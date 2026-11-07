import { firstRunChecklist, firstRunFacts } from "@/lib/checklist";
import { runDoctor, type DoctorCheck } from "@/lib/ferri";
import { requireUser } from "@/lib/session";
import { Empty, Fold, PageHead, Section } from "../ui";
import { FirstRun } from "./first-run";

export const dynamic = "force-dynamic";

const DOT: Record<DoctorCheck["status"], string> = {
  on: "bg-emerald-500",
  off: "bg-zinc-300",
  broken: "bg-red-500",
};
const LABEL: Record<DoctorCheck["status"], string> = { on: "On", off: "Off", broken: "Broken" };

function Checks({ checks }: { checks: DoctorCheck[] }) {
  if (!checks.length) return <Empty quiet>Nothing to check.</Empty>;
  return (
    <ul className="card-flat divide-y divide-zinc-100">
      {checks.map((c) => (
        <li key={c.id} className="flex items-start gap-3 px-4 py-3">
          <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${DOT[c.status]}`} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 text-[13.5px]">
              <span className="font-medium text-zinc-900">{c.name}</span>
              <span className={`text-[12px] ${c.status === "broken" ? "font-medium text-red-700" : "text-zinc-500"}`}>{LABEL[c.status]}</span>
            </div>
            <div className="text-[12.5px] text-zinc-500">{c.detail}</div>
            {c.next && c.status !== "on" ? (
              <div className="mt-1.5 text-[12px] text-zinc-600">
                Next: <code className="rounded-[6px] bg-zinc-100 px-1.5 py-0.5 text-[12px] break-all text-zinc-800">{c.next}</code>
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function SetupPage() {
  await requireUser();
  // The doctor reads Switch; the checklist's other facts come from Ferri's tables at the same time.
  const [report, facts] = await Promise.all([runDoctor(process.env), firstRunFacts()]);
  const firstRun = firstRunChecklist({ ...facts, bridges: report.bridges ?? null });
  const core = report.checks.filter((c) => c.area === "core");
  const integrations = report.checks.filter((c) => c.area === "integration");
  const working = integrations.filter((c) => c.status !== "off");
  const off = integrations.filter((c) => c.status === "off");
  const on = integrations.filter((c) => c.status === "on").length;
  const brokenCore = core.filter((c) => c.status === "broken").length;

  return (
    <>
      <PageHead
        title="Setup"
        sub="Your first run, then what is on, off or broken, with the next step for each."
        about={
          <>
            <p>First run ticks itself from Switch and Ferri&apos;s own data. The built-in test chat (Mattermost) and the Lantern demo count as demo, not done.</p>
            <p>Below it, the same report as ./ferri doctor. Reload the page after a change. Checked {new Date(report.at).toLocaleString("en-GB")}.</p>
          </>
        }
      />
      <FirstRun list={firstRun} />
      <Section title="Core" aside={<span className={`text-[12.5px] ${brokenCore ? "font-medium text-red-700" : "text-zinc-500"}`}>{brokenCore ? `${brokenCore} broken` : "all good"}</span>}>
        <Checks checks={core} />
      </Section>
      <Section title="Integrations" aside={<span className="text-[12.5px] text-zinc-500">{`${on} of ${integrations.length} on`}</span>}>
        {working.length ? <Checks checks={working} /> : <Empty quiet>No integration is on yet.</Empty>}
      </Section>
      {off.length ? (
        <Fold title="Not set up" count={off.length} hint="each with its next step">
          <Checks checks={off} />
        </Fold>
      ) : null}
    </>
  );
}
