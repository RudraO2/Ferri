import { ago } from "@/lib/data";
import { community, db } from "@/lib/db";
import { listRules, shieldLog, shieldStats } from "@/lib/shield";
import { gatewayAs, requireUser } from "@/lib/session";
import { addShieldRule, connectShield, disconnectShield, removeShieldRule } from "../actions";
import { AutoRefresh } from "../refresh";
import { Empty, Note, PageHead, Section } from "../ui";

interface TrustSettings {
  endpoint: string;
  policy_id: string | null;
  has_api_key: boolean;
  api_key_last4: string | null;
  enabled: boolean;
}

const OUTCOME_STYLE: Record<string, string> = {
  blocked: "border-red-200 bg-red-50 text-red-700",
  redacted: "border-amber-200 bg-amber-50 text-amber-700",
  alerted: "border-sky-200 bg-sky-50 text-sky-700",
};
const PLATFORM: Record<string, string> = { telegram: "Telegram", slack: "Slack", discord: "Discord", mattermost: "Mattermost", whatsapp: "WhatsApp", whatsapp_web: "WhatsApp" };
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
        sub="Switch checks every message, from people and from Ferri, with Shield before anyone sees it: scam and lookalike links are blocked, link floods stopped, secrets hidden."
      />
      <Note note={note} />

      <Section title="Connection">
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="text-[13px]">
            {trust ? (
              <>
                <span className={`badge ${ours ? "border-emerald-200 bg-emerald-50 text-emerald-700" : ""}`}>{ours ? "on" : trust.enabled ? "another endpoint" : "off"}</span>
                <span className="ml-2 text-zinc-600">
                  Switch Trust endpoint {trust.endpoint} · policy {trust.policy_id ?? "none"} · key {trust.has_api_key ? `…${trust.api_key_last4}` : "none"}
                </span>
              </>
            ) : (
              <span className="text-zinc-500">{trustError}</span>
            )}
          </div>
          {trust ? (
            ours ? (
              <form action={disconnectShield}>
                <button className="btn">Turn Shield off</button>
              </form>
            ) : (
              <form action={connectShield}>
                <button className="btn-primary">Turn Shield on</button>
              </form>
            )
          ) : null}
        </div>
      </Section>

      <Section title="Last 24 hours">
        <div className="grid grid-cols-5 gap-3">
          {[
            ["checked", stats.checked],
            ["blocked", stats.blocked],
            ["secrets hidden", stats.redacted],
            ["flagged", stats.alerted],
            ["slowest check", `${stats.maxMs} ms`],
          ].map(([label, n]) => (
            <div key={String(label)} className="card p-3">
              <div className="text-[20px] font-semibold tracking-tight">{n}</div>
              <div className="text-[12px] text-zinc-500">{label}</div>
            </div>
          ))}
        </div>
        <p className="muted mt-2">Switch waits at most 2 seconds for a check; 95% of Shield&apos;s checks took {stats.p95Ms} ms or less.</p>
      </Section>

      <Section title={`What Shield stopped · ${log.length}`}>
        {log.length ? (
          <div className="card divide-y divide-zinc-100">
            {log.map((e) => (
              <div key={e.id} className="flex items-start justify-between gap-4 px-4 py-2.5 text-[13px]">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`badge ${OUTCOME_STYLE[e.outcome] ?? ""}`}>{e.outcome}</span>
                    <span className="text-zinc-500">
                      {PLATFORM[e.platform ?? ""] ?? e.platform ?? "Switch"} · {short(e.spaceName)} · {e.role === "assistant" ? "an agent's post" : "a member's message"}
                    </span>
                  </div>
                  <div className="mt-1 text-zinc-800">{[...new Set(e.findings.map((f) => f.reason))].join("; ")}</div>
                </div>
                <div className="shrink-0 text-right text-[12px] text-zinc-400">
                  {ago(e.createdAt)} · {e.latencyMs} ms
                  {e.alertedCrewAt ? <div>crew told</div> : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>Nothing stopped yet.</Empty>
        )}
      </Section>

      <Section title="Domains">
        <div className="card space-y-3 p-4">
          <form action={addShieldRule} className="flex flex-wrap items-end gap-2">
            <div className="w-[260px]">
              <label className="label">Domain</label>
              <input className="input" name="domain" placeholder="lantern-build-night.dev" required />
            </div>
            <div className="w-[160px]">
              <label className="label">Rule</label>
              <select className="input" name="kind" defaultValue="allow">
                <option value="allow">Allow (never flag)</option>
                <option value="block">Block (always)</option>
              </select>
            </div>
            <div className="min-w-[200px] flex-1">
              <label className="label">Note (optional)</label>
              <input className="input" name="note" placeholder="our event site" />
            </div>
            <button className="btn-primary">Add</button>
          </form>
          {rules.length ? (
            <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200">
              {rules.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                  <span>
                    <span className={`badge ${r.kind === "block" ? OUTCOME_STYLE.blocked : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{r.kind}</span>
                    <span className="ml-2 font-medium">{r.domain}</span>
                    {r.note ? <span className="ml-2 text-zinc-500">{r.note}</span> : null}
                  </span>
                  <form action={removeShieldRule}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="text-[12px] text-zinc-500 hover:text-zinc-900">Remove</button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No rules yet. Official domains (discord.com, github.com, lu.ma, ...) are always fine; add your event site to be sure.</p>
          )}
          <p className="muted">Rules apply to the next message, within a few seconds.</p>
        </div>
      </Section>
    </>
  );
}
