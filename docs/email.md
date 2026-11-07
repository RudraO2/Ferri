# Partner outreach by email

Events need sponsors, venues, colleges and other communities. Ferri finds them, writes to them from the community's own address, and keeps track of every reply, in a light CRM.

- `@ferri find colleges and companies in Bengaluru that could sponsor or host Build Night` is a Builder job with the `find-partners` skill ([builder.md](builder.md)). The Builder searches the web and lists organizations that fit, each with an email address only when it is published on a page that names it, and that page as the source. It never guesses an address. Ferri adds them to Contacts as prospects. Nobody is emailed.
- `@ferri email CloudCo about sponsoring cloud credits` drafts the email from the knowledge (no invented numbers) and puts all of it on a Switch card: To, From, Subject and the body. "Send it" sends it through Resend from the outreach address you set (`FERRI_EMAIL_FROM`, for example `partners@example.com`). "Don't send" sends nothing, and a version written in quotes is sent instead. A cold email ends with one line: reply "no thanks" and we won't write again.
- Each contact has its own reply-to address (`partners+<code>@...`), so a reply always finds its contact. Resend's webhook reaches Desk's `/api/email`, which checks the Svix signature. Ferri fetches the email, keeps it on the contact's timeline and tells the crew in their room what the partner said and what to do next. For a question or a yes, it drafts the answer on a new card. "no thanks" marks the contact "do not contact", and Ferri refuses to write to them again. A bounce or a spam report does the same.
- At most 20 outreach emails a day (`FERRI_EMAIL_DAILY_CAP`). Desk's Contacts page lists every contact by status with its timeline, the emails waiting for an OK, "Draft an email" and "Add a contact". Pocket shows the email cards in Needs you.
- `@ferri who have we heard back from?` answers from the contacts.

The same domain gives the event site real email. Supabase sends its auth emails through Resend's SMTP from the site's sender address (`FERRI_SITE_EMAIL_FROM`; `scripts/supabase-email.mjs` in the site kit). Registering sends a link that confirms the address and signs in, and the sign-in page offers "Email me a link".

## Turn it on

Email goes through Resend. Your sending domain must be verified in Resend for sending, and for receiving too if Ferri should read replies.

1. In `.env`:

   ```
   RESEND_API_KEY=re_...                       # a full-access key (resend.com, API keys)
   FERRI_EMAIL_FROM=partners@example.com   # outreach mailbox
   FERRI_GUEST_EMAIL_FROM=events@example.com   # guest emails (RSVP), optional
   FERRI_PUBLIC_URL=https://...                # Desk's public address, for Resend's webhook
   ```

   `FERRI_PUBLIC_URL` is Desk behind HTTPS ([pocket.md](pocket.md) shows a quick tunnel).

2. Run `./ferri email:setup`. It checks the Resend domain, creates the webhook to `FERRI_PUBLIC_URL/api/email`, and saves its secret (`RESEND_WEBHOOK_SECRET`) to `.env`. Safe to run again.
3. Restart Desk and Ferri: `docker compose restart ferri desk`.

`./ferri doctor` shows Email as on when sending works and the webhook secret is set.

Limits and test settings:

- `FERRI_EMAIL_DAILY_CAP` (20) limits outreach and `FERRI_GUEST_EMAIL_DAILY_CAP` (80) limits guest emails.
- For a rehearsal, `FERRI_GUEST_EMAIL_ALLOW=<your domain>` emails only guests at that domain and skips the rest.
- For the event site's sign-in emails: `FERRI_SITE_SMTP_PASS` (a send-only Resend key) and `FERRI_SITE_EMAIL_FROM`, then `pnpm builder:setup` on the Builder's machine.
