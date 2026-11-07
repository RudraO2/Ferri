# RSVP and the guest list

Ferri keeps one guest list per event, from wherever people registered, and keeps it moving: reminders, "can you still come?", and a freed spot passed to the next person on the waitlist.

- Sources: the event site the Builder ships (a status per registration, a capacity with a waitlist, a "Free my spot" button, and a guest list route for Ferri), Luma (Ferri reads the host's Guests tab in the Builder's own browser, with no model call; Luma's API needs Luma Plus, so the browser is the default), and a CSV pasted in Desk (Luma's export, Google Forms, any sheet with names and emails).
- In the crew room: `@ferri remind the guests to bring their laptop, charger and a photo ID, doors open at 9 AM`, `@ferri ask everyone who can't come to free their spot`, `@ferri how many are coming?`, `@ferri sync the guest list`.
- Every send is one Switch card with the audience, how many people, the subject and the whole email as a guest will get it. One OK sends one personal email per guest ("Hi Asha,") from `<event name> <events@...>` (the address in `FERRI_GUEST_EMAIL_FROM`), with their own RSVP link. "Don't send" sends nothing. At most 80 guest emails a day by default.
- The RSVP link is Desk's public `/rsvp/<code>` page: "I'm coming" or "I can't make it". A reply to the email works too: Ferri reads it and the crew room hears it.
- A freed spot opens one card: "Asha can't come. Offer the spot to Ravi, first on the waitlist?". Yes on Luma: the Builder's browser admits Ravi (Luma emails him) and sets Asha to Not Going without a notice. On the site or a list: Ravi gets an offer email and 24 hours to say yes.
- Ferri proposes the day-before reminder and a "free your spot" nudge itself, once per event, on a card like any other.
- Desk's Guests page shows the counts, the list with its sources and last sync, Import CSV, Sync now, and the sends waiting for an OK. Pocket shows guest and spot cards.
- What we checked, on a private Luma test event with test guests on our own domain: the Luma sync, a CSV import, a declined reminder (no mail) and a sent one (delivered), a guest freeing her spot on the RSVP page, Luma admitting the next guest after the spot card, an emailed "I can't make it" read and applied, and the day-before reminder proposed once. The site's guest route was checked on a local copy of the site against the live database, and again on the live site after its redeploy (refused without the key, the list with it). The emailed spot offer (for the site or a CSV list) is built but was not run live, because the test had a Luma waitlist.

## Turn it on

- **Guest emails**: set up Email ([email.md](email.md)) with `FERRI_GUEST_EMAIL_FROM`. `FERRI_GUEST_EMAIL_DAILY_CAP` (80) is the daily cap, and `FERRI_GUEST_EMAIL_ALLOW=<your domain>` emails only guests at that domain, for rehearsals.
- **The RSVP page**: guests answer on Desk's public `/rsvp/<code>` page, so set `FERRI_PUBLIC_URL` to Desk's public address ([pocket.md](pocket.md)).
- **Guests from the event site**: `FERRI_SITE_HOOK_SECRET` is the shared secret the site uses for its hook to Desk and for its guest list route. `pnpm builder:setup` writes it ([builder.md](builder.md)).
- **Guests from Luma**: Luma guests are read in the Builder's own browser, so log in to Luma there once ([builder.md](builder.md#the-builder-lists-the-event-on-luma-and-other-platforms)).
- `FERRI_GUEST_SYNC_SECONDS` (600) is how often each live event's guests are synced from Luma and the site.
