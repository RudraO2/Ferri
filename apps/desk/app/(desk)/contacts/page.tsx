import Link from "next/link";
import { contactCounts, contactsWithTimeline, emailsWaiting, MESSAGE_LABEL } from "@/lib/contacts";
import { ago, liveEvents } from "@/lib/data";
import { community } from "@/lib/db";
import { CONTACT_KINDS, CONTACT_STATUS_LABEL, CONTACT_STATUSES } from "@/lib/ferri";
import { addContact, dropOutreach, markContact, requestEmail, sendOutreach } from "../actions";
import { AutoRefresh } from "../refresh";
import { Empty, Note, PageHead, Section } from "../ui";

const STATUS_STYLE: Record<string, string> = {
  interested: "border-emerald-200 bg-emerald-50 text-emerald-700",
  partner: "border-emerald-300 bg-emerald-100 text-emerald-800",
  replied: "border-sky-200 bg-sky-50 text-sky-700",
  emailed: "border-zinc-200 bg-zinc-50 text-zinc-700",
  drafted: "border-amber-200 bg-amber-50 text-amber-700",
  declined: "border-zinc-200 bg-zinc-50 text-zinc-500",
  bounced: "border-red-200 bg-red-50 text-red-700",
  do_not_contact: "border-red-200 bg-red-50 text-red-700",
};

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ note?: string; status?: string }> }) {
  const { note, status } = await searchParams;
  const c = await community();
  const [waiting, list, counts, evs] = await Promise.all([emailsWaiting(), contactsWithTimeline(status), contactCounts(), liveEvents(c.id)]);
  return (
    <>
      <AutoRefresh seconds={10} />
      <PageHead
        title="Contacts"
        sub="Partners, sponsors, colleges, venues and communities. Every email to them waits for one OK, goes out from partners@rudratechie.xyz, and their replies come back here."
      />
      <Note note={note} />

      <Section title={`Emails waiting for an OK · ${waiting.length}`}>
        {waiting.length ? (
          <div className="space-y-3">
            {waiting.map((w) => (
              <div key={w.cardId} className="card p-4">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="badge">{w.reply ? "reply" : "new email"}</span>
                  <span className="text-[12px] text-zinc-400">
                    to {w.contact.person ? `${w.contact.person}, ` : ""}
                    {w.contact.org} &lt;{w.contact.email}&gt; · asked by {w.askedBy ?? "the crew"} {ago(w.createdAt)}
                  </span>
                </div>
                <div className="text-[15px] font-medium">{w.subject}</div>
                <form action={sendOutreach} className="mt-3 space-y-2">
                  <input type="hidden" name="cardId" value={w.cardId} />
                  <label className="label">Ferri&apos;s draft (edit it to send your own version)</label>
                  <textarea className="textarea" name="text" rows={10} defaultValue={w.draft} />
                  <div className="flex gap-2">
                    <button className="btn-primary">Send it</button>
                    <button className="btn" formAction={dropOutreach}>
                      Don&apos;t send
                    </button>
                  </div>
                </form>
              </div>
            ))}
          </div>
        ) : (
          <Empty>No email is waiting. Ask in the crew room (“@ferri email CloudCo about sponsoring”), or use Draft an email on a contact below.</Empty>
        )}
      </Section>

      <Section
        title={`Contacts · ${counts.all ?? 0}`}
        aside={
          <div className="flex flex-wrap gap-1.5 text-[12px]">
            <Link className={`badge ${!status ? "bg-zinc-900 text-white" : ""}`} href="/contacts">
              all {counts.all ?? 0}
            </Link>
            {CONTACT_STATUSES.filter((s) => counts[s]).map((s) => (
              <Link key={s} className={`badge ${status === s ? "bg-zinc-900 text-white" : ""}`} href={`/contacts?status=${s}`}>
                {CONTACT_STATUS_LABEL[s]} {counts[s]}
              </Link>
            ))}
          </div>
        }
      >
        {list.length ? (
          <div className="card divide-y divide-zinc-100">
            {list.map((x) => (
              <details key={x.id} className="group px-4 py-3 text-[13px]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{x.org}</span>
                      <span className={`badge ${STATUS_STYLE[x.status] ?? ""}`}>{CONTACT_STATUS_LABEL[x.status] ?? x.status}</span>
                      {x.kind !== "other" ? <span className="text-[12px] text-zinc-400">{x.kind}</span> : null}
                    </div>
                    <div className="mt-0.5 truncate text-zinc-500">
                      {x.person ? `${x.person} · ` : ""}
                      {x.email ?? "no published address"}
                      {x.why ? ` · ${x.why}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-[12px] text-zinc-400">
                    {x.messages.length ? `${x.messages.length} email${x.messages.length === 1 ? "" : "s"} · ` : ""}
                    {ago(x.lastReplyAt ?? x.lastEmailAt ?? x.createdAt)}
                  </div>
                </summary>
                <div className="mt-3 space-y-3 border-l-2 border-zinc-100 pl-3">
                  <div className="text-[12px] text-zinc-500">
                    Added by {x.addedBy} {ago(x.createdAt)}
                    {x.source ? (
                      <>
                        {" "}
                        · source:{" "}
                        {/^https:\/\//.test(x.source) ? (
                          <a className="underline underline-offset-2" href={x.source} target="_blank" rel="noreferrer">
                            {x.source}
                          </a>
                        ) : (
                          x.source
                        )}
                      </>
                    ) : null}
                    {x.website ? (
                      <>
                        {" "}
                        ·{" "}
                        <a className="underline underline-offset-2" href={x.website} target="_blank" rel="noreferrer">
                          website
                        </a>
                      </>
                    ) : null}
                  </div>
                  {x.messages.map((m) => (
                    <div key={m.id} className={`rounded-md px-3 py-2 ${m.direction === "in" ? "bg-sky-50" : "bg-zinc-50"}`}>
                      <div className="flex flex-wrap items-center gap-2 text-[12px] text-zinc-500">
                        <span className="font-medium text-zinc-700">{m.direction === "in" ? `From ${m.fromAddress ?? x.org}` : `To ${m.toAddress ?? x.email}`}</span>
                        <span className="badge">{MESSAGE_LABEL[m.status] ?? m.status}</span>
                        <span>{ago(m.sentAt ?? m.createdAt)}</span>
                        {m.direction === "out" && m.requestedBy ? <span>· asked by {m.requestedBy}</span> : null}
                      </div>
                      {m.subject ? <div className="mt-1 font-medium">{m.subject}</div> : null}
                      {m.reading ? (
                        <div className="mt-1 text-zinc-700">
                          <span className="font-medium">{m.reading.want.replace(/_/g, " ")}:</span> {m.reading.summary} <span className="text-zinc-500">Next: {m.reading.next}</span>
                        </div>
                      ) : null}
                      {m.text ? <div className="mt-1 whitespace-pre-wrap text-zinc-600">{m.text.length > 1500 ? `${m.text.slice(0, 1500)}…` : m.text}</div> : m.ask ? <div className="mt-1 text-zinc-500">Asked: {m.ask}</div> : null}
                      {m.error ? <div className="mt-1 text-red-600">{m.error}</div> : null}
                    </div>
                  ))}
                  {x.email && x.status !== "do_not_contact" && x.status !== "bounced" ? (
                    <form action={requestEmail} className="space-y-2">
                      <input type="hidden" name="contactId" value={x.id} />
                      <label className="label">Draft an email</label>
                      <textarea className="textarea" name="ask" rows={2} placeholder="What it should ask or tell them (Ferri drafts it from the knowledge; you approve it on a card)." />
                      <button className="btn">Draft it</button>
                    </form>
                  ) : null}
                  <form action={markContact} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="contactId" value={x.id} />
                    <div>
                      <label className="label">Status</label>
                      <select className="input" name="status" defaultValue={x.status}>
                        {CONTACT_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {CONTACT_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-[240px] flex-1">
                      <label className="label">Notes</label>
                      <input className="input" name="notes" defaultValue={x.notes ?? ""} />
                    </div>
                    <button className="btn">Save</button>
                  </form>
                </div>
              </details>
            ))}
          </div>
        ) : (
          <Empty>No contacts{status ? ` marked ${CONTACT_STATUS_LABEL[status] ?? status}` : ""} yet. Ask in the crew room (“@ferri find colleges and companies that could sponsor Build Night”), or add one below.</Empty>
        )}
      </Section>

      <Section title="Add a contact">
        <form action={addContact} className="card grid grid-cols-6 gap-3 p-4">
          <div className="col-span-2">
            <label className="label">Organization</label>
            <input className="input" name="org" required placeholder="CloudCo" />
          </div>
          <div className="col-span-2">
            <label className="label">Person (optional)</label>
            <input className="input" name="person" placeholder="Asha K" />
          </div>
          <div className="col-span-2">
            <label className="label">Email (optional)</label>
            <input className="input" name="email" type="email" placeholder="partners@cloudco.example" />
          </div>
          <div className="col-span-2">
            <label className="label">Kind</label>
            <select className="input" name="kind" defaultValue="company">
              {CONTACT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">Event</label>
            <select className="input" name="eventId" defaultValue={evs[0]?.id ?? ""}>
              {evs.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
              <option value="">No event (community)</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">Website (optional)</label>
            <input className="input" name="website" placeholder="https://cloudco.example" />
          </div>
          <div className="col-span-5">
            <label className="label">Why they fit (optional)</label>
            <input className="input" name="why" placeholder="Runs a developer credits program for student hackathons" />
          </div>
          <div className="col-span-1 flex items-end">
            <button className="btn-primary w-full">Add</button>
          </div>
        </form>
      </Section>
    </>
  );
}
