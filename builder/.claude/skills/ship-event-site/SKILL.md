---
name: ship-event-site
description: Build and ship a community event's full website (landing, registration, sign-in, schedule, FAQ, sponsor credit claiming, admin view) on Vercel with a Supabase database, from the kit in kits/event-site. Use it when a job asks for the event site, a registration site, a site with sign-in or credits, or to put the event site live.
---

# Ship the event site

You ship the event's site from the kit in `kits/event-site` (Next.js, Supabase, plain CSS). The kit already does registration, sign-in, "my registration", sponsor credit claiming (atomic, one code per person per sponsor, audit log, revoke), a guest list with a waitlist (each registration is going, waitlist or cancelled; people free their spot or register again on "my registration"; Ferri reads and moves guests through `/api/ferri/guests`) and an admin view. Your work: fill in the event's facts, create its database, deploy it, and report. Work through the steps in order. Keep the crew informed with one short message when you start and one when it is live; nothing in between unless something needs them.

Never write a key, a password or a secret into the room, a report or a file outside the job folder.

## 0. Settings
Read `.ferri/site.json` in your working folder. It has `supabase.orgId`, `supabase.region`, `vercel.scope`, `hook.url`, `hook.secret`, `admins` (organizer emails). If it is missing, report `Job <id> stuck:` and ask the crew to run `pnpm builder:setup`.

The slug is the event name in lowercase with dashes (`lantern-build-night`). It names both the Supabase project and the Vercel project, so a second run reuses them.

## 1. Copy the kit
Copy `kits/event-site` (everything except `node_modules`, `.next`, `.vercel`) to `jobs/<job folder>/site/`. Work inside that folder from here on.

## 2. The event's facts
Read the room's documents with `load_internal_documents` (Ferri's knowledge and the event plan). Write `content/event.json` with exactly the shape of `EventContent` in `lib/event.ts`:
- name, tagline (one line), community, dates, timeLine, venue (name, address, mapUrl only if the documents give a link, notes), about (2 or 3 short paragraphs), whoCanJoin, schedule (days with time and what), faq (the members' common questions with their answers), sponsors (name and what participants get), rules, contact, registration (closes, note, open), capacity, accent (a CSS colour that suits the event).
- capacity: how many people the room holds, as a number, only when the documents give one (a venue limit, "100 seats"). Once that many are going, new registrations join the waitlist. No number in the documents: `null` (no limit, everyone is going, no waitlist). Never guess it, and never leave it as a placeholder.
- Use only what the documents say. Decided items in the plan win over older knowledge. A fact you cannot find stays a placeholder in square brackets (`"[venue address]"`), which the page shows highlighted; list every placeholder in your report.

## 3. Check it builds
`npm ci` then `npm run build`. Fix anything you broke in `content/event.json`. Do not change the kit's code unless the build fails because of it.

## 4. The database (Supabase)
Run `node scripts/supabase-up.mjs <slug> <absolute path to .ferri/site.json>` from the site folder. It creates the Supabase project (or reuses the one with the slug's name), waits until it is up, and applies the schema: every file in `supabase/migrations`, the guest list (RSVP) migration included. The database password stays in `.env.local`; it prints nothing secret. A brand-new project takes 2 to 4 minutes; let the script wait. If it fails, read its message, fix what it says, and run it again (it is safe to repeat). On a second job for the same event, copy `.env.local` from the earlier job's site folder first.

## 5. The Vercel project
Run `node scripts/vercel-env.mjs <slug> <absolute path to .ferri/site.json> <job id>`. It links the Vercel project and sets the production variables (the Supabase address and keys, the admins, Ferri's hook) without printing any value.

## 5b. Real email
Run `node scripts/supabase-email.mjs https://<slug>.vercel.app <absolute path to .ferri/site.json> "<event name>"`. With the community's email set up, Supabase then sends sign-in links and email confirmations from the community's domain: registration sends a link to confirm the address, and the sign-in page offers "Email me a link". Exit 3 means no email is set up: the site creates confirmed accounts as before; say so in your report. It prints the auth settings it changed (the password only as a hash).

## 6. Go live (the public step)
Run exactly this once, from the site folder: `npx vercel deploy --prod --yes --scope <scope> > deploy.log 2>&1; cat deploy.log`. This puts the site on the public web, so Switch asks the crew on a card first: wait for it. Do not ask a second time with your own card for this step.

- Never run the deploy command a second time to see its output. Read `deploy.log`, or run `npx vercel ls <slug> --scope <scope>` (no card): a deployment marked Ready in Production means the site is live.
- The production address is `https://<slug>.vercel.app` (or the alias `deploy.log` shows). Check it answers: `node -e "fetch('<url>').then(r=>console.log(r.status))"` should print 200.
- If the card is declined, nothing is live: post one line saying the site is ready but not published, report `Job <id> stuck: deploy was declined`, and stop.

## 7. Tell the crew
1. In the room, one message: the live address, what is on it, the placeholders still to fill, and that organizers sign in with their crew email to reach /admin (register first with that email).
2. Report to ferri: `Job <id> done: The site is live at <url>.` followed by one sentence on what is on it. The live address must be the first link in the report; Ferri reads it.

## Running it again
A second job for the same event (new facts, a fix) runs the same steps: the projects are found and reused, `db push` applies only new migrations, and the deploy card asks again.
