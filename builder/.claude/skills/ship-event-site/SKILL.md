---
name: ship-event-site
description: Build and ship a community event's full website (landing, registration, sign-in, schedule, FAQ, sponsor credit claiming, admin view) on Vercel with a Supabase database, from the kit in kits/event-site, in the event's own look. Use it when a job asks for the event site, a registration site, a site with sign-in or credits, or to put the event site live.
---

# Ship the event site

You ship the event's site from the kit in `kits/event-site` (Next.js, Supabase, plain CSS). The kit already does registration, sign-in, "my registration", sponsor credit claiming (atomic, one code per person per sponsor, audit log, revoke), a guest list with a waitlist (each registration is going, waitlist or cancelled; people free their spot or register again on "my registration"; Ferri reads and moves guests through `/api/ferri/guests`) and an admin view. Your work: fill in the event's facts, give the site the event's own look (matching its posters), check it in a browser, create its database, deploy it, and report. Work through the steps in order. Keep the crew informed with one short message when you start and one when it is live; nothing in between unless something needs them.

Never write a key, a password or a secret into the room, a report or a file outside the job folder.

## 0. Settings
Read `.ferri/site.json` in your working folder. It has `supabase.orgId`, `supabase.region`, `vercel.scope`, `hook.url`, `hook.secret`, `admins` (organizer emails). If it is missing, report `Job <id> stuck:` and ask the crew to run `pnpm builder:setup`.

The slug is the event name in lowercase with dashes (`lantern-build-night`). It names both the Supabase project and the Vercel project, so a second run reuses them.

## 1. Posters first, when the job asks for both
If the job also asks for a poster or social cards, make them first: call your `make-posters` skill with the Skill tool and follow it in this job's folder, up to and including posting the images in the room, but do not report to ferri yet. Their QR code points at `https://<slug>.vercel.app`, the site's address once it is live. Then come back here: the site takes its look from them, and your one report at the end covers both.

## 2. Copy the kit
Copy `kits/event-site` (everything except `node_modules`, `.next`, `.vercel`) to `jobs/<job folder>/site/`. Work inside that folder from here on.

## 3. The event's facts
Read the room's documents with `load_internal_documents` (Ferri's knowledge and the event plan). Write `content/event.json` with exactly the shape of `EventContent` in `lib/event.ts`:
- name, tagline (one line), community, dates, timeLine, venue (name, address, mapUrl only if the documents give a link, notes), about (2 or 3 short paragraphs), whoCanJoin, schedule (days with time and what), faq (the members' common questions with their answers), sponsors (name and what participants get), rules, contact, registration (closes, note, open), capacity, accent (a CSS colour that suits the event; the poster's accent replaces it when there is a poster).
- name: exactly as the documents write it. The posters are found by this name.
- capacity: how many people the room holds, as a number, only when the documents give one (a venue limit, "100 seats"). Once that many are going, new registrations join the waitlist. No number in the documents: `null` (no limit, everyone is going, no waitlist). Never guess it, and never leave it as a placeholder.
- Use only what the documents say. Decided items in the plan win over older knowledge. A fact you cannot find stays a placeholder in square brackets (`"[venue address]"`), which the page shows highlighted; list every placeholder in your report.

## 4. The event's look
Each event gets its own look, and the site matches the event's posters, social cards and listing cover.

