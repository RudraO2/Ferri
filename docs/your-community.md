# Make it yours

`./ferri up` starts with a made-up community, Lantern Labs, and its event, Lantern Build Night. This guide puts your own community and event in their place, in seven steps. Each step gives the Desk way first: Desk is at http://localhost:3100 (sign in as `admin@switch.local` with `GATEWAY_ADMIN_PASSWORD` from `.env`). Then it gives the command or the seed file, for people who keep their setup in git.

On Windows, use `.\ferri` in PowerShell (or `ferri` in cmd) wherever this page says `./ferri`.

## How Desk and the seed fit together

- The seed is the `seed/` folder: `community.yaml` and `knowledge/` for the whole community, and one folder per event under `events/`, each with an `event.yaml` and its own `knowledge/`.
- Every `./ferri up` loads the seed again. It never overwrites what you changed in Desk:
  - a community or an event saved in Desk keeps what you saved;
  - an event's crew, once changed in Desk or linked to Pocket, stays as Desk has it;
  - a knowledge entry added, edited or archived in Desk stays as it is, and so does every crew answer;
  - a closed event stays closed.
- The seed attaches the spaces an `event.yaml` names, but only spaces that are not attached to a live event yet. A space you turned Off comes back while a live event's `event.yaml` still names it.
- So Desk changes work on any stack. Seed files suit people who keep their setup in git: [Load seed files](#load-seed-files).
- On a fresh stack where nothing is connected yet, you can skip the demo altogether: [Start clean instead](#start-clean-instead).

## 1. Rename the community

**Desk**: open Community. Under Central instructions, set:

- **Name**: your community's name.
- **Timezone**: an IANA name such as `Asia/Kolkata` or `Europe/London`. Ferri uses it for times in answers, reminders and scheduled posts.
- **Tone and rules for Ferri everywhere**: who you are, how Ferri should sound, and what it must never promise. Replace the Lantern Labs text.

Click Save. From then on the seed leaves these three alone. Tone, language and timing settings are under Settings on the same page ([customization.md](customization.md)).

**Seed**: set `name`, `timezone` and `instructions` in `seed/community.yaml`, then [load the seed](#load-seed-files). If you already saved the community in Desk, Desk wins: change it there.

```yaml
slug: lantern-labs
name: Acme Makers
timezone: Asia/Kolkata
instructions: |
  Acme Makers is a volunteer-run maker community. We run meetups and build days.
  Tone: friendly and short. English by default.
  Never promise refunds or exceptions that are not in the knowledge.
```

Keep `slug: lantern-labs` on a stack that has already run. The slug is an internal key: members never see it, and the seed finds the community by it. A new slug makes a second community, and Desk and Ferri keep serving the oldest one, which also keeps the spaces Ferri found. Pointing `FERRI_COMMUNITY` at the new slug does not move the spaces either. On a fresh stack any slug works ([Start clean instead](#start-clean-instead)).

## 2. Create your event

**Desk**: open Events and click **New event**. Give it a name and a start, set **Start from kit** to "No kit (empty event)" (once an event is closed, Desk picks its kit by default), and click Create event. Desk opens the event's page. Its address ends in `/events/<slug>`, and the slug comes from the name.

- **Details**: stage, start and end, venue, and event instructions (on top of the community's). Click Save event.
  - The stage is plan, build, launch, live or wrap. Set it to live for the event days: by default, cards then nudge the crew after 10 minutes instead of 2 hours.
  - The event page shows and reads times in India time (IST) for now, whatever the community's timezone. Elsewhere, enter the IST time: 10:00 in London in December is 15:30 IST.
- **Crew**: click **Add a crew member** for each person.
  - **Handles**: `platform: username` pairs, separated by commas, for example `telegram: asha_k, discord: asha, switch: asha@example.com`. The platforms are `mattermost`, `telegram`, `discord` and `slack`, with the username as that platform shows it. `switch` is the person's Switch account email (step 6). Ferri knows the crew by these handles, pings them about their cards, and treats their messages as crew.
  - **Topics**: what they own, from schedule, food, venue, registration, teams, prizes, judging, rules, tech, sponsors, community and other. A card goes to the topic's owners first, then to whoever is on duty, then to the whole crew.
  - **lead** and **on duty**: whoever is on duty takes the cards nobody owns. Leads also get Shield alerts and unsafe care cases.
  - To keep testing in the local Mattermost, give yourself the handle `mattermost: user`.

The Events page lists Lantern Build Night next to your event until step 7.

**Seed**: add a folder per event, such as `seed/events/spring-meetup/event.yaml`:

```yaml
name: Spring Meetup
stage: plan
starts_at: 2026-12-05T10:00:00+05:30
ends_at: 2026-12-05T18:00:00+05:30
venue: Hall B, Example Tech Park
instructions: |
  A one-day meetup with talks and demos. Questions come from attendees and speakers.
spaces:
  - { room: ferri-lab, mode: auto }
  - { room: ferri-crew, role: crew }
crew:
  - name: Asha
    handles: { telegram: asha_k, switch: asha@example.com }
    lead: true
    on_duty: true
    topics: [registration, schedule, venue, rules]
  - name: Dev
    handles: { discord: dev_builds }
    topics: [tech, food, sponsors]
```

- The folder name is the event's slug, unless `slug:` sets another. Times carry their UTC offset. The stage is plan when you leave it out.
- `spaces:` is optional (step 5). `closed: true` closes the event (step 7).
- The seed checks the file: an unknown topic, stage or space mode, or a bad date, stops it with an error that names the file.
- The seed finds the event by its slug. Once the event is saved in Desk, the seed leaves its details alone. Once its crew is changed in Desk or linked to Pocket, it leaves the crew alone.

For later events: when an event is over, close it on Wrap. New event on the Events page can then start the next one from its starter kit, with the same crew and the knowledge worth keeping ([wrap.md](wrap.md)).

## 3. Load your FAQ

Ferri answers only from its knowledge and names the source under every answer, so this step is what makes it useful.

**Desk**: open Knowledge and click **New entry**, once per question or topic.

- **Heading**: what it answers, such as "Parking".
- **Text**: the answer, in full sentences.
- **Belongs to**: your event, or the whole community for facts that hold for every event. Desk lists live events by start date, so check that it does not say Lantern Build Night.
- **Source title**: the name members see under the answer, such as "Spring Meetup FAQ".

Ferri uses an entry at once, and the Switch copy of the knowledge follows. An entry's own page edits it (each edit is a new version) or archives it.

**Chat**: in the crew room, `@ferri remember: lockers are on the 2nd floor` saves a fact. Every answer the crew gives on a card is saved too.

**Seed**: markdown files in `seed/knowledge/` (whole community) or `seed/events/<slug>/knowledge/` (one event):

```markdown
---
title: Spring Meetup FAQ
tags: [faq]
---
## Parking
There is free parking in the basement of Example Tech Park. Bikes park at gate 2.

## Food
Lunch is at 1 PM. Tell us about allergies when you register.
```

- Each `##` section is one entry. The title is the source members see: the front matter's `title`, else a leading `# Title`, else the file name. Text before the first `##` becomes an entry called "Overview". Deeper headings stay inside their section.
- Loading again touches only what changed: an edited section gets a new version, a removed section is archived, and a renamed heading or file counts as removed plus new.
- Check the result with `./ferri kb list` (the live entries), `./ferri kb search <words>`, and `./ferri kb ask "<question>"` (the answer pipeline without Switch; it calls the model).

## 4. Connect a platform

Mattermost comes connected for trying Ferri. For your community's own groups:

- Telegram: make the bot ([platforms.md](platforms.md#telegram)), then `./ferri connect telegram --token <bot token>`.
- Discord: make the bot ([platforms.md](platforms.md#discord)), then `./ferri connect discord --token <bot token> --guild <server id>`.
- Slack: make the app ([platforms.md](platforms.md#slack)), then `./ferri connect slack --bot-token xoxb-... --app-token xapp-...`.
- WhatsApp: [whatsapp.md](whatsapp.md). Name your groups in `FERRI_WHATSAPP_CHATS` in `.env`.

`./ferri doctor` and Desk's Setup page show each platform as on, off or broken. Once you no longer need the local chat, remove `mattermost` from `COMPOSE_PROFILES` in `.env` and run `./ferri up`.

## 5. Attach your groups and choose the crew room

A group does nothing until it is attached to an event. The full guide is in [platforms.md](platforms.md#attach-your-groups-and-choose-the-crew-room).

**Desk**: open Spaces. A new group waits under New spaces, switched off. A room Ferri is not in yet is under "Rooms Ferri is not in", with **Add Ferri**. For each group:

1. Pick your event in the first menu. It can show Lantern Build Night first.
2. Pick a mode: Listen (reads, never posts), Approve (replies wait for a crew OK) or Auto (answers with sources).
3. Tick **crew room** for the crew's private room, where cards land. Each event has one crew room.
4. Click Attach (Save for a space that is already listed).

**Command**:

```bash
./ferri space list
./ferri space attach "<space name>" --mode auto --event <slug>
./ferri space attach "<crew room name>" --crew --event <slug>
./ferri space detach "<space name>"
```

Use the names exactly as `space list` prints them, in quotes. Always pass `--event`: without it, the command takes the first live event the database returns, which can be Lantern Build Night.

**Seed**: list the spaces under `spaces:` in your `event.yaml` (step 2). Lantern Build Night holds `ferri-lab` and `ferri-crew` until you move them in Desk or with `space attach`, or close it, because the seed attaches only spaces that are free.

A space belongs to one live event at a time, so attaching a space to your event takes it away from Lantern Build Night.

Try it: in an Auto space, ask `@ferri` something your FAQ answers. Ferri replies with its source. Ask something it does not cover, and a card opens in your crew room.

## 6. Invite the crew to Pocket

Pocket is the crew's phone app at `/m` on Desk's address: their cards, push notifications, and who is stuck ([pocket.md](pocket.md)). Each crew member signs in with their own Switch account, linked to their crew entry.

1. Make the account and link it:

   ```bash
   ./ferri crew:account Asha asha@example.com
   ```

   The name is the crew member's name from step 2. Without a third argument, the command makes a password and saves it in `.env` as `CREW_ASHA_PASSWORD`. Give it to them privately. An existing account is only linked. If someone already has a Switch account, `switch: <email>` in their Desk handles links them too.
2. Phones need HTTPS: put Desk behind a Cloudflare tunnel and set `FERRI_PUBLIC_URL` ([pocket.md](pocket.md#setup)).
3. Each crew member opens `<your address>/m`, signs in, taps their name on **Me** if Pocket does not know them yet, and turns on notifications. On an iPhone, they add Pocket to the Home Screen first.

Linking counts as a Desk change, so from then on the seed leaves that event's crew alone.

## 7. Remove the Lantern demo

Ferri has no way to delete an event. You close the demo event, archive the demo's community knowledge, and swap the logo.

1. **Close Lantern Build Night**: open Wrap, pick Lantern Build Night at the top, and click **Close the event**. Choose whether its spaces go Off or move, with the same modes, to your event (handy for `ferri-lab` and `ferri-crew` if you test in Mattermost). Then click Close Lantern Build Night.
   - Ferri does the close within a few seconds, so it has to be running. It makes a recap and a starter kit (documents in the crew room), saves any partners it finds to Contacts (nobody is emailed), posts a goodbye in the crew room, closes the event's open cards and cancels anything scheduled.
   - A closed event's knowledge is no longer used, and the seed never reopens it.
   - In chat, `@ferri close build night` in the crew room opens the same choice as a card. Left open, the demo gets Ferri's own wrap an hour after it ends (22 November 2026).
   - Turning its spaces Off on Spaces (or `./ferri space detach`) is not enough: while the demo event is live, the next `./ferri up` attaches them to it again.
2. **Archive the demo's community knowledge**: open Knowledge, open each entry under "About Lantern Labs" and "Lantern Labs Code of Conduct" (six in all), and click **Archive**. Or edit them into your own text. An archived or edited entry stays that way when the seed runs again. Lantern Build Night's own entries stop counting once it is closed.
3. **Swap the logo**: the Builder's posters use the community logo. Put yours in `seed/assets/`, delete `lantern-labs-logo.svg` there, and run `pnpm builder:setup` again. Setup copies the folder but never deletes, so also delete `lantern-labs-logo.svg` from the Builder's `assets/community/` folder: `~/.ferri/builder/assets/community/` by default, `%USERPROFILE%\.ferri\builder\assets\community\` on Windows.
4. **Sample data**: if you filled Desk with sample data for screenshots (`./ferri demo:fill`), remove it with `./ferri demo:clear`.
5. **Seed files**: if you keep your setup in the seed, delete `seed/events/build-night/`, `seed/knowledge/about.md` and `seed/knowledge/code-of-conduct.md`, then [load the seed](#load-seed-files). Close the event first: the seed never deletes an event, so a demo event that is only gone from the files stays live, with its spaces and crew. `closed: true` in its `event.yaml` closes it from the seed instead, without the recap and the goodbye; its spaces then count as Off.

What stays: the closed demo event is still listed under Events, Closed, and on Wrap, with its recap and kit. `./ferri smoke` and `./ferri eval:answers` test the demo (Build Night questions in `ferri-lab`), so run them on a stack that still has it.

### Start clean instead

Before you connect anything, you can start from your own seed with no demo at all:

1. In `seed/`, keep `community.yaml` (it is required) with your own `slug`, `name`, `timezone` and `instructions`. Delete `knowledge/about.md`, `knowledge/code-of-conduct.md` and `events/build-night/`, and put your logo in `assets/` in place of `lantern-labs-logo.svg`. Add your own event and knowledge (steps 2 and 3), or leave them for Desk.
2. Run `./ferri reset`, then `./ferri up`.

`./ferri reset` deletes everything in the stack except `.env`: Switch (accounts, platform connections, rooms, the Builder), Mattermost, Ferri's database and the WhatsApp link. Do it before you go live, not after.

## Load seed files

**In the Docker stack** (`./ferri`): Ferri's containers read the `seed/` folder of your checkout (compose mounts it), so there is nothing to rebuild. Run `./ferri kb seed` after a change. `./ferri up` also loads it each time it starts the stack.

**On the host** (`pnpm`, see [development.md](development.md)): `pnpm kb seed` reads `seed/` in your checkout. It loads it into the database, attaches the spaces each `event.yaml` names, and updates the Switch copy of the knowledge. `pnpm kb seed <folder>` reads another folder.

If `./ferri up` stops at setup, `./ferri logs ferri-setup` shows the seed's error.
