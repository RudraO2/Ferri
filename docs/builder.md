# Ferri Builder: a coding agent that Switch runs

Some event work is making things: the event's one-page site, a day-of checklist, a sponsor one-pager, a poster. Ferri hands that to Ferri Builder, a second agent with its own sandbox.

- The Builder is a Switch managed agent: Claude Code on a Switch agent controller on the organizer's machine (the headless controller runs natively on Windows with `run`). Ferri creates it through Switch's agent management. It works in its own folder (`~/.ferri/builder`, seeded from `builder/` in this repo) with its own Claude home, so the organizer's personal Claude settings never reach it. It runs Claude Sonnet 5.5 at medium effort by default; our tests run it on Claude Haiku 5.5 at low effort ([testing.md](testing.md)).
- In the crew room: `@ferri get the builder to make a one-page site for Build Night`, `@ferri can you make us a day-of checklist with owners from the plan?`. Ferri records job B1, invites the Builder to the room and hands it over with `send_targeted_message`. Switch starts a Builder session, which posts a heads-up, shows its work as an activity card, reads the event's knowledge and plan from the room's Switch documents, and posts the files in the room. It reports "Job B1 done:" to Ferri, which closes the job and pushes the person who asked.
- Nothing goes public without a yes. The Builder asks with a Switch card before any public step (deploy, push, email, post), and its permission rules make every such command a Claude Code permission prompt, which Switch shows as a card too. The card is answered in the room, in Desk or in Pocket; a no means nothing is published.
- Its own budget in Switch (400k output tokens and 60 turns per 24 hours by default). When it is spent Switch stops the Builder, and Ferri holds new jobs until the reset.
- Desk's Builder page shows the Builder and its machine as Switch reports them, the budget spend, the cards waiting for you, every job with its report, files and live address, a form for new jobs and a Cancel button. Pocket shows the Builder's cards in Needs you.

## Turn it on

The Builder runs on a real machine, not in Docker, because it is Claude Code working in a folder of its own. Run these on the machine that will host it (your laptop is fine), next to a running stack (`./ferri up`):

1. Install Node 22, pnpm, and Claude Code (`npm i -g @anthropic-ai/claude-code`).
2. In this repo:

   ```bash
   pnpm install
   pnpm builder:setup        # enrolls this machine, Ferri creates the Builder, sets its addressing and budget
   pnpm builder:controller   # in its own terminal: runs the Builder; keep it running
   ```

   `pnpm builder:setup` downloads Switch's headless agent controller once (release [`ferri-controller-0.1.1`](https://github.com/RudraO2/switch/releases/tag/ferri-controller-0.1.1) on our Switch fork, checked against its SHA-256). Upstream Switch publishes no release of the controller yet, so we packaged it. To use your own build instead, set `SWITCH_CONTROLLER_CLI` to its `cli.mjs`.

   The first time, `pnpm builder:setup` waits for the controller, so start `pnpm builder:controller` in another terminal when it asks.

