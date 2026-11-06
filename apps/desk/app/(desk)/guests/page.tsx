import Link from "next/link";
import { ago, liveEvents } from "@/lib/data";
import { community, db } from "@/lib/db";
import { GUEST_STATUSES, GUEST_STATUS_LABEL, SEND_KIND_LABEL, countsLine, guestCounts, listGuests, recentSends, rsvpUrl, type Guest } from "@/lib/ferri";
import { SEND_CHOICES, SEND_STATUS_LABEL, SYNC_SOURCE_LABEL, audienceLine, guestCardsWaiting, people, publicBase, shortWhen } from "@/lib/guests";
import { addGuest, dropGuestEmail, dropSpot, importGuests, offerSpot, requestGuestSend, saveGuestSettings, sendGuestEmail, syncGuestsNow } from "../actions";
import { AutoRefresh } from "../refresh";
import { Empty, Note, PageHead, Section } from "../ui";
import { CopyLink } from "./copy";

const STATUS_STYLE: Record<string, string> = {
  going: "border-emerald-200 bg-emerald-50 text-emerald-700",
  waitlist: "border-amber-200 bg-amber-50 text-amber-700",
  pending: "border-sky-200 bg-sky-50 text-sky-700",
  not_going: "border-zinc-200 bg-zinc-50 text-zinc-500",
};
const SEND_STYLE: Record<string, string> = {
  requested: "border-zinc-200 bg-zinc-50 text-zinc-600",
  drafting: "border-zinc-200 bg-zinc-50 text-zinc-600",
  waiting: "border-amber-200 bg-amber-50 text-amber-700",
  scheduled: "border-sky-200 bg-sky-50 text-sky-700",
  sending: "border-sky-200 bg-sky-50 text-sky-700",
  sent: "border-emerald-200 bg-emerald-50 text-emerald-700",
  dismissed: "border-zinc-200 bg-zinc-50 text-zinc-500",
  expired: "border-zinc-200 bg-zinc-50 text-zinc-500",
  failed: "border-red-200 bg-red-50 text-red-700",
};
const SOURCE_LABEL: Record<string, string> = { site: "site", luma: "Luma", import: "import", desk: "Desk" };
const ANSWER_LABEL: Record<string, string> = { yes: "said they're coming", no: "said they can't make it", take: "took the spot" };

type Search = { note?: string; event?: string; status?: string };

