# Ferri

**The AI teammate for people who run community events.** Ferri answers your community on every platform, asks your crew only when it does not know, and turns what the crew decides into an update everywhere after one OK.

Built on [Switch](https://github.com/sandbox-quantum/switch) for the WeMakeDevs "Flip the Switch" hackathon (Track 1, best business workflow). Built by voice with Wispr Flow.

- Demo video: _link coming_
- Switch fork with our core change: [`RudraO2/switch`, branch `ferri/agent-message-edit`](https://github.com/RudraO2/switch/tree/ferri/agent-message-edit)

## The problem

A hackathon, a meetup or a festival night has members on Discord, Telegram, Slack and a Mattermost or WhatsApp group, and a small crew of volunteers running it. The same three questions arrive forty times on five apps. Answers given in one group never reach the others. The crew decides something in their own chat ("lunch moves to 1:30") and half the members never hear it, or hear the old time. A fake "free nitro" link lands in the busiest channel at the worst moment. Every organizer we know runs this by hand, at night, on their phone.

## What Ferri does: three pillars

Ferri is one agent that works in two directions, with a bridge between them.

**1. Outward: answers on every platform, with sources.** Ferri sits in every group of the event, on every platform. It answers only from the event's knowledge and names the source under every answer. It also notices questions nobody addressed to it ("does anyone know the wifi password?"), waits a moment so a person can answer first, and steps in only when it has a sourced answer. Each space has a mode: Off, Listen, Approve (every reply waits for an organizer) or Auto.

**2. Inward: the crew plans and decides, Ferri learns.** Before the event, Ferri follows the crew's own chat and keeps a living plan: what is decided, who owns what, tasks with deadlines, what is still open. "@ferri draft the agenda" gives a run of show plus one approval card per key decision. Owners named in the plan ("Priya will handle food") take over the routing, so food questions go to Priya. During the event, when Ferri does not know, the member hears "I'm checking with the team" at once, and a Switch question card opens in the crew room for the person who owns that topic (food, venue, judging). The owner's phone buzzes through Ferri Pocket. One answer, on the card, from Desk, or from the phone, reaches everyone who was waiting, on their own app, with a real mention. The answer is saved, so the next person gets it instantly. Nobody answers: Ferri nudges the owner, then the whole crew, and never invents an answer.

**3. The bridge: a decision inside becomes an update outside.** "@ferri tell everyone lunch moves to 1:30" drafts an announcement and opens one approval card with the draft and every space it will reach. One OK posts it to every space of the event on every platform and saves it as knowledge. "@ferri change the lunch announcement, it's 1:45 now" and one more OK **edits the post in place** on Mattermost, Slack, Discord and Telegram. Ferri also follows the crew's own chat: when the crew settles something members need to know ("ok let's push judging to 4pm"), it offers the announcement on a card, credited to whoever decided, and never posts without the OK. Announcements can be scheduled; one not approved by its time is not sent, and the crew is told.

Around the pillars:

- **Shield** keeps scam links, link floods and leaked API keys out of every room, on every platform, before anyone sees them. It is our own Switch Trust endpoint and answers in 2 to 9 ms, with no model in the path.
- **Desk** is the organizers' dashboard: spaces and modes, master pause, cards, the plan, events and crew, knowledge with versions, announcements, Shield.
- **Ferri Pocket** is the crew's phone app (a PWA with Web Push): the cards that need you, Post, Edit, Don't post, who is stuck, and a `+ Announce` button.
- **Ferri Builder** is Ferri's second pair of hands: a Claude Code agent that Switch itself runs on the organizer's laptop, with its own folder, its own Claude home and its own token budget. "@ferri get the builder to make a one-page site for Build Night" hands it the job in the crew room; it reads the event's facts from the room's Switch documents, posts the page there, and asks on a card before anything goes public.
- **Crew helpers**: "@ferri remind me at 5 to order the pizza", and "@ferri make team rooms for Team Alpha with meera and arjun", which makes real private channels on the platform from a Switch template.

## Why Switch is the spine

Ferri does not work without Switch. Every group on every platform is a Switch room, Ferri is one Switch agent in all of them, every approval is a Switch card, and every message passes Switch Trust. We use Switch as deeply as we could find it:

| Switch feature | What Ferri does with it | Where |
|---|---|---|
| Rooms bridged to Mattermost, Slack, Discord, Telegram | Every group is a Switch room. One agent connection serves every platform, and one answer fans out to askers on four apps with native mentions. | `apps/ferri/src/flow.ts`, `rooms.ts` |
| Always-on custom agent protocol | Our own small TypeScript client: event stream with a string cursor, heartbeat, typing, posting, ops, catch-up after a restart. | `packages/switch` |
| Addressing and `follow_the_conversation` | Ferri tells a real mention from a follow-up, and runs a fast triage model on room chatter it was not addressed in. | `apps/ferri/src/mentions.ts`, `packages/knowledge/src/triage.ts` |
| Question cards (`/agent-sessions/{sid}/approvals`) | Unknown questions, replies waiting in Approve spaces, and every announcement version are cards. The ladder (nudge, escalate, close) runs on them. Buttons on Mattermost, Slack, Discord and Telegram. | `apps/ferri/src/loop.ts`, `launch.ts` |
| Answering a card as a person (`/gateway/agent-sessions/.../answer`) | Desk and Pocket answer cards through Switch under the signed-in organizer's name. | `apps/desk/lib/cards.ts` |
| Switch Trust (`/guardrails/check`) | Shield, our own Trust endpoint inside the Ferri service: blocks scams and floods, redacts secrets, alerts the crew. | `packages/shield`, `apps/ferri/src/shield.ts` |
| Templates v2 (`create_room_from_yaml`) | "Make team rooms" creates real private channels on the platform with the members, Ferri and a kickoff, attached to the event. | `apps/ferri/src/launch.ts` |
| Library documents | The live knowledge is mirrored into a Switch library document attached to the event's rooms, and each event's living plan is a document in its crew room. Both follow every change. | `packages/knowledge/src/mirror.ts`, `apps/ferri/src/plan.ts` |
| Agent management and the headless agent controller | Ferri creates its own Builder through Switch (`create_agent`, after its owner allows it to manage agents): a managed Claude Code agent on a Switch agent controller running on the organizer's laptop. Switch starts a Builder session whenever it is addressed and gives it the Switch tools over MCP. | `scripts/builder-setup.ts`, `apps/ferri/src/builder.ts` |
| Handing work to a coding agent (`invite_agent_to_room`, `send_targeted_message`) | Ferri puts the Builder in the crew room and hands each job over as a targeted message, bound to that one room through a session of Ferri's own (`X-Switch-Session-Id`). The Builder reports back to Ferri with a targeted message of its own. | `packages/switch/src/client.ts` (`roomOp`) |
| Session activity and the coding agent's own cards | The Builder's progress shows as Switch activity cards (steps, tool calls, time). Its Claude Code permission prompts and questions become Switch cards in the room, answered there, in Desk or in Pocket (`/gateway/agent-sessions/approvals`). Public steps (deploy, push, email) always ask. | `builder/.claude/settings.json`, `apps/desk/lib/builder.ts` |
| A coding agent shipping to production behind a Switch card | The Builder creates the event site's Supabase project, sets Vercel's environment and deploys; Claude Code's permission prompt for `vercel deploy --prod` is the Switch card the crew answers. | `builder/kits/event-site`, `builder/.claude/skills/ship-event-site` |
| Budgets (`/gateway/tenants/{tid}/budgets`) | The Builder has its own output-token and turn budget per 24 hours. Switch stops it when it is spent; Ferri holds new jobs until the reset, and Desk shows the spend. | `scripts/builder-setup.ts`, `apps/desk/app/(desk)/builder` |
| Room documents as shared context | The hand-off points the Builder at the knowledge and plan documents attached to the crew room; it reads them with `load_internal_documents`, so the brief stays short. | `packages/knowledge/src/builder.ts` |
| Gateway (auth, rooms, agents, collaborations, addressing policy) | Desk and Pocket sign in with Switch accounts. Desk adds Ferri to rooms, discovers spaces, connects Shield. | `apps/desk`, `scripts/` |
| **Agent message edit (new, in our fork)** | Switch had no way for an agent to edit a message it posted. We added it to Switch core. See below. | [`RudraO2/switch@2711974`](https://github.com/RudraO2/switch/commit/2711974943c2e72540e012cb8171c9e59cfd2511) |

### What we added to Switch: agent message edit

The bridge pillar needs "fix the announcement everywhere". Switch had no op and no route for an agent to edit its own message, though every platform adapter already had `update_message` and every bridge keeps a map from room event to platform post. So we added it to Switch core, in our fork:

- `POST /agents/{agent_id}/messages/{event_id}/edit` with `{room_id, content}`, returning `{ok, edited}`.
- `AgentCore.edit_message` checks room membership and budget like a post, refuses any message that is not the agent's own (403), and runs the new text through Switch Trust, so Shield checks edits too.
- `CollaborationCore.handle_outbound_edit` finds the platform post in the bridge's message map and calls the adapter. Telegram writes the agent's name into the body, so its edit keeps "Ferri:" at the top.
- Switch's own room history keeps the message as first sent.

We run it as a thin image over the published Switch dev image (`deploy/local/ferri/` in the fork), so nothing else in the stack changes. Without that image Ferri still works: an edit falls back to a new post that starts with "Update:".

## How it fits together

```
 Discord   Slack   Telegram   Mattermost          members and crew, on their own apps
    \        |        |          /
     +-------+--------+---------+
                  |
          Switch (our fork)       rooms, bridges, cards, templates, library docs,
                  |               Trust, agent message edit
        +---------+----------+
        |                    |
  Ferri service         Shield (Trust endpoint, same process, 127.0.0.1:3200)
  apps/ferri            packages/shield: scam links, floods, secrets, 2-9 ms
        |
        |  invite_agent_to_room, send_targeted_message      Switch agent controller (headless,
        +-------------------------------------------------> on the laptop): Ferri Builder, a
           "Job B1 done:" back to Ferri                     managed Claude Code agent with its
                                                            own folder, Claude home and budget
  flow, learning loop,
  announcements,              Claude Haiku 5.5: triage, decision check
  scheduler, reminders  ----> Claude Sonnet 5.5: answers and drafts
        |
  Postgres 16 + pgvector (knowledge with revisions, spaces, events, crew,
        |                 questions, cards, announcements, shield log)
        |
  Desk (Next.js, laptop)  +  Ferri Pocket (PWA at /m, Web Push)
```

## Run it locally

You need Docker Desktop, Node 22 and pnpm.

1. Start Switch (our fork, `RudraO2/switch` on branch `ferri/agent-message-edit`, checked out next to this repo as `switch/`):

   ```bash
   cd ../switch
   git checkout ferri/agent-message-edit
   cp .env.example .env
   bash deploy/local/generate-env-secrets.sh .env local
   # In .env set:
   #   SWITCH_IMAGE_NAMESPACE=sandbox-quantum/dev
   #   SWITCH_VERSION=0.31.1-dev.339.g86d5928
   #   FEATURE_FLAGS_ENABLED=agent_management,service_connections,follow_the_conversation
   #   CONTROLLER_TOKEN_SECRET=<32+ random characters>
   docker compose -f deploy/local/standalone-docker-compose.yml --profile collab --profile gateway --project-directory . up -d
   # Ferri's core image: the same release plus the fork's agent message edits (for announcements)
   docker build -f deploy/local/ferri/Dockerfile --build-arg BASE=ghcr.io/sandbox-quantum/dev/switch-core:0.31.1-dev.339.g86d5928 -t ferri/switch-core:local .
   docker compose -f deploy/local/standalone-docker-compose.yml -f deploy/local/ferri/compose.override.yml --profile collab --profile gateway --project-directory . up -d switch
   ```

   Switch has no way for an agent to edit a message it posted. The fork adds `POST /agents/{agent_id}/messages/{event_id}/edit`: Switch checks the message is the agent's own, runs the new text through Switch Trust, and the room's bridge redraws the post in place (Mattermost, Slack, Discord, Telegram). Without the image, announcements still post; edits are posted again as "Update:".

2. Start Ferri's own Postgres (pgvector, port 5433) and load the demo knowledge:

   ```bash
   pnpm install
   pnpm db:up
   pnpm setup:switch
   pnpm dev:mattermost
   pnpm kb seed
   ```

   `pnpm setup:switch` also creates `ferri-crew`, the organizers' room where Ferri's question cards land. `pnpm dev:mattermost` adds local test people: `meera` and `arjun` (members, in `ferri-lab`) and `priya` (crew, in both rooms), sharing the password `MM_TEST_PASSWORD` in `.env`.

   `pnpm kb seed` reads `seed/` (a made-up community, Lantern Labs, and its event, Lantern Build Night), writes it into Postgres, and mirrors it into a Switch library document attached to `ferri-lab`. It is safe to run again: only changed sections get a new version.

3. Put your `ANTHROPIC_API_KEY` in `.env`, then start Ferri:

   ```bash
   pnpm dev
   ```

4. Optional, Ferri Builder (needs `claude` on the PATH and the `agent_management` flag above). Build the Switch agent controller once from the Switch checkout, then set it up and keep it running:

   ```bash
   cd ../switch/console
   npx pnpm@10.28.2 install --filter "@switch-console/agent-controller..."
   npx pnpm@10.28.2 -r --filter "@switch-console/agent-controller..." run build
   cd ../../ferri
   pnpm builder:setup        # enrolls this machine, Ferri creates the Builder, sets its budget
   pnpm builder:controller   # in its own terminal: runs the Builder (on Windows too, with `run`)
   ```

   `pnpm builder:setup` waits for the controller the first time, so start `pnpm builder:controller` in another terminal when it asks.

5. Open Mattermost at http://localhost:8065, go to the `ferri-lab` channel and try:
   - `@ferri when does hacking start?` gets the answer with its source.
   - `@ferri can I bring my dog?` (not in the knowledge) gets "I'm checking with the team".
   - `does anyone know the wifi password?` (no mention) gets answered after a short pause, unless a person answers first.

## How Ferri answers

- The knowledge lives in Postgres (`knowledge_entries`, every edit kept in `knowledge_revisions`). Markdown in `seed/` is one way in; each `##` section is one entry.
- Ferri answers only from that knowledge and names the source under every answer. If the knowledge does not have it, Ferri says it is checking with the team and logs the question.
- A fast model (Claude Haiku) reads every message, so Ferri also notices questions nobody addressed to it. It waits a moment so a person can answer first, and steps in only when it has a sourced answer.
- Every handled question is one row in `questions`, which is also how Ferri never answers the same message twice.

## Desk

Desk is where organizers run Ferri: `pnpm desk`, then http://localhost:3100, signing in with a Switch account.

- **Spaces**: every group or channel Ferri is in, on any platform. New ones arrive in a Discovered list, switched off. Rooms in Switch that Ferri is not in yet are listed with an **Add Ferri** button, so nobody has to type `!invite-agent`. Attach a space to an event as Listen (reads, never posts), Approve (every reply waits for an organizer), or Auto (answers with sources), or make it the event's crew room, where cards land.
- **Pause**: one switch stops every post everywhere. Questions are still logged, and answers the crew gives during the pause go out when it is lifted.
- **Cards**: questions waiting for the crew, replies waiting for approval (Send, edit and send, Don't send), answered, unanswered and dismissed. Answers from Desk go through Switch under your name.
- **Events**: stage, dates, venue, instructions, attached spaces, and the crew with the topics each person owns.
- **Knowledge**: every entry, searchable; editing one makes a new version that Ferri uses at once. Seeding again never overwrites an edit made in Desk.
- **Community**: the central instructions, and the mute list.

## Ferri Pocket

Pocket is the crew's phone app: a PWA at `/m` inside Desk (http://localhost:3100/m), with the same Switch sign-in.

- **Needs you**: the cards for you (topics you own, replies waiting for your OK, anything escalated to the whole crew), then the rest of what is open.
- **A card**: who is waiting, on which platform, and for how long. Write the answer and send it, or don't answer. For a reply waiting in an Approve space: Send, Edit, or Don't send. It goes through Switch under your name.
- **Who is stuck**: every member still waiting on the crew, longest first, and who never got an answer in the last day.
- **Me**: say which crew member you are (once), turn on notifications, send a test.
- **Push**: Web Push (VAPID). Your phone buzzes when a card for you opens, at the nudge, when it is escalated to everyone, and when it expires. When someone else answers, the notification changes to "Answered by Priya" so stale buzzes never linger.

Setup: `pnpm setup:switch` (or `pnpm push:keys`) writes the VAPID keys to `.env`. A crew member without a Switch login gets one with `pnpm crew:account <crew name> <email>`, which also links them. Phones need HTTPS. For a quick try, run `cloudflared tunnel --url http://localhost:3100` and open the `https://….trycloudflare.com/m` link. For real use, put Desk on a stable hostname with a named tunnel (`infra/cloudflared.example.yml`), because push subscriptions belong to one web address; ours is `https://ferri.rudratechie.xyz/m`. Tunnel hosts go in `POCKET_ALLOWED_ORIGINS`. iPhone: add Pocket to the Home Screen first, then allow notifications from it.

## Telegram, Slack and Discord

Every group on every platform is a Switch room, so one event can have spaces on Telegram, Slack and Discord next to Mattermost. A question asked on Telegram becomes a card in the crew room; the crew answers once; everyone who asked the same thing on Slack or Discord gets the answer in their own app, with a real mention.

Connect each platform to Switch once (admin; the Gateway also does it from its Messaging apps page):

```
POST /gateway/collaborations
{ "bridge_type": "telegram", "display_name": "Telegram", "connection_config": { "bot_token": "...", "bot_username": "..." } }
{ "bridge_type": "slack",    "display_name": "Acme Slack", "connection_config": { "bot_token": "xoxb-...", "app_token": "xapp-...", "workspace_id": "T...", "agent_usergroups": false } }
{ "bridge_type": "discord",  "display_name": "Acme Discord", "connection_config": { "bot_token": "...", "guild_id": "..." } }
```

- **Telegram**: make a bot with BotFather, turn Group Privacy off before adding it anywhere, add it to the group.
- **Slack**: create the app from Switch's manifest (Socket Mode, no public URL), generate an `xapp-` token with `connections:write`, install it, `/invite` it to a channel.
- **Discord**: create an application, turn on the Server Members and Message Content intents, invite the bot with `bot` and `applications.commands`, then post once in the channel (that creates the room).
- Then type `!invite-agent @ferri` in the chat. The space shows up in Desk under Discovered, switched off, until you attach it to an event.
- Name the platform bot or app after Switch, not after Ferri. Slack and Discord turn a typed `@ferri` into a mention of a bot user whose name starts with "ferri", and then the message never reaches Ferri.
- Set `agent_greetings_enabled: false` on a connection (`PATCH /gateway/collaborations/{id}`) if Ferri should stay silent when it joins a space that is still off.
- `pnpm card:preview <room id>` opens a sample question card in any room, to see how that platform draws it (`--close` closes it).

## How Ferri learns

1. A member asks something the knowledge does not cover. Ferri tells them it is checking with the team.
2. Ferri opens a Switch question card in the crew room and pings the person who owns that topic (crew and topics live in `seed/events/<event>/event.yaml`). Someone else asking the same thing in other words joins the same card.
3. Anyone on the crew answers, on the card (`A1 "your answer"`) or just by telling Ferri (`@ferri dogs are fine on a leash`). Crew can also teach Ferri directly: `@ferri remember: lockers are on the 2nd floor`.
4. Everyone who was waiting gets the answer in their own room, with the source. The answer is saved as knowledge, so the next person gets it instantly.
5. Nobody answers: Ferri nudges the owner, then the whole crew, and finally marks the question unanswered. It never sends members anything the crew has not said.

## The plan: before the event

Ferri keeps each event's plan from the crew's own chat. Nobody fills in a form.

- Said in the crew room, no mention needed: "ok so we're doing it on 21 Nov at the makerspace, teams of up to 4" becomes three decisions; "I'll handle food, and Arjun takes registration" makes them the owners; "Arjun, can you book the sound system by Thursday?" becomes a task with an owner and a deadline. Ferri says in one line what it added. Questions and proposals ("should we cap at 120?") are not decisions; "yep, on it" does not finish a task.
- `@ferri draft the agenda` drafts a run of show from the event's knowledge and the plan, and opens one card per key decision still open (registration cap, judging format, prizes). Confirm it, Drop it, or write it your way (`A33 "teams of 2 to 5"`). Confirmed decisions members need are saved as knowledge, so "how many people can register?" is answered at once, with the source.
- Owners feed the routing: whoever the plan names for a topic gets that topic's cards first ("@ferri I own food from now on").
- Ferri reminds the owner in the crew room, with a push, when a task falls due. "@ferri the projector is booked" marks it done. "@ferri what's the plan?" sums up what is decided, waiting, open and due next.
- The plan is a Switch document in the crew room, re-written on every change, and a Plan page in Desk (confirm, drop, mark done, change owner and deadline, add items). Plan cards show in Pocket's Needs you.

## Announcements: inside to outside

What the crew decides becomes an update on every platform after one approval.

- In the crew room: `@ferri tell everyone lunch moves to 1:30`, `@ferri announce at 6 PM that submissions close at 7`. Ferri drafts the post and opens an approval card with the draft and every space it will go to. The event's leads get pinged and a push in Pocket.
- Ferri also watches the crew's own chat. When the crew settles something members need to know ("ok let's push judging to 4pm"), it offers an announcement on a card. It never posts without the OK.
- One OK (the card's button, `A1 "your own version"`, Desk, or Pocket) posts it to every Auto and Approve space of the event, on every platform, and saves it as knowledge, so answers use it from then on.
- `@ferri change the lunch announcement, it's 1:45 now` drafts a new version. Its OK edits the post in place everywhere it went.
- A scheduled announcement goes out at its time once approved. Not approved by then: it is not sent, and the crew is told.
- `@ferri remind me at 5 to order the pizza`: a reminder for the crew, in the crew room and as a push.
- `@ferri make team rooms for Team Alpha with meera and arjun, and Team Beta with priya`: Ferri runs a Switch template that makes a private channel per team on the crew room's platform, with the members, Ferri and a welcome message, attached to the event.
- Desk has an Announcements page (write, schedule, pick spaces, approve, edit everywhere, see each space's status); Pocket shows announcement cards in Needs you and has `+ Announce`.

## Ferri Builder: a coding agent that Switch runs

Some event work is making things: the event's one-page site, a day-of checklist, a sponsor one-pager, a poster. Ferri hands that to Ferri Builder, a second agent with its own sandbox.

- The Builder is a Switch managed agent: Claude Code on a Switch agent controller on the organizer's laptop (the headless controller runs natively on Windows with `run`). Ferri creates it through Switch's agent management. It works in its own folder (`~/.ferri/builder`, seeded from `builder/` in this repo) with its own Claude home, so the organizer's personal Claude settings never reach it. Tests run it on Claude Haiku 5.5 at low effort.
- In the crew room: `@ferri get the builder to make a one-page site for Build Night`, `@ferri can you make us a day-of checklist with owners from the plan?`. Ferri records job B1, invites the Builder to the room and hands it over with `send_targeted_message`. Switch starts a Builder session, which posts a heads-up, shows its work as an activity card, reads the event's knowledge and plan from the room's Switch documents, and posts the files in the room. It reports "Job B1 done:" to Ferri, which closes the job and pushes the person who asked.
- Nothing goes public without a yes. The Builder asks with a Switch card before any public step (deploy, push, email, post), and its permission rules make every such command a Claude Code permission prompt, which Switch shows as a card too. The card is answered in the room, in Desk or in Pocket; a no means nothing is published.
- Its own budget in Switch (400k output tokens and 60 turns per 24 hours by default). When it is spent Switch stops the Builder, and Ferri holds new jobs until the reset.
- Desk's Builder page shows the Builder and its machine as Switch reports them, the budget spend, the cards waiting for you, every job with its report, files and live address, a form for new jobs and a Cancel button. Pocket shows the Builder's cards in Needs you.

### The Builder ships the event site

`@ferri get the builder to ship the Build Night site with registration and sponsor credits` ends with a live site on Vercel and Supabase. Example: https://lantern-build-night.vercel.app (the made-up demo event).

- The Builder works from a kit in `builder/kits/event-site` (Next.js, Supabase, plain CSS) and a Claude Code skill, `ship-event-site`. It fills the site with the event's facts from the crew room's Switch documents and leaves anything missing as a visible placeholder.
- It creates the Supabase project and applies the schema, then sets the Vercel environment, with two scripts that never print a key. Its `vercel deploy --prod` becomes a Switch card for the crew; nothing goes live without "Allow".
- The site has registration, sign-in, "my registration", the schedule, FAQ and rules, and sponsor credit claiming: an organizer pastes a sponsor's single-use codes, each registered participant claims one per sponsor in one atomic database call, every claim and revoke is in an audit log, and organizers can revoke. Organizers (the crew's Switch emails) get an admin view with counts, registrations as CSV and the credit pools.
- When it is live, Ferri allows the domain in Shield and opens the "site is live" announcement card: one OK posts it to every space and saves the link as knowledge, so "where do I register?" gets the link with its source.
- The site reports back through Desk's public address (`POST /api/site` with a shared secret): the first registration and every tenth, and a sponsor's credit pool running low, reach the crew room, and the leads get a push.

## Shield: safety on every message

Shield is Ferri's Switch Trust endpoint. Switch sends every message, from people and from agents, to `POST /guardrails/check` before anyone sees it, and Shield answers in a few milliseconds (Switch's limit is 2 seconds; no model call in the path):

- Scam and lookalike links are blocked: `dlscord-gift.com`, `steamcommunlty.com`, punycode lookalikes, a brand name inside a strange domain with scam words, "free nitro" or "seed phrase" with a link, and anything on the community's block list. The message never reaches the room or Ferri, and Switch tells the sender.
- The same link posted three times in two minutes is blocked as a flood.
- API keys, tokens, private keys and database passwords are replaced with `[redacted]`, in members' messages and in Ferri's own posts.
- The crew hears about it in the crew room (the domain defanged, never the secret), and the leads get a push.
- Desk's Shield page shows the connection, the numbers and latency, what was stopped, and lets organizers allow or block domains.

Turn it on with `pnpm shield:connect` (writes `SHIELD_API_KEY` to `.env` and stores the endpoint in Switch; restart Ferri once), or with the button on Desk's Shield page. `pnpm shield:connect --off` turns it off. Set `GOOGLE_SAFE_BROWSING_KEY` to add a reputation lookup.

## Useful commands

| Command | What it does |
|---|---|
| `pnpm kb seed` | Load `seed/` into the database and update the Switch mirror |
| `pnpm kb list` | Show the live knowledge entries |
| `pnpm kb ask "<question>"` | Run the answer pipeline without Switch (`--room` as a room question, `--search` to force full text search) |
| `pnpm eval:answers` | Check Ferri's decisions on a fixed set: answers, room triage, card matching, crew intent |
| `pnpm dev:mattermost` | Create the local Mattermost test people and put them in the rooms |
| `pnpm desk` | Run Desk at http://localhost:3100 |
| `pnpm card:preview <room id>` | Open a sample question card in a room on any platform (`--close` to close it) |
| `pnpm crew:account <crew name> <email>` | Create a Switch login for a crew member and link it, for Pocket |
| `pnpm push:keys` | Write Web Push (VAPID) keys to `.env` once |
| `pnpm shield:connect` | Point Switch Trust at Shield (`--off`, `--status`) |
| `pnpm builder:setup` | Enroll this machine with Switch, have Ferri create the Builder, set its addressing and budget (safe to re-run) |
| `pnpm builder:controller` | Run the Switch agent controller that runs the Builder |
| `pnpm test`, `pnpm typecheck` | Unit tests and types |

## How we checked it

- `pnpm test`: 101 unit tests (knowledge, policy, cards, launch, the plan, the Builder's reports, hand-offs and site events, Shield detectors, push notices, the Switch stream parser, flow helpers).
- `pnpm typecheck`: seven packages.
- `pnpm eval:answers`: 77 fixed cases run against the real model (Claude Haiku 5.5, low effort): answers only with a valid source, room triage, card matching, crew intents, announcement drafts, the crew decision check, plan intents, build requests, reading the plan from crew chat and the agenda draft. 77 of 77 pass.
- Every feature was run end to end on the real local stack (Switch with Mattermost, Slack, Discord and Telegram connected) before the next one started: questions asked on Telegram answered once from the crew room and delivered on Slack and Discord; announcements posted to seven spaces and edited in place on four platforms; scam links blocked on Discord and Mattermost in 3 to 9 ms; announcement and answer cards approved from Pocket at phone size; the Builder making the event site, a checklist and a sponsor one-pager from crew requests and Desk, its publish and email cards refused from the room, Desk and Pocket with nothing published, and a spent budget stopping it; the Builder shipping the event site to Vercel and Supabase behind a deploy card, then registration, credit claims, a low-pool alert and a revoke on the live site.

## Repository layout

```
apps/ferri/          the Ferri agent service: message flow, learning loop, the plan,
                     announcements, scheduler, reminders, team rooms, Shield's HTTP route
apps/desk/           Desk (Next.js) and Ferri Pocket (the PWA at /m)
packages/switch/     our client for the Switch agent protocol and Gateway
packages/knowledge/  seeding, search, prompts, triage, answers with sources, drafts, the Switch mirror
packages/shield/     Shield's detectors (pure, no network) and its log
packages/push/       Web Push subscriptions and notices
packages/db/         Drizzle schema and migrations (Ferri runs them on start)
seed/                the demo community (Lantern Labs) and event (Lantern Build Night)
skills/              Ferri's persona and answer rules, in markdown
builder/             Ferri Builder's workspace template: its CLAUDE.md and permission rules
scripts/             setup, knowledge CLI, eval, test people, Shield connect, Builder setup and controller
infra/               Ferri's Postgres (pgvector) for Docker
```

## License

MIT. Switch itself is licensed by SandboxAQ under its own terms (Apache 2.0 with the Commons Clause); Ferri talks to it over its public HTTP APIs.
