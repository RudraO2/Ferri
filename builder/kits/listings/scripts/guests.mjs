/**
 * The guest list of an event listed on Luma, from the host's own Guests tab in
 * the Builder's browser (spec 17). Luma's public API needs Luma Plus; the
 * Guests tab needs only the host's session.
 *
 *   node <kit>/scripts/guests.mjs list   --event <evt-... | manage URL> [--out guests.json]
 *       read-only: every guest with their status, as JSON on stdout (or in --out)
 *   node <kit>/scripts/guests.mjs status --event <evt-...> --email <guest email> --to going|not_going|waitlist [--quiet]
 *       change one guest, the way the host does in the guest's panel. "going" for a
 *       waitlisted guest is Luma's Admit (Luma emails them). --quiet unticks
 *       "Notify Guest", so Luma sends them nothing (for someone who freed their own spot).
 *       This is a public step: the Builder's permission rules ask first, and Ferri
 *       runs it only after the crew's card.
 *
 * The Guests tab loads its rows from Luma's own `event/admin/get-guests`; this
 * script reads that answer, it does not call anything the page would not.
 * Luma's "Download as CSV" needs a person to confirm access first
 * (`auth/sudo-mode-required`), so it is not used.
 *
 * Exit codes: 0 done, 1 error, 2 usage, 5 a person is needed (not logged in).
 */
import fs from "node:fs";
import { EXIT, args, connect, disconnect, settings, stop } from "./lib.mjs";

const { positional, flags } = args();
const cmd = positional[0];
const s = settings();

/** `evt-...` from an id, an event manage URL or any URL that carries it. */
function eventId(v) {
  const m = /evt-[A-Za-z0-9]+/.exec(String(v ?? ""));
  return m ? m[0] : null;
}

const STATUS_WORD = { approved: "going", waitlist: "waitlist", declined: "not_going", pending_approval: "pending", invited: "pending" };

function guestOut(e) {
  const g = e.guest ?? e;
  return {
    id: g.api_id,
    name: g.name || [g.first_name, g.last_name].filter(Boolean).join(" ") || g.email,
    email: g.email,
    lumaStatus: g.approval_status,
    status: STATUS_WORD[g.approval_status] ?? "not_going",
    registeredAt: g.registered_at ?? g.created_at ?? null,
    checkedInAt: g.checked_in_at ?? null,
  };
}

async function openGuests(context, evt) {
  const page = await context.newPage();
  const first = page.waitForResponse((r) => /\/event\/admin\/get-guests\?/.test(r.url()), { timeout: 25_000 }).catch(() => null);
  await page.goto(`https://luma.com/event/manage/${evt}/guests`, { waitUntil: "domcontentloaded" });
  const resp = await first;
  if (!resp || resp.status() === 401 || resp.status() === 403 || /sign|login/i.test(new URL(page.url()).pathname)) {
    await page.close().catch(() => {});
    return { page: null, resp: null };
  }
  return { page, resp };
}

if (cmd === "list") {
  const evt = eventId(flags.event);
  if (!evt) stop(EXIT.usage, "list needs --event evt-... (or the event's manage URL).");
  const { browser, context } = await connect(s);
  try {
    const { page, resp } = await openGuests(context, evt);
    if (!page || !resp) stop(EXIT.needsPerson, "The Builder's browser is not logged in to Luma as this event's host. Log in there, then run it again.");
    let body = await resp.json();
    const entries = [...(body.entries ?? [])];
    // More than one page: the same request the table makes when it scrolls.
    for (let i = 0; body.has_more && body.next_cursor && i < 50; i++) {
      const url = new URL(resp.url());
      url.searchParams.set("pagination_cursor", body.next_cursor);
      body = await page.evaluate(async (u) => (await fetch(u, { credentials: "include" })).json(), url.toString());
      entries.push(...(body.entries ?? []));
    }
    await page.close().catch(() => {});
    const out = { platform: "luma", event: evt, source: "browser", at: new Date().toISOString(), guests: entries.map(guestOut) };
    if (typeof flags.out === "string") fs.writeFileSync(flags.out, `${JSON.stringify(out, null, 2)}\n`);
    console.log(JSON.stringify(out));
  } finally {
    await disconnect(browser);
  }
  process.exit(EXIT.ok);
}

