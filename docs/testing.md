# How we checked it

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and on pull requests:

- **Typecheck, tests, Desk build**: `pnpm typecheck`, `pnpm test` and `pnpm desk:build`.
- **One-command stack smoke test**: builds Ferri's image from the commit, runs `./ferri up` on a clean runner (Claude Haiku at low effort), then `./ferri smoke` (`scripts/smoke.ts`). The smoke test signs in to Mattermost as a test person and asks `@ferri when does hacking start?` in `ferri-lab`: Ferri must answer with a source line. Then it asks something the knowledge does not have: a question card must open in `ferri-crew`. CI then prints `./ferri doctor`.

You can run the same smoke test on your own stack: `./ferri smoke`.

## Tests and evals

- `pnpm test`: 255 unit tests in seven packages: 209 in knowledge (policy, cards, launch, the plan, the Builder's reports and hand-offs, site events, outreach, care reading rules and routing, guest statuses and CSV parsing, social text fitting, desk skills and sheets, recap numbers and the starter kit, settings), 22 in Shield (detectors), 7 in email (webhook signatures, reply addresses), 5 in push (notices), 4 in switch (the stream parser), 4 in social (the Buffer client with a fake fetch) and 4 in the Ferri service (flow helpers).
- `pnpm typecheck`: nine packages, Desk and the Ferri service included.
- Desk's production build (`pnpm desk:build`, Next.js `next build`) passes with every page, Pocket and the public RSVP page.
- `pnpm eval:answers`: 158 of 158 fixed cases pass against the real model (Claude Haiku 5.5 at low effort): answers only with a valid source, room triage, card matching, crew intents, announcement drafts, the crew decision check, plan intents and the agenda, build requests, outreach intents and partner replies, care readings and care intents, guest intents, guest replies and a reminder draft, social intents with their times, and the desk cases (sheet readings and a custom desk skill). The clock is fixed at 10:00 AM in Bengaluru, so time cases do not depend on when it runs.
- The fork's `whatsapp_web` adapter has 26 tests of its own in our Switch fork (`core/tests/switch_core/bridges/collaboration/test_whatsapp_web_adapter.py`).
- The Builder's kits check themselves: `node scripts/render.mjs --example` in `builder/kits/posters` (every format, every QR code read back) and `node scripts/check.mjs` in `builder/kits/listings` (times, listing checks, and the Luma API path against a stand-in server).

## End to end on the real stack

- Every feature was run end to end on the real local stack (Switch with Mattermost, Slack, Discord and Telegram connected) before the next one started: questions asked on Telegram answered once from the crew room and delivered on Slack and Discord; announcements posted to seven spaces and edited in place on four platforms; scam links blocked on Discord and Mattermost in 3 to 9 ms; announcement and answer cards approved from Pocket at phone size; the Builder making the event site, a checklist and a sponsor one-pager from crew requests and Desk, its publish and email cards refused from the room, Desk and Pocket with nothing published, and a spent budget stopping it; the Builder shipping the event site to Vercel and Supabase behind a deploy card, then registration, credit claims, a low-pool alert and a revoke on the live site; the Builder making the poster and cards with one image call and the share card posting them to seven spaces on four platforms; the Builder listing Build Night on Luma from its own browser, "Decline" leaving Luma untouched, "Allow once" publishing it with the poster as the cover, a login card on a platform the browser was not logged in to, and a stray click on Luma's submit blocked during the fill; the Builder finding four real Bengaluru prospects with their source pages; an outreach email declined, then sent from our own domain and delivered, a reply read and answered on a card, and "no thanks" stopping all mail; a magic link from the event site's Supabase arriving through Resend and signing in.
- The newer features, the same way:
  - WhatsApp: linked to the organizer's own number by QR code. The "Message yourself" chat and a real group with two other people became rooms, Ferri answered "@ferri when does hacking start?" in both with its sources (2.7 s and 3.1 s), and no other chat on the phone made a room. An announcement posted there after one approval, and its second version was edited in place (WAHA accepted the edit).
  - Care: an upset member became a case for the venue owner in 1.7 s while ordinary chat made none; a member's SSH problem went to the Builder on a tap and was solved in her own room, and a revoked API key went to the Builder on its own during the event and came back to the owner as stuck; an unsafe report reached the person on duty with a push, and their written answer reached the member; cases were solved from chat, Desk and Pocket.
  - RSVP: the checks listed in [rsvp.md](rsvp.md).
  - Social: Buffer drafts only, as listed in [social.md](social.md).
  - Desks: a private judging desk on Mattermost in 1 second, scores added, changed and ranked; a meetup pack declined, then made; check-in marking a guest; a custom rangoli judging desk from a skill Ferri wrote; a help desk handing a member's npm problem to the Builder.
  - Wrap: a recap whose every number matched a SQL count, partners saved with nobody emailed, a starter kit, Ferri wrapping an event on its own once, a close that turned ten spaces Off and a reopen that brought them back, and Lantern Build Night 2 started from the kit with the spaces moved over with their modes.
  - Customization: the checks listed in [customization.md](customization.md).
- Not done yet, and not claimed: Pocket was checked in a browser at phone size and through the tunnel, but not yet on a real phone (the iPhone test is still to do). Social posts were saved only as Buffer drafts on real accounts; nothing was posted live to LinkedIn, X or Instagram. Luma's API path needs Luma Plus, which we do not have, so it is checked only against a stand-in server; the real Luma listing and guest list go through the Builder's browser.