1. Take the posters' look. From the site folder: `node scripts/poster-look.mjs`. It finds this event's newest poster job in `jobs/` (its `design.json` names the same event) and gives the site the poster's accent, fonts and background art (the hero), the poster's link card as the preview image when the link is shared, and the community logo. It prints what it took. With no poster job it says so, and the site keeps the kit's own look with the accent from `content/event.json`. If you know the poster job (you made it in step 1, or the crew named one), pass it: `--poster jobs/<poster job folder>`. Never edit `content/look.json` or `public/poster/` by hand; run the script again.
2. Design the landing page. Call your `frontend-design` skill with the Skill tool and follow it: ground the design in this event (what it is, who comes, the community, the place), write the short plan (palette as named hex values, type, layout, the one memorable thing), check it against the event, then build it.
   - With a poster look, keep the poster's accent (`--accent`), fonts (`--font-display`, `--font-body`) and hero art, and build the palette around them, so the site and the posters read as one event.
   - Change only how it looks: `app/page.tsx` (the landing page's layout and markup), `app/globals.css`, and the header and footer markup in `app/layout.tsx`. Keep every fact from `content/event.json` on the page (placeholders shown highlighted, as `T` does), the register button and its `/register` link, the `#schedule` and `#faq` anchors, and the forms as they are. Never change `app/actions.ts`, `lib/`, `app/api/`, `app/auth/`, `app/admin/`, `app/me/`, `supabase/`, `scripts/`, `content/look.json` or the shape of `content/event.json`.
   - Plain CSS, no new packages, no external scripts, no font links (the poster's fonts are already in the site). Light and dark, mobile first, visible keyboard focus, motion only when `prefers-reduced-motion` allows it, text that reads on the art.
   - If your design still breaks the build or the page check after two tries, copy the kit's `app/page.tsx`, `app/globals.css` and `app/layout.tsx` back from `kits/event-site` and go on with the kit's look (it still takes the poster's look).

## 5. Check it builds
`npm ci` then `npm run build`. Fix anything you broke in `content/event.json` or in your design. Do not change the kit's other code unless the build fails because of it.

## 6. Check the page in a browser
Your `webapp-testing` skill gives the method: start the server, wait for the network to settle, take screenshots, read the console. Its Python helpers need Python Playwright, which this machine does not have, so use the page check, which does the same on Node with the installed Chrome or Edge. From the site folder:

`node ../../../kits/page-check/scripts/shots.mjs --site .`

(from your working folder it is `node kits/page-check/scripts/shots.mjs --site jobs/<job folder>/site`). It starts the site on a local port only (nothing is public), opens the home page, `/register` and `/login` at desktop (1440 px) and phone (390 px) width, in light and dark, writes screenshots to the job folder's `shots/`, and lists problems: console errors, failed requests, sideways scrolling and what causes it, broken images, images without alt text, fonts that did not load, animations that ignore reduced motion.
- Look at the screenshots with the Read tool: at least the first screen of the home page at desktop and phone, light and dark, and the rest of the home page at phone width. Look for what a visitor would notice: text that is hard to read on the art, overlapping or cut-off text, a crowded phone layout, parts of the dark scheme that do not read, a hero that does not look like the posters.
- Fix what looks broken and every problem it lists, then run it again with `--build` (it builds the site again first). Three rounds at most; a problem you cannot fix goes in your report.
- Exit 0: no problems. 4: problems, listed. 1: the build or the server failed; read the message. 3: no Chrome or Edge on this machine; go on without screenshots and say so in your report.

## 7. The database (Supabase)
Run `node scripts/supabase-up.mjs <slug> <absolute path to .ferri/site.json>` from the site folder. It creates the Supabase project (or reuses the one with the slug's name), waits until it is up, and applies the schema: every file in `supabase/migrations`, the guest list (RSVP) migration included. The database password stays in `.env.local`; it prints nothing secret. A brand-new project takes 2 to 4 minutes; let the script wait. If it fails, read its message, fix what it says, and run it again (it is safe to repeat). On a second job for the same event, copy `.env.local` from the earlier job's site folder first.

## 8. The Vercel project
Run `node scripts/vercel-env.mjs <slug> <absolute path to .ferri/site.json> <job id>`. It links the Vercel project and sets the production variables (the Supabase address and keys, the admins, Ferri's hook, the site's own address for link previews) without printing any value.

## 8b. Real email
Run `node scripts/supabase-email.mjs https://<slug>.vercel.app <absolute path to .ferri/site.json> "<event name>"`. With the community's email set up, Supabase then sends sign-in links and email confirmations from the community's domain: registration sends a link to confirm the address, and the sign-in page offers "Email me a link". Exit 3 means no email is set up: the site creates confirmed accounts as before; say so in your report. It prints the auth settings it changed (the password only as a hash).

## 9. Go live (the public step)
Run exactly this once, from the site folder: `npx vercel deploy --prod --yes --scope <scope> > deploy.log 2>&1; cat deploy.log`. This puts the site on the public web, so Switch asks the crew on a card first: wait for it. Do not ask a second time with your own card for this step.

- Never run the deploy command a second time to see its output. Read `deploy.log`, or run `npx vercel ls <slug> --scope <scope>` (no card): a deployment marked Ready in Production means the site is live.
- The production address is `https://<slug>.vercel.app` (or the alias `deploy.log` shows). Check it answers: `node -e "fetch('<url>').then(r=>console.log(r.status))"` should print 200.
- If the live address is not the one on the posters you made in step 1, fix `url` in their `design.json`, run the poster kit's `render.mjs` again (no new art) and post the corrected images.
- If the card is declined, nothing is live: post the screenshots with one line saying the site is ready but not published, report `Job <id> stuck: deploy was declined`, and stop.

## 10. Tell the crew
1. In the room, one `send_attachment` with the screenshots the page check named for the room (the home page at desktop and phone width, and in dark when the site has a dark scheme, from `shots/`) and a caption: the live address, what is on it, that it matches the posters when it does, the placeholders still to fill, and that organizers sign in with their crew email to reach /admin (register first with that email). Posters you made in step 1 are already in the room; do not post them again.
2. Report to ferri: `Job <id> done: The site is live at <url>.` followed by one sentence on what is on it, and the poster file names if you made posters in this job. The live address must be the first link in the report; Ferri reads it.

## Running it again
A second job for the same event (new facts, a fix, new posters) runs the same steps: the projects are found and reused, `db push` applies only new migrations, the look comes from the newest poster job again, the page check runs again, and the deploy card asks again.