if (cmd === "status") {
  const evt = eventId(flags.event);
  const email = typeof flags.email === "string" ? flags.email.trim().toLowerCase() : null;
  const to = flags.to;
  if (!evt || !email || !["going", "not_going", "waitlist"].includes(to)) stop(EXIT.usage, "status needs --event evt-... --email <guest email> --to going|not_going|waitlist [--quiet]");
  const quiet = flags.quiet === true;
  const { browser, context } = await connect(s);
  try {
    const { page, resp } = await openGuests(context, evt);
    if (!page || !resp) stop(EXIT.needsPerson, "The Builder's browser is not logged in to Luma as this event's host. Log in there, then run it again.");
    const guest = ((await resp.json()).entries ?? []).map(guestOut).find((g) => g.email?.toLowerCase() === email);
    if (!guest) stop(EXIT.usage, `${email} is not a guest of ${evt}.`);
    if (guest.status === to) {
      console.log(JSON.stringify({ ok: true, unchanged: true, guest }));
      process.exit(EXIT.ok);
    }
    const row = page.locator("[role=button]").filter({ hasText: email }).first();
    await row.waitFor({ timeout: 15_000 });
    await row.click();
    await page.getByRole("button", { name: /^Report Guest$/ }).waitFor({ timeout: 10_000 });
    const done = page.waitForResponse((r) => /\/event\/admin\/[a-z-]*guest[a-z-]*/.test(r.url()) && r.request().method() === "POST", { timeout: 20_000 }).catch(() => null);
    const admit = page.getByRole("dialog").getByRole("button", { name: /^Admit$/ });
    if (to === "going" && guest.status === "waitlist" && !quiet && (await admit.count())) {
      await admit.first().click();
    } else {
      // The status pill opens the status dialog: the new status, "Notify Guest", Update Status.
      await page.getByRole("dialog").getByRole("button", { name: /^(Going|Waitlisted|Not Going|Pending|Declined|Invited)/ }).first().click();
      await page.getByPlaceholder("Choose new status").click();
      const word = { going: "Going", not_going: "Not Going", waitlist: "Waitlisted" }[to];
      await page.getByRole("option", { name: new RegExp(`^${word}$`, "i") }).first().click();
      const notify = page.locator("label").filter({ hasText: /Notify Guest/ }).first();
      const box = notify.locator("input[type=checkbox]");
      const checked = (await box.count()) ? await box.first().isChecked() : null;
      if (checked !== null && checked === quiet) await notify.click();
      if (typeof flags.shot === "string") await page.screenshot({ path: flags.shot, type: "jpeg", quality: 60 });
      await page.getByText("Update Status", { exact: true }).click({ force: true });
    }
    const r = await done;
    if (r && !r.ok()) stop(EXIT.error, `Luma refused the change (${r.status()}).`);
    const sent = r ? JSON.parse(r.request().postData() ?? "{}") : {};
    await page.close().catch(() => {});
    // Read the list again: the guest's status as Luma has it now is the answer.
    const again = await openGuests(context, evt);
    const now = again.resp ? ((await again.resp.json()).entries ?? []).map(guestOut).find((g) => g.email?.toLowerCase() === email) : null;
    await again.page?.close().catch(() => {});
    if (!now || now.status !== to) stop(EXIT.error, `Luma still shows ${email} as ${now?.status ?? "unknown"}, not ${to}.`);
    console.log(JSON.stringify({ ok: true, guest: now, notified: r ? sent.suppress_email === false : !quiet }));
  } finally {
    await disconnect(browser);
  }
  process.exit(EXIT.ok);
}

stop(EXIT.usage, "Usage: guests.mjs list --event evt-... [--out file] | status --event evt-... --email <e> --to going|not_going|waitlist [--quiet]");
