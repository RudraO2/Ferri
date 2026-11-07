import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { contactCounts, contactsWithTimeline, EMAIL_OFF_NOTE, emailsWaiting, MESSAGE_LABEL, outreachMailbox } from "@/lib/contacts";
import { ago, liveEvents } from "@/lib/data";
import { community } from "@/lib/db";
import { CONTACT_KINDS, CONTACT_STATUS_LABEL, CONTACT_STATUSES } from "@/lib/ferri";
import { addContact, dropOutreach, markContact, requestEmail, sendOutreach } from "../actions";
import { AutoRefresh } from "../refresh";
import { Composer, Empty, Note, PageHead, Section } from "../ui";

const STATUS_STYLE: Record<string, string> = {
  interested: "bg-emerald-50 text-emerald-700",
  partner: "bg-emerald-100 text-emerald-800",
  replied: "bg-sky-50 text-sky-700",
  emailed: "bg-zinc-100 text-zinc-700",
  drafted: "bg-amber-50 text-amber-700",
  declined: "bg-zinc-100 text-zinc-500",
  bounced: "bg-red-50 text-red-700",
  do_not_contact: "bg-red-50 text-red-700",
};

const quiet = "h-9 rounded-full px-3 text-[13px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900";
const subSummary =
  "inline-flex cursor-pointer list-none items-center gap-1 text-[12.5px] font-medium text-zinc-500 hover:text-zinc-900 [&::-webkit-details-marker]:hidden";

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ note?: string; status?: string }> }) {
  const { note, status } = await searchParams;
  const c = await community();
  const [waiting, list, counts, evs] = await Promise.all([emailsWaiting(), contactsWithTimeline(status), contactCounts(), liveEvents(c.id)]);
  const mailbox = outreachMailbox();
  return (
    <>
      <AutoRefresh seconds={10} />
      <PageHead
        title="Contacts"
        sub="Partners, sponsors, colleges, venues and communities."
        about={
          mailbox ? (
            <p>Every email to them waits for one OK, goes out from {mailbox}, and their replies come back here. Ask in the crew room (“@ferri find colleges that could sponsor Build Night”, “@ferri email CloudCo about sponsoring”).</p>
          ) : (
            <p>{EMAIL_OFF_NOTE}</p>
          )
        }
      />
      <Note note={note} />

      {waiting.length ? (
        <Section title="Emails waiting for your OK" count={waiting.length}>
          <div className="space-y-4">
            {waiting.map((w) => (
              <article key={w.cardId} className="card p-5 sm:p-6">
                <div className="text-[12.5px] text-zinc-500">
                  {w.reply ? "Reply" : "New email"} to {w.contact.person ? `${w.contact.person}, ` : ""}
                  {w.contact.org} · {w.askedBy ?? "the crew"} · {ago(w.createdAt)}
                </div>
                <h3 className="mt-1 text-[16px] font-semibold text-zinc-900">{w.subject}</h3>
                <div className="text-[12px] text-zinc-500">{w.contact.email}</div>
                <form action={sendOutreach} className="mt-3 space-y-2.5">
                  <input type="hidden" name="cardId" value={w.cardId} />
                  <label className="sr-only" htmlFor={`draft-${w.cardId}`}>
                    Ferri&apos;s draft
                  </label>
                  <textarea id={`draft-${w.cardId}`} className="textarea" name="text" rows={10} defaultValue={w.draft} />
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-primary">Send it</button>
                    <button className={quiet} formAction={dropOutreach}>
                      Don&apos;t send
                    </button>
                  </div>
                </form>
              </article>
            ))}
          </div>
        </Section>
      ) : null}

      <Composer label="Add a contact">
        <form action={addContact} className="card grid gap-3 p-5 sm:grid-cols-6">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="ct-org">
              Organization
            </label>
            <input id="ct-org" className="input" name="org" required placeholder="CloudCo" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="ct-person">
              Person (optional)
            </label>
            <input id="ct-person" className="input" name="person" placeholder="Asha K" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="ct-email">
              Email (optional)
            </label>
            <input id="ct-email" className="input" name="email" type="email" placeholder="partners@cloudco.example" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="ct-kind">
              Kind
            </label>
            <select id="ct-kind" className="input" name="kind" defaultValue="company">
              {CONTACT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="ct-event">
              Event
            </label>
            <select id="ct-event" className="input" name="eventId" defaultValue={evs[0]?.id ?? ""}>
              {evs.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
              <option value="">No event (community)</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="ct-site">
              Website (optional)
            </label>
            <input id="ct-site" className="input" name="website" placeholder="https://cloudco.example" />
          </div>
          <div className="sm:col-span-6">
            <label className="label" htmlFor="ct-why">
              Why they fit (optional)
            </label>
            <input id="ct-why" className="input" name="why" placeholder="Runs a developer credits program for student hackathons" />
          </div>
          <div className="sm:col-span-6">
            <button className="btn-primary">Add contact</button>
          </div>
        </form>
      </Composer>

      <Section
        title="Contacts"
        count={counts.all ?? 0}
        aside={
          <nav aria-label="Filter by status" className="flex flex-wrap gap-1 text-[12px]">
            <Link className={`badge ${!status ? "bg-zinc-900 text-white" : ""}`} href="/contacts" aria-current={!status ? "page" : undefined}>
              All {counts.all ?? 0}
            </Link>
            {CONTACT_STATUSES.filter((s) => counts[s]).map((s) => (
              <Link key={s} className={`badge ${status === s ? "bg-zinc-900 text-white" : ""}`} href={`/contacts?status=${s}`} aria-current={status === s ? "page" : undefined}>
                {CONTACT_STATUS_LABEL[s]} {counts[s]}
              </Link>
            ))}
          </nav>
        }
      >
        {list.length ? (
          <div className="card-flat divide-y divide-zinc-100">
            {list.map((x) => (
              <details key={x.id} className="group px-4 py-3.5 text-[13px]">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 [&::-webkit-details-marker]:hidden">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-medium text-zinc-900">{x.org}</span>
                      <span className={`badge ${STATUS_STYLE[x.status] ?? ""}`}>{CONTACT_STATUS_LABEL[x.status] ?? x.status}</span>
                    </div>
                    <div className="mt-0.5 truncate text-[12.5px] text-zinc-500">
                      {x.person ? `${x.person} · ` : ""}
                      {x.kind !== "other" ? `${x.kind} · ` : ""}
                      {x.email ?? "no published address"}
                    </div>
                    {x.worked.length ? (
                      <div className="mt-0.5 text-[12px] text-emerald-700">{x.worked.map((w) => `Worked with us on ${w.eventName} (${w.role})`).join(" · ")}</div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 text-right text-[12px] text-zinc-500">
                    {x.messages.length ? `${x.messages.length} email${x.messages.length === 1 ? "" : "s"} · ` : ""}
                    {ago(x.lastReplyAt ?? x.lastEmailAt ?? x.createdAt)}
                    <ChevronDown size={14} className="text-zinc-400 transition group-open:rotate-180" aria-hidden />
                  </div>
                </summary>
                <div className="mt-3 space-y-3 border-l-2 border-zinc-100 pl-3">
                  <div className="text-[12px] text-zinc-500">
                    {x.why ? <div className="mb-1 text-[13px] text-zinc-700">{x.why}</div> : null}
                    Added by {x.addedBy} {ago(x.createdAt)}
                    {x.source ? (
                      <>
                        {" "}
                        · source:{" "}
                        {/^https:\/\//.test(x.source) ? (
                          <a className="break-all underline underline-offset-2" href={x.source} target="_blank" rel="noreferrer">
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
                    <div key={m.id} className={`rounded-[12px] px-3 py-2 ${m.direction === "in" ? "bg-sky-50" : "bg-zinc-100"}`}>
                      <div className="flex flex-wrap items-center gap-x-2 text-[12px] text-zinc-500">
                        <span className="font-medium text-zinc-700">{m.direction === "in" ? `From ${m.fromAddress ?? x.org}` : `To ${m.toAddress ?? x.email}`}</span>
                        <span>
                          {MESSAGE_LABEL[m.status] ?? m.status} · {ago(m.sentAt ?? m.createdAt)}
                          {m.direction === "out" && m.requestedBy ? ` · asked by ${m.requestedBy}` : ""}
                        </span>
                      </div>
                      {m.subject ? <div className="mt-1 font-medium">{m.subject}</div> : null}
                      {m.reading ? (
                        <div className="mt-1 text-zinc-700">
                          <span className="font-medium">{m.reading.want.replace(/_/g, " ")}:</span> {m.reading.summary} <span className="text-zinc-500">Next: {m.reading.next}</span>
                        </div>
                      ) : null}
                      {m.text ? (
                        <div className="mt-1 whitespace-pre-wrap text-zinc-600">{m.text.length > 1500 ? `${m.text.slice(0, 1500)}…` : m.text}</div>
                      ) : m.ask ? (
                        <div className="mt-1 text-zinc-500">Asked: {m.ask}</div>
                      ) : null}
                      {m.error ? <div className="mt-1 text-red-700">{m.error}</div> : null}
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {x.email && x.status !== "do_not_contact" && x.status !== "bounced" ? (
                      <details className="group/d w-full">
                        <summary className={subSummary}>
                          Draft an email
                          <ChevronDown size={13} className="transition group-open/d:rotate-180" aria-hidden />
                        </summary>
                        <form action={requestEmail} className="mt-2 space-y-2">
                          <input type="hidden" name="contactId" value={x.id} />
                          <label className="sr-only" htmlFor={`ask-${x.id}`}>
                            What the email should ask or tell them
                          </label>
                          <textarea id={`ask-${x.id}`} className="textarea" name="ask" rows={2} placeholder="What it should ask or tell them. Ferri drafts it; you approve it on a card." />
                          <button className="btn">Draft it</button>
                        </form>
                      </details>
                    ) : null}
                    <details className="group/s w-full">
                      <summary className={subSummary}>
                        Status and notes
                        <ChevronDown size={13} className="transition group-open/s:rotate-180" aria-hidden />
                      </summary>
                      <form action={markContact} className="mt-2 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="contactId" value={x.id} />
                        <div>
                          <label className="label" htmlFor={`st-${x.id}`}>
                            Status
                          </label>
                          <select id={`st-${x.id}`} className="input" name="status" defaultValue={x.status}>
                            {CONTACT_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {CONTACT_STATUS_LABEL[s]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="min-w-0 flex-1 basis-[200px]">
                          <label className="label" htmlFor={`nt-${x.id}`}>
                            Notes
                          </label>
                          <input id={`nt-${x.id}`} className="input" name="notes" defaultValue={x.notes ?? ""} />
                        </div>
                        <button className="btn">Save</button>
                      </form>
                    </details>
                  </div>
                </div>
              </details>
            ))}
          </div>
        ) : (
          <Empty pose="carry" title={status ? `No contacts marked ${CONTACT_STATUS_LABEL[status] ?? status}` : "No contacts yet"}>
            Try “@ferri find colleges and companies that could sponsor Build Night” in the crew room, or add one.
          </Empty>
        )}
      </Section>
    </>
  );
}
