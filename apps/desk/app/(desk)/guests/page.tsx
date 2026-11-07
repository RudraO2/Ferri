import Link from "next/link";
import { ago, liveEvents } from "@/lib/data";
import { community, db } from "@/lib/db";
import { GUEST_STATUSES, GUEST_STATUS_LABEL, SEND_KIND_LABEL, guestCounts, listGuests, recentSends, rsvpUrl, type Guest } from "@/lib/ferri";
import { SEND_CHOICES, SEND_STATUS_LABEL, SYNC_SOURCE_LABEL, audienceLine, guestCardsWaiting, people, publicBase, shortWhen } from "@/lib/guests";
import { addGuest, dropGuestEmail, dropSpot, importGuests, offerSpot, requestGuestSend, saveGuestSettings, sendGuestEmail, syncGuestsNow } from "../actions";
import { AutoRefresh } from "../refresh";
import { DoorOpen, Hourglass, UserCheck, UserX } from "lucide-react";
import { Composer, Empty, Fold, Note, PageHead, Section, Stat } from "../ui";
import { CopyLink } from "./copy";

const STATUS_STYLE: Record<string, string> = {
  going: "bg-emerald-50 text-emerald-700",
  waitlist: "bg-amber-50 text-amber-700",
  pending: "bg-sky-50 text-sky-700",
  not_going: "bg-zinc-100 text-zinc-500",
};
const SEND_STYLE: Record<string, string> = {
  waiting: "text-amber-700",
  scheduled: "text-sky-700",
  sending: "text-sky-700",
  sent: "text-emerald-700",
  failed: "text-red-700",
};
const SOURCE_LABEL: Record<string, string> = { site: "site", luma: "Luma", import: "import", desk: "Desk" };
const ANSWER_LABEL: Record<string, string> = { yes: "said they're coming", no: "said they can't make it", take: "took the spot" };
const quiet = "h-9 rounded-full px-3 text-[13px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900";
/** Rows shown before "more guests" folds the rest away. */
const FIRST_ROWS = 10;

type Search = { note?: string; event?: string; status?: string };

