# Ferri

Ferri is an AI teammate for people who run community events. It answers the community on every platform and asks the organizing team only when it does not know. When the team decides something, Ferri tells everyone.

Built on [Switch](https://github.com/sandbox-quantum/switch), which puts agents and people in the same rooms across Slack, Discord, Telegram, Mattermost and Microsoft Teams.

> Work in progress. This README grows with each piece we ship.

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

4. Open Mattermost at http://localhost:8065, go to the `ferri-lab` channel and try:
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

Setup: `pnpm setup:switch` (or `pnpm push:keys`) writes the VAPID keys to `.env`. A crew member without a Switch login gets one with `pnpm crew:account <crew name> <email>`, which also links them. Phones need HTTPS: run `cloudflared tunnel --url http://localhost:3100` and open the `https://….trycloudflare.com/m` link (iPhone: add it to the Home Screen first, then allow notifications). Extra tunnel hosts go in `POCKET_ALLOWED_ORIGINS`.

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
| `pnpm test`, `pnpm typecheck` | Unit tests and types |