export default async function GuestsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { note, event: slug, status } = await searchParams;
  const c = await community();
  const evs = await liveEvents(c.id);
  const ev = evs.find((e) => e.slug === slug) ?? evs[0];
  const sub =
    "Everyone registered for the event, from the event site, Luma, imported lists and Desk. Emails to guests wait for one OK. Each guest has a private RSVP link to say they're coming or free their spot, and Ferri offers freed spots to the waitlist.";
  if (!ev) {
    return (
      <>
        <PageHead title="Guests" sub={sub} />
        <Note note={note} />
        <Empty>No live event yet. Add one on the Events page, and its guests show up here.</Empty>
      </>
    );
  }
  const filter = (GUEST_STATUSES as readonly string[]).includes(status ?? "") ? status! : null;
  const tz = c.timezone;
  const [counts, list, waiting, sends, base] = await Promise.all([
    guestCounts(db(), ev.id),
    listGuests(db(), ev.id, filter ? [filter] : undefined),
    guestCardsWaiting(),
    recentSends(db(), ev.id, 30),
    publicBase(),
  ]);
  const here = (extra?: string) => `/guests?event=${encodeURIComponent(ev.slug)}${extra ? `&${extra}` : ""}`;
  const sync = ev.guestSync ?? {};
  const sources = [...new Set(["site", "luma", ...Object.keys(sync)])];
  const left = ev.capacity ? Math.max(0, ev.capacity - counts.going) : null;
  const ids = (
    <>
      <input type="hidden" name="eventId" value={ev.id} />
      <input type="hidden" name="eventSlug" value={ev.slug} />
    </>
  );

  return (
    <>
      <AutoRefresh seconds={10} />
      <PageHead
        title="Guests"
        sub={sub}
        action={
          evs.length > 1 ? (
            <div className="flex shrink-0 flex-wrap justify-end gap-1.5 text-[12px]">
              {evs.map((e) => (
                <Link key={e.id} className={`badge ${e.id === ev.id ? "bg-zinc-900 text-white" : ""}`} href={`/guests?event=${encodeURIComponent(e.slug)}`}>
                  {e.name}
                </Link>
              ))}
            </div>
          ) : undefined
        }
      />
      <Note note={note} />

      <div className="card mb-8 p-4">
        <div className="text-[12px] font-medium text-zinc-500">{ev.name}</div>
        <div className="mt-0.5 text-[18px] font-semibold tracking-tight">{counts.total ? countsLine(counts, ev.capacity) : "Nobody has registered yet"}</div>
        <div className="mt-1 text-[13px] text-zinc-500">
          {ev.capacity
            ? left
              ? `${left} ${left === 1 ? "spot" : "spots"} left of ${ev.capacity}.`
              : `Full: ${ev.capacity} people can come, and new registrations wait on the waitlist.`
            : "No capacity set, so nobody waits on a waitlist."}
        </div>
      </div>

      <Section title={`Waiting for an OK · ${waiting.length}`}>
        {waiting.length ? (
          <div className="space-y-3">
            {waiting.map(({ card, info }) =>
              card.kind === "spot" ? (
                <div key={card.id} className="card p-4">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="badge border-emerald-200 bg-emerald-50 text-emerald-700">spot to offer</span>
                    <span className="text-[12px] text-zinc-400">
                      {info.guest ? `to ${info.guest.name} <${info.guest.email}>` : "to the next person on the waitlist"}
                      {info.guest?.registeredAt ? ` · registered ${shortWhen(info.guest.registeredAt, tz)}` : ""}
                      {evs.length > 1 && info.eventName ? ` · ${info.eventName}` : ""} · {ago(card.createdAt)}
                    </span>
                  </div>
                  <div className="text-[15px] font-medium">{card.question}</div>
                  {card.draftText ? <div className="mt-1 text-[13px] whitespace-pre-wrap text-zinc-600">{card.draftText}</div> : null}
                  <form action={offerSpot} className="mt-3 flex gap-2">
                    <input type="hidden" name="cardId" value={card.id} />
                    <input type="hidden" name="eventSlug" value={ev.slug} />
                    <button className="btn-primary">Offer it</button>
                    <button className="btn" formAction={dropSpot}>
                      Don&apos;t offer
                    </button>
                  </form>
                </div>
              ) : (
                <div key={card.id} className="card p-4">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="badge border-indigo-200 bg-indigo-50 text-indigo-700">{info.send ? (SEND_KIND_LABEL[info.send.kind] ?? info.send.kind) : "email to guests"}</span>
                    <span className="text-[12px] text-zinc-400">
                      to {audienceLine(info.send?.audience ?? "going", info.count)}
                      {evs.length > 1 && info.eventName ? ` · ${info.eventName}` : ""}
                      {info.send ? (info.send.origin === "ferri" ? " · Ferri suggested it" : ` · asked by ${info.send.requestedBy}`) : ""} {ago(card.createdAt)}
                      {info.send?.scheduledAt ? ` · goes out ${shortWhen(info.send.scheduledAt, tz)}` : " · goes out once approved"}
                    </span>
                  </div>
                  <div className="text-[15px] font-medium">{info.send?.subject ?? card.question}</div>
                  {info.send?.ask ? <div className="mt-0.5 text-[12px] text-zinc-500">Asked for: {info.send.ask}</div> : null}
                  <form action={sendGuestEmail} className="mt-3 space-y-2">
                    <input type="hidden" name="cardId" value={card.id} />
                    <input type="hidden" name="eventSlug" value={ev.slug} />
                    <label className="label">
                      Ferri&apos;s draft. Edit it to send your own version. {"{first}"} becomes each guest&apos;s first name, and Ferri adds their own RSVP link at the end.
                    </label>
                    <textarea className="textarea" name="text" rows={10} defaultValue={card.draftText ?? ""} />
                    <div className="flex gap-2">
                      <button className="btn-primary">Send it</button>
                      <button className="btn" formAction={dropGuestEmail}>
                        Don&apos;t send
                      </button>
                    </div>
                  </form>
                </div>
              ),
            )}
          </div>
        ) : (
          <Empty>Nothing is waiting. Ask for a reminder below or in the crew room (“@ferri send the guests a reminder”). When someone frees a spot, Ferri asks here before offering it.</Empty>
        )}
      </Section>

      <Section title="New email to guests">
        <form action={requestGuestSend} className="card grid grid-cols-6 gap-3 p-4">
          {ids}
          <div className="col-span-3">
            <label className="label">What to send</label>
            <select className="input" name="what" defaultValue="reminder:going">
              {SEND_CHOICES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label} ({people(s.audience === "waitlist" ? counts.waitlist : counts.going)})
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-3">
            <label className="label">Send at (optional, {tz} time)</label>
            <input className="input" type="datetime-local" name="when" />
          </div>
          <div className="col-span-6">
            <label className="label">What it should say</label>
            <textarea
              className="textarea"
              name="ask"
              rows={3}
              placeholder="Doors open at 9:30, bring your laptop and charger. Ferri drafts the email from the knowledge, and you approve it on a card."
            />
          </div>
          <div className="col-span-6 flex items-center justify-between gap-3">
            <p className="text-[12px] text-zinc-500">
              A nudge asks everyone going to confirm, or to free their spot so someone on the waitlist can come. Nothing goes out before one OK.
            </p>
            <button className="btn-primary shrink-0">Draft it</button>
          </div>
        </form>
      </Section>

      <Section
        title={`Guest list · ${counts.total}`}
        aside={
          <div className="flex flex-wrap gap-1.5 text-[12px]">
            <Link className={`badge ${!filter ? "bg-zinc-900 text-white" : ""}`} href={here()}>
              all {counts.total}
            </Link>
            {GUEST_STATUSES.filter((s) => counts[s]).map((s) => (
              <Link key={s} className={`badge ${filter === s ? "bg-zinc-900 text-white" : ""}`} href={here(`status=${s}`)}>
                {GUEST_STATUS_LABEL[s] ?? s} {counts[s]}
              </Link>
            ))}
          </div>
        }
      >
        {list.length ? (
          <div className="card overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="border-b border-zinc-100 text-left text-[11px] tracking-wide text-zinc-400 uppercase">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">From</th>
                  <th className="px-3 py-2 font-medium">Registered</th>
                  <th className="px-3 py-2 font-medium">Checked in</th>
                  <th className="px-3 py-2 font-medium">Confirmed or freed</th>
                  <th className="px-3 py-2 font-medium">RSVP link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {list.map((g) => (
                  <GuestRow key={g.id} g={g} tz={tz} url={rsvpUrl(base, g.code)} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>
            {filter
              ? `Nobody is ${GUEST_STATUS_LABEL[filter] ?? filter}.`
              : "No guests yet. They arrive from the event site and Luma on each sync, or import a list below."}
          </Empty>
        )}
      </Section>

      <Section title="Capacity and sources">
        <div className="grid grid-cols-2 gap-3">
          <form action={saveGuestSettings} className="card space-y-3 p-4">
            {ids}
            <div>
              <label className="label">Capacity (people who can come)</label>
              <input className="input" name="capacity" type="number" min={1} step={1} defaultValue={ev.capacity ?? ""} placeholder="No limit" />
              <p className="mt-1 text-[12px] text-zinc-500">Beyond it, new registrations wait on the waitlist.</p>
            </div>
            <div>
              <label className="label">Luma event</label>
              <input className="input" name="luma" defaultValue={ev.lumaEventId ?? ""} placeholder="https://luma.com/event/manage/evt-... or evt-..." />
              <p className="mt-1 text-[12px] text-zinc-500">Paste the address of the event&apos;s Manage page on Luma. Desk keeps only the evt-... id.</p>
            </div>
            <button className="btn">Save</button>
          </form>
          <div className="card p-4">
            <div className="label">Last sync</div>
            <ul className="divide-y divide-zinc-100 text-[13px]">
              {sources.map((s) => {
                const r = sync[s];
                return (
                  <li key={s} className="flex items-start justify-between gap-3 py-2">
                    <span className="font-medium">{SYNC_SOURCE_LABEL[s] ?? s}</span>
                    <span className="text-right text-zinc-500">
                      {r ? (
                        r.ok ? (
                          `${people(r.count)} · ${ago(new Date(r.at))}`
                        ) : (
                          <span className="text-red-600">
                            Failed {ago(new Date(r.at))}
                            {r.error ? `: ${r.error}` : ""}
                          </span>
                        )
                      ) : s === "luma" && !ev.lumaEventId ? (
                        "Add the Luma event to sync it."
                      ) : (
                        "Not synced yet."
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            <form action={syncGuestsNow} className="mt-3 flex items-center justify-between gap-3">
              {ids}
              <span className="text-[12px] text-zinc-500">
                {ev.guestSyncRequestedAt ? `Asked ${ago(ev.guestSyncRequestedAt)}. Ferri syncs in a few seconds.` : "Fetch the list from every source now."}
              </span>
              <button className="btn shrink-0">Sync now</button>
            </form>
          </div>
        </div>
      </Section>

      <Section title="Import a list">
        <form action={importGuests} className="card grid grid-cols-5 gap-4 p-4">
          {ids}
          <div className="col-span-3 space-y-2">
            <label className="label">Paste the CSV</label>
            <textarea className="textarea font-mono" name="csv" rows={7} placeholder={"name,email,status\nAsha K,asha@example.com,going\nRavi M,ravi@example.com,waitlist"} />
            <label className="label">Or choose a CSV file</label>
            <input className="block text-[13px] text-zinc-600 file:mr-3 file:rounded-md file:border file:border-zinc-200 file:bg-white file:px-3 file:py-1 file:text-[13px] file:font-medium" type="file" name="file" accept=".csv,.tsv,.txt,text/csv" />
          </div>
          <div className="col-span-2 flex flex-col text-[12.5px] leading-relaxed text-zinc-600">
            <p>Luma&apos;s guest export, Google Forms, Tally or any sheet saved as CSV works. The first row names the columns:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>an email column (needed);</li>
              <li>a name column, or first name and last name;</li>
              <li>a status or approval_status column, if you have one (going, approved, waitlist, pending, declined);</li>
              <li>a team column, if you have one.</li>
            </ul>
            <p className="mt-1">
              Without a status column, everyone in the file counts as going, including guests already on the list. Rows without a valid email are skipped, and nobody is added
              twice.
            </p>
            <div className="mt-auto pt-3">
              <button className="btn-primary">Import</button>
            </div>
          </div>
        </form>
        <form action={addGuest} className="card mt-3 grid grid-cols-7 gap-3 p-4">
          {ids}
          <div className="col-span-2">
            <label className="label">Name</label>
            <input className="input" name="name" required placeholder="Asha K" />
          </div>
          <div className="col-span-3">
            <label className="label">Email</label>
            <input className="input" name="email" type="email" required placeholder="asha@example.com" />
          </div>
          <div className="col-span-1">
            <label className="label">Status</label>
            <select className="input" name="status" defaultValue="going">
              {GUEST_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {GUEST_STATUS_LABEL[s] ?? s}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-1 flex items-end">
            <button className="btn w-full">Add a guest</button>
          </div>
        </form>
      </Section>

      <Section title="Sent">
        {sends.length ? (
          <div className="card divide-y divide-zinc-100">
            {sends.map((s) => (
              <div key={s.id} className="flex items-start justify-between gap-4 px-4 py-3 text-[13px]">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="badge">{SEND_KIND_LABEL[s.kind] ?? s.kind}</span>
                    <span className={`badge ${SEND_STYLE[s.status] ?? ""}`}>{SEND_STATUS_LABEL[s.status] ?? s.status}</span>
                    <span className="text-[12px] text-zinc-400">
                      to {s.audience === "listed" ? people(s.guestIds.length) : audienceLine(s.audience, null)} · {s.origin === "ferri" ? "Ferri suggested it" : `asked by ${s.requestedBy}`}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate font-medium">{s.subject ?? s.ask ?? "(no subject yet)"}</div>
                  {s.error ? <div className="mt-0.5 text-red-600">{s.error}</div> : null}
                </div>
                <div className="shrink-0 text-right text-[12px] text-zinc-500">
                  {s.total ? (
                    <div>
                      {s.sent} of {s.total} sent{s.failed ? <span className="text-red-600"> · {s.failed} failed</span> : null}
                    </div>
                  ) : null}
                  <div className="text-zinc-400">
                    {s.sentAt
                      ? `sent ${shortWhen(s.sentAt, tz)}`
                      : s.scheduledAt && s.status !== "dismissed" && s.status !== "expired"
                        ? `for ${shortWhen(s.scheduledAt, tz)}`
                        : ago(s.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>No email has gone to this event&apos;s guests yet.</Empty>
        )}
      </Section>
    </>
  );
}

function GuestRow({ g, tz, url }: { g: Guest; tz: string; url: string }) {
  const offerOpen = g.status === "waitlist" && g.offeredAt && g.offerExpiresAt && g.offerExpiresAt.getTime() > Date.now();
  return (
    <tr className="align-top">
      <td className="px-3 py-2">
        <div className="font-medium">{g.name}</div>
        {g.team ? <div className="text-[12px] text-zinc-400">team {g.team}</div> : null}
      </td>
      <td className="px-3 py-2 text-zinc-600">{g.email}</td>
      <td className="px-3 py-2">
        <span className={`badge whitespace-nowrap ${STATUS_STYLE[g.status] ?? ""}`}>{GUEST_STATUS_LABEL[g.status] ?? g.status}</span>
        {offerOpen ? <div className="mt-0.5 text-[12px] text-sky-700">offered a spot, until {shortWhen(g.offerExpiresAt, tz)}</div> : null}
        {g.rsvpAnswer && !g.rsvpHandledAt ? (
          <div className="mt-0.5 text-[12px] text-amber-700">
            {ANSWER_LABEL[g.rsvpAnswer] ?? g.rsvpAnswer} {ago(g.rsvpAt)}, updating
          </div>
        ) : null}
      </td>
      <td className="px-3 py-2 text-[12px] text-zinc-500">{g.sources.map((s) => SOURCE_LABEL[s] ?? s).join(", ") || "—"}</td>
      <td className="px-3 py-2 text-[12px] whitespace-nowrap text-zinc-500">{shortWhen(g.registeredAt, tz)}</td>
      <td className="px-3 py-2 text-[12px] whitespace-nowrap text-zinc-500">{g.checkedInAt ? shortWhen(g.checkedInAt, tz) : "—"}</td>
      <td className="px-3 py-2 text-[12px] whitespace-nowrap text-zinc-500">
        {g.confirmedAt ? `confirmed ${shortWhen(g.confirmedAt, tz)}` : g.freedAt ? `freed ${shortWhen(g.freedAt, tz)}` : "—"}
      </td>
      <td className="px-3 py-2">
        <CopyLink url={url} code={g.code} />
      </td>
    </tr>
  );
}