export default async function GuestsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { note, event: slug, status } = await searchParams;
  const c = await community();
  const evs = await liveEvents(c.id);
  const ev = evs.find((e) => e.slug === slug) ?? evs[0];
  const sub = "Everyone registered, from the site, Luma, imports and Desk.";
  const about = (
    <>
      <p>Emails to guests wait for one OK. Each guest has a private RSVP link to say they are coming or free their spot.</p>
      <p>When someone frees a spot, Ferri asks here before offering it to the next person on the waitlist.</p>
    </>
  );
  if (!ev) {
    return (
      <>
        <PageHead title="Guests" sub={sub} about={about} />
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
  const chip = (on: boolean) => `rounded-full px-2.5 py-1 text-[12px] font-medium ${on ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`;

  return (
    <>
      <AutoRefresh seconds={10} />
      <PageHead
        title="Guests"
        sub={sub}
        about={about}
        action={
          evs.length > 1 ? (
            <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
              {evs.map((e) => (
                <Link key={e.id} className={chip(e.id === ev.id)} href={`/guests?event=${encodeURIComponent(e.slug)}`}>
                  {e.name}
                </Link>
              ))}
            </div>
          ) : undefined
        }
      />
      <Note note={note} />

      {counts.total ? (
        <div className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Going" icon={UserCheck} value={counts.going} hint={ev.capacity ? `of ${ev.capacity} places` : "no capacity set"} />
          <Stat label="Checked in" icon={DoorOpen} value={counts.checked_in} hint={counts.going ? `${Math.round((counts.checked_in / counts.going) * 100)}% of those going` : "nobody yet"} />
          <Stat label="Waitlist" icon={Hourglass} value={counts.waitlist} hint={left ? `${left} ${left === 1 ? "spot" : "spots"} free` : ev.capacity ? "event is full" : "no waitlist"} tone={counts.waitlist ? "warn" : undefined} />
          <Stat label="Not going" icon={UserX} value={counts.not_going} hint={counts.pending ? `${counts.pending} waiting for approval` : "spots go to the waitlist"} />
        </div>
      ) : null}

      {waiting.length ? (
        <Section title="Waiting for your OK" count={waiting.length}>
          <div className="space-y-4">
            {waiting.map(({ card, info }) =>
              card.kind === "spot" ? (
                <article key={card.id} className="card p-5 sm:p-6">
                  <div className="text-[12.5px] text-zinc-500">
                    Spot to offer · {info.guest ? `${info.guest.name} <${info.guest.email}>` : "next on the waitlist"}
                    {info.guest?.registeredAt ? ` · registered ${shortWhen(info.guest.registeredAt, tz)}` : ""}
                    {evs.length > 1 && info.eventName ? ` · ${info.eventName}` : ""} · {ago(card.createdAt)}
                  </div>
                  <h3 className="mt-1 text-[16px] font-semibold text-zinc-900">{card.question}</h3>
                  {card.draftText ? <p className="mt-1 text-[13.5px] whitespace-pre-wrap text-zinc-600">{card.draftText}</p> : null}
                  <form action={offerSpot} className="mt-4 flex flex-wrap gap-2">
                    <input type="hidden" name="cardId" value={card.id} />
                    <input type="hidden" name="eventSlug" value={ev.slug} />
                    <button className="btn-primary">Offer it</button>
                    <button className={quiet} formAction={dropSpot}>
                      Don&apos;t offer
                    </button>
                  </form>
                </article>
              ) : (
                <article key={card.id} className="card p-5 sm:p-6">
                  <div className="text-[12.5px] text-zinc-500">
                    {info.send ? (SEND_KIND_LABEL[info.send.kind] ?? info.send.kind) : "Email to guests"} · to {audienceLine(info.send?.audience ?? "going", info.count)}
                    {evs.length > 1 && info.eventName ? ` · ${info.eventName}` : ""}
                    {info.send ? (info.send.origin === "ferri" ? " · Ferri suggested it" : ` · ${info.send.requestedBy}`) : ""} · {ago(card.createdAt)}
                    {info.send?.scheduledAt ? ` · goes out ${shortWhen(info.send.scheduledAt, tz)}` : ""}
                  </div>
                  <h3 className="mt-1 text-[16px] font-semibold text-zinc-900">{info.send?.subject ?? card.question}</h3>
                  {info.send?.ask ? <div className="mt-0.5 text-[12.5px] text-zinc-500">Asked for: {info.send.ask}</div> : null}
                  <form action={sendGuestEmail} className="mt-4 space-y-2.5">
                    <input type="hidden" name="cardId" value={card.id} />
                    <input type="hidden" name="eventSlug" value={ev.slug} />
                    <label className="label" htmlFor={`guest-draft-${card.id}`}>
                      Ferri&apos;s draft. {"{first}"} becomes each first name; the RSVP link is added at the end.
                    </label>
                    <textarea id={`guest-draft-${card.id}`} className="textarea" name="text" rows={8} defaultValue={card.draftText ?? ""} />
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-primary">Send it</button>
                      <button className={quiet} formAction={dropGuestEmail}>
                        Don&apos;t send
                      </button>
                    </div>
                  </form>
                </article>
              ),
            )}
          </div>
        </Section>
      ) : null}

      <Section
        title="Guest list"
        count={counts.total}
        aside={
          counts.total ? (
            <div className="flex flex-wrap gap-1.5">
              <Link className={chip(!filter)} href={here()}>
                All
              </Link>
              {GUEST_STATUSES.filter((s) => counts[s]).map((s) => (
                <Link key={s} className={chip(filter === s)} href={here(`status=${s}`)}>
                  {GUEST_STATUS_LABEL[s] ?? s} {counts[s]}
                </Link>
              ))}
            </div>
          ) : null
        }
      >
        {list.length ? (
          <>
            <GuestTable rows={list.slice(0, FIRST_ROWS)} tz={tz} base={base} head />
            {list.length > FIRST_ROWS ? (
              <Fold title={`${list.length - FIRST_ROWS} more`} className="mt-1">
                <GuestTable rows={list.slice(FIRST_ROWS)} tz={tz} base={base} />
              </Fold>
            ) : null}
          </>
        ) : filter ? (
          <Empty quiet>Nobody is {GUEST_STATUS_LABEL[filter] ?? filter}.</Empty>
        ) : (
          <Empty pose="ticket" title="No guests yet">
            They arrive from the event site and Luma on each sync, or import a list.
          </Empty>
        )}
      </Section>

      <div className="mb-10 flex flex-wrap gap-2">
        <Composer label="New email to guests" className="w-full">
          <form action={requestGuestSend} className="card grid gap-3 p-5 sm:grid-cols-2">
            {ids}
            <div>
              <label className="label" htmlFor="send-what">
                What to send
              </label>
              <select id="send-what" className="input" name="what" defaultValue="reminder:going">
                {SEND_CHOICES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label} ({people(s.audience === "waitlist" ? counts.waitlist : counts.going)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="send-when">
                Send at (optional, {tz})
              </label>
              <input id="send-when" className="input" type="datetime-local" name="when" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="send-ask">
                What it should say
              </label>
              <textarea id="send-ask" className="textarea" name="ask" rows={3} placeholder="Doors open at 9:30, bring your laptop and charger." />
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <button className="btn-primary">Draft it</button>
              <span className="text-[12.5px] text-zinc-500">Ferri drafts from the knowledge. Nothing goes out before one OK.</span>
            </div>
          </form>
        </Composer>

        <Composer label="Import or add guests" className="w-full">
          <div className="space-y-3">
            <form action={importGuests} className="card grid gap-4 p-5 sm:grid-cols-5">
              {ids}
              <div className="space-y-2 sm:col-span-3">
                <label className="label" htmlFor="import-csv">
                  Paste the CSV
                </label>
                <textarea id="import-csv" className="textarea font-mono" name="csv" rows={6} placeholder={"name,email,status\nAsha K,asha@example.com,going\nRavi M,ravi@example.com,waitlist"} />
                <label className="label" htmlFor="import-file">
                  Or choose a CSV file
                </label>
                <input
                  id="import-file"
                  className="block max-w-full text-[13px] text-zinc-600 file:mr-3 file:rounded-full file:border-0 file:bg-zinc-100 file:px-3 file:py-1 file:text-[13px] file:font-medium"
                  type="file"
                  name="file"
                  accept=".csv,.tsv,.txt,text/csv"
                />
              </div>
              <div className="flex flex-col text-[12.5px] leading-relaxed text-zinc-500 sm:col-span-2">
                <p>Any CSV works (Luma, Google Forms, Tally). It needs an email column; name, status and team are optional.</p>
                <p className="mt-1">Without a status column everyone counts as going. Nobody is added twice.</p>
                <div className="mt-auto pt-3">
                  <button className="btn-primary">Import</button>
                </div>
              </div>
            </form>
            <form action={addGuest} className="card grid gap-3 p-5 sm:grid-cols-[1fr_1.4fr_140px_auto] sm:items-end">
              {ids}
              <div>
                <label className="label" htmlFor="guest-name">
                  Name
                </label>
                <input id="guest-name" className="input" name="name" required placeholder="Asha K" />
              </div>
              <div>
                <label className="label" htmlFor="guest-email">
                  Email
                </label>
                <input id="guest-email" className="input" name="email" type="email" required placeholder="asha@example.com" />
              </div>
              <div>
                <label className="label" htmlFor="guest-status">
                  Status
                </label>
                <select id="guest-status" className="input" name="status" defaultValue="going">
                  {GUEST_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {GUEST_STATUS_LABEL[s] ?? s}
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn">Add a guest</button>
            </form>
          </div>
        </Composer>
      </div>

      <Fold title="Sent emails" count={sends.length} className="mb-2">
        {sends.length ? (
          <ul className="card-flat divide-y divide-zinc-100">
            {sends.map((s) => (
              <li key={s.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-3 text-[13px]">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-zinc-900">{s.subject ?? s.ask ?? "(no subject yet)"}</div>
                  <div className="mt-0.5 text-[12px] text-zinc-500">
                    {SEND_KIND_LABEL[s.kind] ?? s.kind} · <span className={SEND_STYLE[s.status] ?? ""}>{SEND_STATUS_LABEL[s.status] ?? s.status}</span> · to{" "}
                    {s.audience === "listed" ? people(s.guestIds.length) : audienceLine(s.audience, null)} · {s.origin === "ferri" ? "Ferri suggested it" : s.requestedBy}
                  </div>
                  {s.error ? <div className="mt-0.5 text-[12px] text-red-700">{s.error}</div> : null}
                </div>
                <div className="shrink-0 text-right text-[12px] text-zinc-500">
                  {s.total ? (
                    <div>
                      {s.sent} of {s.total} sent{s.failed ? <span className="text-red-700"> · {s.failed} failed</span> : null}
                    </div>
                  ) : null}
                  <div>
                    {s.sentAt
                      ? `sent ${shortWhen(s.sentAt, tz)}`
                      : s.scheduledAt && s.status !== "dismissed" && s.status !== "expired"
                        ? `for ${shortWhen(s.scheduledAt, tz)}`
                        : ago(s.createdAt)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty quiet>No email has gone to this event&apos;s guests yet.</Empty>
        )}
      </Fold>

      <Fold title="Capacity and sync" hint={ev.capacity ? `${ev.capacity} places` : "no capacity set"}>
        <div className="grid gap-3 md:grid-cols-2">
          <form action={saveGuestSettings} className="card-flat space-y-3 p-5">
            {ids}
            <div>
              <label className="label" htmlFor="guest-capacity">
                Capacity
              </label>
              <input id="guest-capacity" className="input" name="capacity" type="number" min={1} step={1} defaultValue={ev.capacity ?? ""} placeholder="No limit" />
              <p className="mt-1 text-[12px] text-zinc-500">Beyond it, new registrations wait on the waitlist.</p>
            </div>
            <div>
              <label className="label" htmlFor="guest-luma">
                Luma event
              </label>
              <input id="guest-luma" className="input" name="luma" defaultValue={ev.lumaEventId ?? ""} placeholder="https://luma.com/event/manage/evt-..." />
              <p className="mt-1 text-[12px] text-zinc-500">The event&apos;s Manage page address. Desk keeps only the evt-... id.</p>
            </div>
            <button className="btn">Save</button>
          </form>
          <div className="card-flat p-5">
            <div className="label">Last sync</div>
            <ul className="divide-y divide-zinc-100 text-[13px]">
              {sources.map((s) => {
                const r = sync[s];
                return (
                  <li key={s} className="flex items-start justify-between gap-3 py-2">
                    <span className="font-medium text-zinc-900">{SYNC_SOURCE_LABEL[s] ?? s}</span>
                    <span className="text-right text-zinc-500">
                      {r ? (
                        r.ok ? (
                          `${people(r.count)} · ${ago(new Date(r.at))}`
                        ) : (
                          <span className="text-red-700">
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
              <span className="text-[12px] text-zinc-500">{ev.guestSyncRequestedAt ? `Asked ${ago(ev.guestSyncRequestedAt)}. Syncing in a few seconds.` : "Fetch every source now."}</span>
              <button className="btn shrink-0">Sync now</button>
            </form>
          </div>
        </div>
      </Fold>
    </>
  );
}

/**
 * The guest table. Fixed column widths, so the first rows and the folded rest line up.
 * On phones only name and status show; the page itself never scrolls sideways.
 */
function GuestTable({ rows, tz, base, head }: { rows: Guest[]; tz: string; base: string; head?: boolean }) {
  return (
    <div className="card-flat overflow-x-auto">
      <table className="w-full table-fixed text-[13px]">
        {head ? (
          <thead className="border-b border-zinc-100 text-left text-[12px] text-zinc-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="w-[132px] px-3 py-2.5 font-medium">Status</th>
              <th className="hidden w-[80px] px-3 py-2.5 font-medium md:table-cell">From</th>
              <th className="hidden w-[110px] px-3 py-2.5 font-medium lg:table-cell">Checked in</th>
              <th className="hidden w-[150px] px-3 py-2.5 font-medium sm:table-cell">RSVP link</th>
            </tr>
          </thead>
        ) : null}
        <tbody className="divide-y divide-zinc-100">
          {rows.map((g) => (
            <GuestRow key={g.id} g={g} tz={tz} url={rsvpUrl(base, g.code)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GuestRow({ g, tz, url }: { g: Guest; tz: string; url: string }) {
  const offerOpen = g.status === "waitlist" && g.offeredAt && g.offerExpiresAt && g.offerExpiresAt.getTime() > Date.now();
  return (
    <tr className="align-top">
      <td className="px-4 py-2.5">
        <div className="truncate font-medium text-zinc-900">{g.name}</div>
        <div className="truncate text-[12px] text-zinc-500" title={`Registered ${shortWhen(g.registeredAt, tz)}`}>
          {g.email}
          {g.team ? ` · team ${g.team}` : ""}
        </div>
      </td>
      <td className="w-[132px] px-3 py-2.5">
        <span className={`badge ${STATUS_STYLE[g.status] ?? ""}`}>{GUEST_STATUS_LABEL[g.status] ?? g.status}</span>
        {g.confirmedAt ? <div className="mt-0.5 text-[12px] text-zinc-500">confirmed</div> : g.freedAt ? <div className="mt-0.5 text-[12px] text-zinc-500">freed</div> : null}
        {offerOpen ? <div className="mt-0.5 text-[12px] text-sky-700">offered, until {shortWhen(g.offerExpiresAt, tz)}</div> : null}
        {g.rsvpAnswer && !g.rsvpHandledAt ? (
          <div className="mt-0.5 text-[12px] text-amber-700">
            {ANSWER_LABEL[g.rsvpAnswer] ?? g.rsvpAnswer} {ago(g.rsvpAt)}, updating
          </div>
        ) : null}
      </td>
      <td className="hidden w-[80px] px-3 py-2.5 text-[12px] text-zinc-500 md:table-cell">{g.sources.map((s) => SOURCE_LABEL[s] ?? s).join(", ") || "—"}</td>
      <td className="hidden w-[110px] px-3 py-2.5 text-[12px] whitespace-nowrap text-zinc-500 lg:table-cell">{g.checkedInAt ? shortWhen(g.checkedInAt, tz) : "—"}</td>
      <td className="hidden w-[150px] px-3 py-2.5 sm:table-cell">
        <CopyLink url={url} code={g.code} />
      </td>
    </tr>
  );
}
