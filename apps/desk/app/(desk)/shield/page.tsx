import { PlatformLogo, platformName } from "@/components/platform";
import { ago } from "@/lib/data";
import { community, db } from "@/lib/db";
import { listRules, shieldLog, shieldStats } from "@/lib/shield";
import { gatewayAs, requireUser } from "@/lib/session";
import { addShieldRule, connectShield, disconnectShield, removeShieldRule } from "../actions";
import { AutoRefresh } from "../refresh";
import { Composer, Empty, Fold, Note, PageHead, Section } from "../ui";

interface TrustSettings {
  endpoint: string;
  policy_id: string | null;
  has_api_key: boolean;
  api_key_last4: string | null;
  enabled: boolean;
}

const OUTCOME_STYLE: Record<string, string> = {
  blocked: "bg-red-50 text-red-700",
  redacted: "bg-amber-50 text-amber-700",
  alerted: "bg-sky-50 text-sky-700",
};
const OUTCOME_LABEL: Record<string, string> = { blocked: "blocked", redacted: "secret hidden", alerted: "flagged" };
const short = (name: string | null) => (name ? (name.includes(": ") ? name.slice(name.indexOf(": ") + 2) : name) : "a room Ferri is not in");

export default async function ShieldPage({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  const { note } = await searchParams;
  const user = await requireUser();
  const c = await community();
  let trust: TrustSettings | null = null;
  let trustError: string | null = null;
  try {
    trust = await gatewayAs(user).call<TrustSettings>("GET", "/gateway/trust-settings");
  } catch (err) {
    trustError = (err as Error).message.includes("403") ? "Only a Switch admin can see the Trust settings." : (err as Error).message.slice(0, 200);
  }
  const since = new Date(Date.now() - 24 * 3600_000);
  const [stats, log, rules] = await Promise.all([shieldStats(db(), since), shieldLog(db(), 60), listRules(db(), c.id)]);
  const ours = trust?.enabled && trust.policy_id === (process.env.SHIELD_POLICY_ID ?? "ferri-shield");

  return (
    <>
      <AutoRefresh seconds={10} />
      <PageHead
        title="Shield"
        sub="Scam links, link floods and leaked secrets, stopped before anyone sees them."
        about={
          <>
            <p>Switch checks every message, from people and from Ferri, with Shield before it is posted: scam and lookalike links are blocked, link floods stopped, secrets hidden.</p>
            <p>Switch waits at most 2 seconds for a check; 95% of Shield&apos;s checks took {stats.p95Ms} ms or less.</p>
          </>
        }
        action={
          trust && !ours ? (
            <form action={connectShield}>
              <button className="btn-primary">Turn Shield on</button>
            </form>
          ) : undefined
        }
      />
      <Note note={note} />

      <div className="mb-8 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-zinc-600">
        {trust ? (
          <>
            <span className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${ours ? "bg-emerald-500" : "bg-zinc-400"}`} aria-hidden />
              <b className="font-semibold text-zinc-900">{ours ? "Shield is on" : trust.enabled ? "Switch Trust uses another endpoint" : "Shield is off"}</b>
            </span>
            {ours ? (
              <form action={disconnectShield}>
                <button className="h-7 rounded-full px-2.5 text-[12px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">Turn off</button>
              </form>
            ) : null}
          </>
        ) : (
          <span className="text-zinc-500">{trustError}</span>
        )}
      </div>

      <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["Checked", stats.checked],
            ["Blocked", stats.blocked],
            ["Secrets hidden", stats.redacted],
            ["Flagged", stats.alerted],
          ] as const
        ).map(([label, n]) => (
          <div key={label} className="card-flat p-4">
            <div className="text-[12.5px] text-zinc-500">{label}</div>
            <div className="num mt-1.5 text-[28px] leading-none text-zinc-900">{n}</div>
          </div>
        ))}
        <p className="col-span-full text-[12px] text-zinc-500">Last 24 hours · slowest check {stats.maxMs} ms</p>
      </div>

      <Section title="What Shield stopped" count={log.length}>
        {log.length ? (
          <ul className="card-flat divide-y divide-zinc-100">
            {log.map((e) => (
              <li key={e.id} className="flex flex-col gap-1 px-4 py-3 text-[13px] sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`badge ${OUTCOME_STYLE[e.outcome] ?? ""}`}>{OUTCOME_LABEL[e.outcome] ?? e.outcome}</span>
                    <span className="text-zinc-800">{[...new Set(e.findings.map((f) => f.reason))].join("; ")}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[12px] text-zinc-500">
                    <PlatformLogo platform={e.platform} size={12} />
                    {platformName(e.platform)} · {short(e.spaceName)} · {e.role === "assistant" ? "an agent's post" : "a member's message"}
                    {e.alertedCrewAt ? " · crew told" : ""}
                  </div>
                </div>
                <div className="shrink-0 text-[12px] text-zinc-500 sm:text-right">
                  {ago(e.createdAt)} · {e.latencyMs} ms
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty pose="shield" title="Nothing stopped yet">
            Blocked scam links, link floods and hidden secrets show up here as they happen.
          </Empty>
        )}
      </Section>

      <Fold title="Domain rules" count={rules.length} hint="Rules apply within a few seconds">
        <Composer label="Add a domain rule" className="mb-3">
          <form action={addShieldRule} className="card flex flex-wrap items-end gap-3 p-4">
            <div className="min-w-0 flex-1 basis-[220px]">
              <label className="label" htmlFor="sh-domain">
                Domain
              </label>
              <input id="sh-domain" className="input" name="domain" placeholder="lantern-build-night.dev" required />
            </div>
            <div className="w-full sm:w-[180px]">
              <label className="label" htmlFor="sh-kind">
                Rule
              </label>
              <select id="sh-kind" className="input" name="kind" defaultValue="allow">
                <option value="allow">Allow (never flag)</option>
                <option value="block">Block (always)</option>
              </select>
            </div>
            <div className="min-w-0 flex-1 basis-[200px]">
              <label className="label" htmlFor="sh-note">
                Note (optional)
              </label>
              <input id="sh-note" className="input" name="note" placeholder="our event site" />
            </div>
            <button className="btn-primary">Add</button>
          </form>
        </Composer>
        {rules.length ? (
          <ul className="card-flat divide-y divide-zinc-100">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                <span className="min-w-0">
                  <span className={`badge ${r.kind === "block" ? OUTCOME_STYLE.blocked : "bg-emerald-50 text-emerald-700"}`}>{r.kind}</span>
                  <span className="ml-2 font-medium break-all">{r.domain}</span>
                  {r.note ? <span className="ml-2 text-zinc-500">{r.note}</span> : null}
                </span>
                <form action={removeShieldRule}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="text-[12px] text-zinc-500 hover:text-zinc-900" aria-label={`Remove the rule for ${r.domain}`}>
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <Empty quiet>No rules yet. Official domains (discord.com, github.com, lu.ma, ...) are always fine; add your event site to be sure.</Empty>
        )}
        {trust ? (
          <p className="mt-3 text-[12px] break-all text-zinc-500">
            Switch Trust endpoint {trust.endpoint} · policy {trust.policy_id ?? "none"} · key {trust.has_api_key ? `…${trust.api_key_last4}` : "none"}
          </p>
        ) : null}
      </Fold>
    </>
  );
}