3. `pnpm builder:setup` writes `FERRI_BUILDER_ROOT` (the Builder's folder on this machine) to `.env`. Run `./ferri up` once more so Ferri and Desk in the stack can read the Builder's job files.

Stopping the controller stops the Builder. The controller reads its env file only at start: restart it after `pnpm builder:setup` changes it. It is safe to run `pnpm builder:setup` again.

One controller enrollment belongs to one Switch. To point the Builder at another stack on the same machine (a second checkout, a fresh test stack), set `SWITCH_CONTROLLER_DATA_DIR` to a new folder in your shell before `pnpm builder:setup` and before `pnpm builder:controller`; `pnpm builder:setup` stops with that advice when the existing enrollment names another server. The Builder's job folders in `~/.ferri/builder/jobs` stay; a new stack numbers its jobs from B1 again, so move old job folders aside if the new event reuses an old event's name (the site takes its look from that event's newest poster job).

Settings in `.env` (re-run `pnpm builder:setup` after changing them):

- `FERRI_BUILDER_MODEL`, `FERRI_BUILDER_EFFORT`: the Builder's model and effort (`claude-sonnet-5-5` and `medium` by default, for real use; tests set `claude-haiku-5-5` and `low`). After a change, run `pnpm builder:setup` again and restart `pnpm builder:controller`.
- `FERRI_BUILDER_BUDGET_OUTPUT`, `FERRI_BUILDER_BUDGET_TURNS`: its Switch budget per 24 hours.
- `FERRI_BUILDER_NAME`, `FERRI_BUILDER_MACHINE`, `FERRI_BUILDER_HOME`: its name in Switch, the machine name, and its folders.

The Switch in the stack has the `agent_management` feature flag on, which the Builder needs. `./ferri doctor` shows the Builder as on when its machine is online.

## The Builder ships the event site

`@ferri get the builder to ship the Build Night site with registration and sponsor credits` ends with a live site on Vercel and Supabase. Our own demo run shipped the made-up demo event this way: https://lantern-build-night.vercel.app.

- The Builder works from a kit in `builder/kits/event-site` (Next.js, Supabase, plain CSS) and a Claude Code skill, `ship-event-site`. It fills the site with the event's facts from the crew room's Switch documents and leaves anything missing as a visible placeholder.
- Each event gets its own look. The kit's `scripts/poster-look.mjs` gives the site the look of the event's newest poster job: the poster's accent, its fonts (the same font files), its art behind the hero, its link card as the preview image when someone shares the link, and the community logo. Then the Builder designs the landing page with Anthropic's `frontend-design` skill around that look. Asked for posters and a site together, it makes the posters first. Without posters the site keeps the kit's own look.
- Before it asks to deploy, the Builder checks its own page in a browser, the way Anthropic's `webapp-testing` skill does it (start the server, wait for the network, screenshot, read the console), with our page check kit (`builder/kits/page-check`: Node and `playwright-core` on the installed Chrome or Edge, headless, no Python, no browser download). It looks at the home page, `/register` and `/login` at desktop and 390 px width, in light and dark, and gets a list of console errors, failed requests, sideways scrolling, broken images, missing alt text and animations that ignore reduced motion. It fixes what looks broken and posts the screenshots with the live address.
- It creates the Supabase project and applies the schema, then sets the Vercel environment, with two scripts that never print a key. Its `vercel deploy --prod` becomes a Switch card for the crew; nothing goes live without "Allow".
- The site has registration (with a capacity, a waitlist and "Free my spot", which feed Ferri's guest list), sign-in, "my registration", the schedule, FAQ and rules, and sponsor credit claiming: an organizer pastes a sponsor's single-use codes, each registered participant claims one per sponsor in one atomic database call, every claim and revoke is in an audit log, and organizers can revoke. Organizers (the crew's Switch emails) get an admin view with counts, registrations as CSV and the credit pools.
- When it is live, Ferri allows the domain in Shield and opens the "site is live" announcement card: one OK posts it to every space and saves the link as knowledge, so "where do I register?" gets the link with its source.
- The site reports back through Desk's public address (`POST /api/site` with a shared secret): the first registration and every tenth, and a sponsor's credit pool running low, reach the crew room, and the leads get a push.

What it needs on the Builder's machine, in `.env` before `pnpm builder:setup`:

- The Supabase CLI and the Vercel CLI, both signed in.
- Chrome or Edge, for the page check's screenshots. Without one the Builder ships the site without screenshots and says so.
- `FERRI_SITE_SUPABASE_ORG` and `FERRI_SITE_SUPABASE_REGION` (the Supabase organization and region), `FERRI_SITE_VERCEL_SCOPE` (the Vercel scope), and `FERRI_SITE_ADMINS` (extra organizer emails for the admin view).
- `FERRI_PUBLIC_URL`, Desk's public https address, so the site can report back ([pocket.md](pocket.md) shows how to get one). `pnpm builder:setup` writes the shared secret, `FERRI_SITE_HOOK_SECRET`.
- For the site's sign-in emails through Resend: `FERRI_SITE_SMTP_PASS` (a send-only Resend key) and `FERRI_SITE_EMAIL_FROM` ([email.md](email.md)).

## The Builder makes the posters and social cards

`@ferri get the builder to make the Build Night poster and social cards` ends with a print poster and a card for every platform, all with the same exact text.

- The background art comes from an image model (`gpt-image-2.6-flare`, one call per job, at most two). It is never asked to write words.
- Every word, the date, the venue, the address and a QR code are drawn on top by Satori from a `design.json` the Builder fills from the room's documents, so there are no typos. The kit (`builder/kits/posters`) refuses a character the fonts cannot draw, and reads the QR code back from every image it made.
- Six formats from one design: A4 print (PNG, JPEG, SVG), square, 4:5, story, link card and X. A photo the crew attaches to the request becomes the background instead.
- The Builder posts the square, the story and a poster preview in the crew room. Ferri then opens a "share the poster" card; one OK posts the image with a short caption to every space on every platform.

To turn on the art: put `OPENAI_API_KEY` in `.env` and run `pnpm builder:setup` again. `FERRI_IMAGE_MODEL` and `FERRI_IMAGE_QUALITY` choose the model and quality. Without a key the kit draws its own background.

## The Builder lists the event on Luma and other platforms

`@ferri get the builder to put Build Night on Luma` ends with the event listed, and nothing is published until a person says yes.

- Luma's public API needs a Luma Plus subscription on the calendar. With a key (`LUMA_API_KEY`), the Builder creates the event through the API, with the poster uploaded as the cover. Without one, and for every platform without an API, it uses the platform's own form.
- The form is filled in the Builder's own browser: a Chrome window with a profile of its own on the organizer's screen. A person logs in to each platform there, themselves. Ferri never types, sees or keeps a password and never creates an account. If a login or a captcha shows up, the Builder posts a screenshot and asks on a card, and carries on after "Done".
- The kit (`builder/kits/listings`, Playwright on the installed Chrome) fills Luma's form from a `listing.json` written from the room's documents: name, times and time zone, the exact venue, description, visibility, capacity, and the poster's square card as the cover. While it fills, it blocks the platform's publish request and every click on a publish button.
- The Builder posts a screenshot of the filled form in the crew room. Submitting is a separate script whose Claude Code permission prompt is the Switch card; it refuses if the form changed since the screenshot. After "Allow once", it reads the listing's address back and posts the live page.
- Ferri then allows the platform's domain in Shield and opens the "Build Night is on Luma" announcement card. Any other site works without new code: the Builder lists the page's fields with `inspect`, writes a `form.json`, and the same fill, screenshot and card follow.

To log in to Luma and other platforms in the Builder's browser (Chrome must be installed):

```bash
cd ~/.ferri/builder
node kits/listings/scripts/browser.mjs start    # opens the Builder's own browser; log in there once
node kits/listings/scripts/browser.mjs status   # where it is logged in
```

Ferri also reads Luma's guest list in that browser ([rsvp.md](rsvp.md)). `FERRI_BROWSER_PORT` (9333) is its local debugging port. `LUMA_API_KEY` in `.env` (Luma Plus only) switches Luma to the API; run `pnpm builder:setup` again after setting it.

## Partner research

`@ferri find colleges and companies in Bengaluru that could sponsor or host Build Night` is a Builder job too. See [email.md](email.md).

## Helping members

A member's technical problem can go to the Builder, which helps them in their own room. See [care.md](care.md).

## Checking the kits

The Builder's kits check themselves: `node scripts/render.mjs --example` in `builder/kits/posters` (every format, every QR code read back), `node scripts/check.mjs` in `builder/kits/listings` (times, listing checks, and the Luma API path against a stand-in server) and `node scripts/check.mjs` in `builder/kits/page-check` (two example pages served locally: the clean one passes in light and dark, and every problem planted in the other is found).

The `frontend-design` and `webapp-testing` skills in `builder/.claude/skills/` are copied unchanged from [anthropics/skills](https://github.com/anthropics/skills), each with its Apache 2.0 `LICENSE.txt`.
