import { runDoctor, type DoctorCheck } from "@/lib/ferri";
import { requireUser } from "@/lib/session";
import { Empty, PageHead, Section } from "../ui";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<DoctorCheck["status"], string> = {
  on: "border-emerald-200 bg-emerald-50 text-emerald-700",
  off: "",
  broken: "border-red-200 bg-red-50 text-red-700",
};

function Checks({ checks }: { checks: DoctorCheck[] }) {
  if (!checks.length) return <Empty>Nothing to check.</Empty>;
  return (
    <div className="card divide-y divide-zinc-100">
      {checks.map((c) => (
        <div key={c.id} className="flex items-start gap-3 px-4 py-3">
          <span className={`badge mt-0.5 w-[58px] justify-center ${STATUS_STYLE[c.status]}`}>{c.status}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-zinc-900">{c.name}</div>
            <div className="muted">{c.detail}</div>
            {c.next ? (
              <div className="mt-1 text-[12px] text-zinc-600">
                {c.status === "on" ? "Tip" : "Next"}: <code className="rounded bg-zinc-100 px-1 py-0.5 text-[12px] text-zinc-800">{c.next}</code>
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function SetupPage() {
  await requireUser();
  const report = await runDoctor(process.env);
  const core = report.checks.filter((c) => c.area === "core");
  const integrations = report.checks.filter((c) => c.area === "integration");
  const on = integrations.filter((c) => c.status === "on").length;
  const brokenCore = core.filter((c) => c.status === "broken").length;

  return (
    <>
      <PageHead
        title="Setup"
        sub="What is on, off or broken, and the next step for each. The same report as ./ferri doctor. Reload the page after a change."
      />
      <Section title="Core" aside={<span className="muted">{brokenCore ? `${brokenCore} broken` : "all good"}</span>}>
        <Checks checks={core} />
      </Section>
      <Section title="Integrations" aside={<span className="muted">{`${on} of ${integrations.length} on`}</span>}>
        <Checks checks={integrations} />
      </Section>
      <p className="muted">Checked {new Date(report.at).toLocaleString("en-GB")}.</p>
    </>
  );
}
