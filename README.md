# Ferri

**The AI teammate for people who run community events.** Ferri answers your community on every platform, asks your crew only when it does not know, and turns what the crew decides into an update everywhere after one OK.

Built on [Switch](https://github.com/sandbox-quantum/switch) for the WeMakeDevs "Flip the Switch" hackathon (Track 1, best business workflow). Built by voice with Wispr Flow.

It covers the whole life of an event, from the crew's first chat to the starter kit for the next one: answers with sources on Mattermost, Slack, Discord, Telegram and WhatsApp; a living plan; announcements edited in place everywhere; care cases for members who are stuck or upset; the guest list and RSVPs; posts on LinkedIn, X and Instagram through Buffer; desks for judging, check-in and help, with live sheets; a recap and a starter kit at the end; and a coding agent, Ferri Builder, that Switch runs to ship the event site, posters and listings. Every step that reaches people outside waits for one OK on a Switch card.

- Demo video: _link coming_
- Switch fork with our two core changes (agent message edit, a WhatsApp bridge): [`RudraO2/switch`, branch `ferri/agent-message-edit`](https://github.com/RudraO2/switch/tree/ferri/agent-message-edit)

## The problem

A hackathon, a meetup or a festival night has members on Discord, Telegram, Slack and a Mattermost or WhatsApp group, and a small crew of volunteers running it. The same three questions arrive forty times on five apps. Answers given in one group never reach the others. The crew decides something in their own chat ("lunch moves to 1:30") and half the members never hear it, or hear the old time. A fake "free nitro" link lands in the busiest channel at the worst moment. Every organizer we know runs this by hand, at night, on their phone.

## What Ferri does: three pillars

Ferri is one agent that works in two directions, with a bridge between them.

**1. Outward: answers on every platform, with sources.** Ferri sits in every group of the event, on Mattermost, Slack, Discord, Telegram and WhatsApp. It answers only from the event's knowledge and names the source under every answer, in the tone and language the crew set for that space. It also notices questions nobody addressed to it ("does anyone know the wifi password?"), waits a moment so a person can answer first, and steps in only when it has a sourced answer. Each space has a mode: Off, Listen, Approve (every reply waits for an organizer) or Auto. Ferri also notices people, not only questions: a member who is confused, stuck, upset or unsafe becomes a care case for the right person on the crew, and a technical problem can go to the Builder, which helps the member in their own room.

**2. Inward: the crew plans and decides, Ferri learns.** Before the event, Ferri follows the crew's own chat and keeps a living plan: what is decided, who owns what, tasks with deadlines, what is still open. "@ferri draft the agenda" gives a run of show plus one approval card per key decision. Owners named in the plan ("Priya will handle food") take over the routing, so food questions go to Priya. During the event, when Ferri does not know, the member hears "I'm checking with the team" at once, and a Switch question card opens in the crew room for the person who owns that topic (food, venue, judging). The owner's phone buzzes through Ferri Pocket. One answer, on the card, from Desk, or from the phone, reaches everyone who was waiting, on their own app, with a real mention. The answer is saved, so the next person gets it instantly. Nobody answers: Ferri nudges the owner, then the whole crew, and never invents an answer. "@ferri make a judging desk with arjun" makes a private channel for that job, with its own instructions and a live sheet Ferri keeps from what people say there ("Team Alpha 8 for innovation"). After the event, Ferri counts what happened in a recap, saves the partners, and builds a starter kit that the next event starts from.

**3. The bridge: a decision inside becomes an update outside.** "@ferri tell everyone lunch moves to 1:30" drafts an announcement and opens one approval card with the draft and every space it will reach. One OK posts it to every space of the event on every platform and saves it as knowledge. "@ferri change the lunch announcement, it's 1:45 now" and one more OK **edits the post in place** on Mattermost, Slack, Discord and Telegram. Ferri also follows the crew's own chat: when the crew settles something members need to know ("ok let's push judging to 4pm"), it offers the announcement on a card, credited to whoever decided, and never posts without the OK. Announcements can be scheduled; one not approved by its time is not sent, and the crew is told. A space with its own language gets its own translation, shown on the same card. The same one-card rule covers the guest list (reminders and spot offers by email) and social posts on LinkedIn, X and Instagram through Buffer.

Around the pillars:

- **Shield** keeps scam links, link floods and leaked API keys out of every room, on every platform, before anyone sees them. It is our own Switch Trust endpoint and answers in 2 to 9 ms, with no model in the path.
- **Desk** is the organizers' dashboard: spaces and modes, master pause, cards, the plan, events and crew, knowledge with versions, announcements, care cases, guests, social posts, desks and sheets, contacts, wrap, skills and settings, the Builder, Shield.
- **Ferri Pocket** is the crew's phone app (a PWA with Web Push): the cards that need you (answers, announcements, care cases, guest sends, social posts, desks, wrap), Post, Edit, Don't post, who is stuck, and a `+ Announce` button.
- **Customization**: the crew edits Ferri's skills in Desk and sets tone, language and timing per community, event or space, from Desk or by chat ("@ferri reply in Hindi in team-alpha"). The source check, the cards and the pause are in code, so no edit can turn them off.
- **Ferri Builder** is Ferri's second pair of hands: a Claude Code agent that Switch itself runs on the organizer's laptop, with its own folder, its own Claude home and its own token budget. "@ferri get the builder to make a one-page site for Build Night" hands it the job in the crew room; it reads the event's facts from the room's Switch documents, posts the page there, and asks on a card before anything goes public.
- **Crew helpers**: "@ferri remind me at 5 to order the pizza", and "@ferri make team rooms for Team Alpha with meera and arjun", which makes real private channels on the platform from a Switch template.

## Why Switch is the spine

Ferri does not work without Switch. Every group on every platform is a Switch room, Ferri is one Switch agent in all of them, every approval is a Switch card, and every message passes Switch Trust. We use Switch as deeply as we could find it:

| Switch feature | What Ferri does with it | Where |
|---|---|---|
| Rooms bridged to Mattermost, Slack, Discord, Telegram and WhatsApp | Every group is a Switch room. One agent connection serves every platform, and one answer fans out to askers on four apps with native mentions. WhatsApp comes through the `whatsapp_web` bridge we added to our fork. | `apps/ferri/src/flow.ts`, `rooms.ts` |
| Always-on custom agent protocol | Our own small TypeScript client: event stream with a string cursor, heartbeat, typing, posting, ops, catch-up after a restart. | `packages/switch` |
| Addressing and `follow_the_conversation` | Ferri tells a real mention from a follow-up, and runs a fast triage model on room chatter it was not addressed in. | `apps/ferri/src/mentions.ts`, `packages/knowledge/src/triage.ts` |
| Question cards (`/agent-sessions/{sid}/approvals`) | Every step that needs a person is a card: unknown questions, replies waiting in Approve spaces, announcement versions, plan decisions, care cases, guest emails, freed spots, social posts, desk packs, outreach emails and closing an event. The ladder (nudge, escalate, close) runs on them. Buttons on Slack, Discord and Telegram; typed answers (`A1 "text"`) everywhere, WhatsApp included. | `apps/ferri/src/loop.ts`, `launch.ts`, `care.ts`, `guests.ts`, `social.ts`, `desks.ts`, `wrap.ts` |
| The card text limit | Switch's text renderer (Mattermost, WhatsApp) shows at most 800 characters of a card's prompt and makes a longer card unanswerable from the message. Ferri posts any prompt over 780 characters as a message just above the card and gives the card a short pointer, so long drafts (a social post for three networks, a guest email) stay answerable. | `packages/switch/src/client.ts` (`openQuestionsCard`) |
| Answering a card as a person (`/gateway/agent-sessions/.../answer`) | Desk and Pocket answer cards through Switch under the signed-in organizer's name. | `apps/desk/lib/cards.ts` |
| Switch Trust (`/guardrails/check`) | Shield, our own Trust endpoint inside the Ferri service: blocks scams and floods, redacts secrets, alerts the crew. | `packages/shield`, `apps/ferri/src/shield.ts` |
| Templates v2 (`create_room_from_yaml`) | "Make team rooms" and "make a judging desk" create real channels on the platform (private or public) with the people asked for, Ferri and a kickoff, attached to the event at once with the desk's mode. | `apps/ferri/src/launch.ts`, `apps/ferri/src/desks.ts`, `packages/knowledge/src/desks.ts` (`deskTemplate`) |
| Library documents | The live knowledge is mirrored into a Switch library document attached to the event's rooms. Each event's living plan, its recap and its starter kit are documents in the crew room, and every desk sheet is a document in its desk room. All of them follow every change. | `packages/knowledge/src/mirror.ts`, `apps/ferri/src/plan.ts`, `wrap.ts`, `desks.ts` |
| Agent media (`/agents/{id}/rooms/{room}/media`) and `read_context` | Posters go out as native images on every platform with one OK. Switch delivers to Ferri only what is addressed to it, so Ferri reads the Builder's files from the room with `read_context`. | `packages/switch/src/client.ts` (`sendMedia`), `apps/ferri/src/builder.ts` |
| Agent management and the headless agent controller | Ferri creates its own Builder through Switch (`create_agent`, after its owner allows it to manage agents): a managed Claude Code agent on a Switch agent controller running on the organizer's laptop. Switch starts a Builder session whenever it is addressed and gives it the Switch tools over MCP. | `scripts/builder-setup.ts`, `apps/ferri/src/builder.ts` |
| Handing work to a coding agent (`invite_agent_to_room`, `send_targeted_message`) | Ferri puts the Builder in the crew room and hands each job over as a targeted message, bound to that one room through a session of Ferri's own (`X-Switch-Session-Id`). The Builder reports back to Ferri with a targeted message of its own. For a care case, the hand-off happens in the member's own room, and the Builder helps them there. | `packages/switch/src/client.ts` (`roomOp`), `apps/ferri/src/care.ts` |
| Addressing policy (`PUT /gateway/agents/{id}/addressing-policy`) and follow-ups | The policy decides who may address the Builder and answer its cards. Ferri keeps it at the owner everywhere, anyone in the crew rooms, and a member's room only while the Builder helps that member; the room leaves the policy when the case closes. Switch's follow-ups then carry the member's next replies to the Builder without a mention, and Ferri stays quiet on them. | `apps/ferri/src/builder.ts` (`syncPolicy`), `packages/knowledge/src/care.ts` (`builderPolicy`) |
| Session activity and the coding agent's own cards | The Builder's progress shows as Switch activity cards (steps, tool calls, time). Its Claude Code permission prompts and questions become Switch cards in the room, answered there, in Desk or in Pocket (`/gateway/agent-sessions/approvals`). Public steps (deploy, push, email) always ask. | `builder/.claude/settings.json`, `apps/desk/lib/builder.ts` |
| A coding agent shipping to production behind a Switch card | The Builder creates the event site's Supabase project, sets Vercel's environment and deploys; Claude Code's permission prompt for `vercel deploy --prod` is the Switch card the crew answers. | `builder/kits/event-site`, `builder/.claude/skills/ship-event-site` |
| Budgets (`/gateway/tenants/{tid}/budgets`) | The Builder has its own output-token and turn budget per 24 hours. Switch stops it when it is spent; Ferri holds new jobs until the reset, and Desk shows the spend. | `scripts/builder-setup.ts`, `apps/desk/app/(desk)/builder` |
| Room documents as shared context | The hand-off points the Builder at the knowledge and plan documents attached to the crew room; it reads them with `load_internal_documents`, so the brief stays short. | `packages/knowledge/src/builder.ts` |
| Gateway (auth, rooms, agents, collaborations, addressing policy) | Desk and Pocket sign in with Switch accounts. Desk adds Ferri to rooms, discovers spaces, connects Shield. | `apps/desk`, `scripts/` |
| **Agent message edit (new, in our fork)** | Switch had no way for an agent to edit a message it posted. We added it to Switch core. See below. | [`RudraO2/switch@2711974`](https://github.com/RudraO2/switch/commit/2711974943c2e72540e012cb8171c9e59cfd2511) |
| **WhatsApp bridge, `whatsapp_web` (new, in our fork)** | A Switch messaging platform for WhatsApp groups through a linked device, so WhatsApp groups are rooms like any other. See below. | `../switch/core/switch_core/bridges/collaboration/whatsapp_web/adapter.py`, [`RudraO2/switch@e5c2fc6`](https://github.com/RudraO2/switch/commit/e5c2fc68e140f26677ab4fbcf2de8eb1479be22b) |

### What we added to Switch: agent message edit

The bridge pillar needs "fix the announcement everywhere". Switch had no op and no route for an agent to edit its own message, though every platform adapter already had `update_message` and every bridge keeps a map from room event to platform post. So we added it to Switch core, in our fork:

- `POST /agents/{agent_id}/messages/{event_id}/edit` with `{room_id, content}`, returning `{ok, edited}`.
- `AgentCore.edit_message` checks room membership and budget like a post, refuses any message that is not the agent's own (403), and runs the new text through Switch Trust, so Shield checks edits too.
- `CollaborationCore.handle_outbound_edit` finds the platform post in the bridge's message map and calls the adapter. Telegram writes the agent's name into the body, so its edit keeps "Ferri:" at the top.
- Switch's own room history keeps the message as first sent.

We run it as a thin image over the published Switch dev image (`deploy/local/ferri/` in the fork), so nothing else in the stack changes. Without that image Ferri still works: an edit falls back to a new post that starts with "Update:".

### What we added to Switch: a WhatsApp bridge

Community groups often live on WhatsApp, and the Switch release we build on had no WhatsApp bridge. We added a messaging platform, `whatsapp_web`, to our fork, the way Switch's own guide adds one: one adapter folder, one line in `platforms.py`, and a docs page (`docs/messaging-platforms/whatsapp_web.md` in the fork).

- It talks to a WAHA sidecar (the GOWS engine) linked to the organizer's own number, by QR code or pairing code. The adapter dials out to WAHA's event WebSocket and posts through its REST API, so no public address is needed.
- Only the chats named in the connection's `chats` list become rooms (group names or ids, `*` for every group, `me` for the "Message yourself" chat). The organizer's other chats never reach Switch.
- Agents post as "*Ferri:* ...". Posts are paced like a person: typing first, at least 3 seconds between posts in one chat, at most 30 an hour, and refused past the cap rather than queued. The bridge never relays its own posts back.
- Quote replies are threads. Edits, deletes and attachments go both ways. Cards are answered by typing (`A1 1`).
- 26 adapter tests in the fork (config, pacing, which chats, the echo filter, the self chat, media, edit, delete, the cap). The adapter ships in the same thin core image; the sidecar is a compose profile, `whatsapp`.

## How it fits together

```
 Discord   Slack   Telegram   Mattermost   WhatsApp (WAHA sidecar)    members and crew, on their own apps
    \        |        |          /           /
     +-------+--------+---------+-----------+
                  |
          Switch (our fork)       rooms, bridges, cards, templates, library docs, media,
                  |               Trust, budgets, agent message edit, whatsapp_web
        +---------+----------+
        |                    |
  Ferri service         Shield (Trust endpoint, same process, 127.0.0.1:3200)
  apps/ferri            packages/shield: scam links, floods, secrets, 2-9 ms
        |
        |  invite_agent_to_room, send_targeted_message      Switch agent controller (headless,
        +-------------------------------------------------> on the laptop): Ferri Builder, a
           "Job B1 done:" back to Ferri                     managed Claude Code agent with its
                                                            own folder, Claude home and budget
  flow, learning loop, plan,         Claude Haiku 5.5: triage, care reading, sheets,
  announcements, care, guests, ----> decision check, translations, lessons
  social, desks, wrap, settings      Claude Sonnet 5.5: answers and drafts
        |
        +---->  Resend (outreach and guest email), Buffer (LinkedIn, X, Instagram),
        |       media host (Cloudflare Worker + KV, infra/media-worker)
        |
  Postgres 16 + pgvector (knowledge with revisions, spaces, events, crew, questions,
        |                 cards, announcements, cases, guests, social posts, desks
        |                 and sheet rows, contacts, recaps and kits, skills, settings,
        |                 shield log)
        |
  Desk (Next.js, laptop)  +  Ferri Pocket (PWA at /m, Web Push)  +  public /rsvp/<code>
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
   # Ferri's core image: the same release plus the fork's agent message edits (for announcements) and the whatsapp_web bridge
   docker build -f deploy/local/ferri/Dockerfile --build-arg BASE=ghcr.io/sandbox-quantum/dev/switch-core:0.31.1-dev.339.g86d5928 -t ferri/switch-core:local .
   docker compose -f deploy/local/standalone-docker-compose.yml -f deploy/local/ferri/compose.override.yml --profile collab --profile gateway --project-directory . up -d switch
   ```

   Switch has no way for an agent to edit a message it posted. The fork adds `POST /agents/{agent_id}/messages/{event_id}/edit`: Switch checks the message is the agent's own, runs the new text through Switch Trust, and the room's bridge redraws the post in place (Mattermost, Slack, Discord, Telegram). Without the image, announcements still post; edits are posted again as "Update:". The same image carries the `whatsapp_web` bridge (setup under "Optional" below).

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

### Optional: WhatsApp, email, guests and social

Each one needs its own keys or setup. Ferri runs without them.

- **WhatsApp** (the fork's `whatsapp_web` bridge). In `../switch/.env`, set `WAHA_API_KEY` and add `waha` to `OUTBOUND_ALLOWED_PRIVATE_HOSTS`. Then start the sidecar and pair it from here:

  ```bash
  cd ../switch
  docker compose -f deploy/local/standalone-docker-compose.yml -f deploy/local/ferri/compose.override.yml --profile whatsapp --project-directory . up -d waha
  cd ../ferri
  pnpm whatsapp:pair              # or: pnpm whatsapp:pair --code <phone number> for a pairing code
  ```

  `pnpm whatsapp:pair` adds the `whatsapp_web` connection to Switch (the chats come from `FERRI_WHATSAPP_CHATS`, default `me,Lantern Build Night`) and writes the QR code to `ferri-whatsapp-qr.png` in the temp folder. Scan it from WhatsApp's Linked devices. A chat becomes a room with its first message; then use Add Ferri in Desk and attach the space to an event.

- **Email** (partner outreach and guest emails, through Resend). Put `RESEND_API_KEY` in `.env` (the sending domain must be verified in Resend for sending and receiving), run `pnpm email:setup`, then restart Desk and Ferri. `FERRI_EMAIL_DAILY_CAP` (20) limits outreach and `FERRI_GUEST_EMAIL_DAILY_CAP` (80) limits guest emails. For a rehearsal, `FERRI_GUEST_EMAIL_ALLOW=<your domain>` emails only guests at that domain and skips the rest.

- **Guests from the event site**. `FERRI_SITE_HOOK_SECRET` is the shared secret the site uses for its hook to Desk and for its guest list route. Guests answer on Desk's public `/rsvp/<code>` page, so set `FERRI_PUBLIC_URL` to Desk's tunnel address. Luma guests are read in the Builder's own browser, so log in to Luma there once (see Useful commands).

- **Social posts** (Buffer). Put `BUFFER_API_KEY` in `.env` (Buffer, Settings, API; scopes `account:read`, `posts:read`, `posts:write`) and a long random `FERRI_MEDIA_SECRET`. Buffer has no upload: it fetches each image from a public address when the post goes out. So Ferri runs a small media host, a Cloudflare Worker with Workers KV, in `infra/media-worker`:

  ```bash
  cd infra/media-worker
  npx wrangler login
  npx wrangler kv namespace create MEDIA      # put the id into wrangler.toml
  npx wrangler secret put MEDIA_SECRET        # the same value as FERRI_MEDIA_SECRET
  npx wrangler deploy
  ```

  Set `FERRI_MEDIA_URL` to your Worker's address if it is not ours. On real accounts, test with "Save as Buffer drafts" and a far-off date.

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
- **Community**: the central instructions, the mute list, and the community's settings.
- **More pages**, each described in its own section below: Plan, Announcements, Care, Guests, Social, Desks, Contacts, Wrap, Skills, Builder and Shield.

## Ferri Pocket

Pocket is the crew's phone app: a PWA at `/m` inside Desk (http://localhost:3100/m), with the same Switch sign-in.

- **Needs you**: the cards for you (topics you own, replies waiting for your OK, anything escalated to the whole crew), then the rest of what is open.
- **A card**: who is waiting, on which platform, and for how long. Write the answer and send it, or don't answer. For a reply waiting in an Approve space: Send, Edit, or Don't send. It goes through Switch under your name.
- **Who is stuck**: every member still waiting on the crew, longest first, and who never got an answer in the last day.
- **Me**: say which crew member you are (once), turn on notifications, send a test.
- **Push**: Web Push (VAPID). Your phone buzzes when a card for you opens, at the nudge, when it is escalated to everyone, and when it expires. When someone else answers, the notification changes to "Answered by Priya" so stale buzzes never linger.

Setup: `pnpm setup:switch` (or `pnpm push:keys`) writes the VAPID keys to `.env`. A crew member without a Switch login gets one with `pnpm crew:account <crew name> <email>`, which also links them. Phones need HTTPS. For a quick try, run `cloudflared tunnel --url http://localhost:3100` and open the `https://….trycloudflare.com/m` link. For real use, put Desk on a stable hostname with a named tunnel (`infra/cloudflared.example.yml`), because push subscriptions belong to one web address; ours is `https://ferri.rudratechie.xyz/m`. Tunnel hosts go in `POCKET_ALLOWED_ORIGINS`. iPhone: add Pocket to the Home Screen first, then allow notifications from it.

## Telegram, Slack, Discord and WhatsApp

Every group on every platform is a Switch room, so one event can have spaces on Telegram, Slack, Discord and WhatsApp next to Mattermost. A question asked on Telegram becomes a card in the crew room; the crew answers once; everyone who asked the same thing on Slack or Discord gets the answer in their own app, with a real mention.

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

### WhatsApp

WhatsApp goes through the `whatsapp_web` bridge in our fork (see "What we added to Switch" above), linked to the organizer's own number. `pnpm whatsapp:pair` sets it up (steps in "Run it locally").

- Only the chats you name become rooms: groups by name, and `me` for the "Message yourself" chat, which is a handy private test room. The rest of the phone's chats never reach Switch.
- From there a WhatsApp group is a space like any other: Add Ferri in Desk, attach it to an event, pick a mode. Ferri answers with its sources, unknown questions become cards in the crew room, and announcements reach the group after the same one OK.
- Ferri's posts start with "*Ferri:*" and are paced (typing first, a gap per chat, a cap per hour), so the linked number behaves like a person.
- A card shown on WhatsApp is answered by typing (`A1 1`, `A1 "text"`); WhatsApp gets no buttons for it.

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
- The site has registration (with a capacity, a waitlist and "Free my spot", which feed Ferri's guest list), sign-in, "my registration", the schedule, FAQ and rules, and sponsor credit claiming: an organizer pastes a sponsor's single-use codes, each registered participant claims one per sponsor in one atomic database call, every claim and revoke is in an audit log, and organizers can revoke. Organizers (the crew's Switch emails) get an admin view with counts, registrations as CSV and the credit pools.
- When it is live, Ferri allows the domain in Shield and opens the "site is live" announcement card: one OK posts it to every space and saves the link as knowledge, so "where do I register?" gets the link with its source.
- The site reports back through Desk's public address (`POST /api/site` with a shared secret): the first registration and every tenth, and a sponsor's credit pool running low, reach the crew room, and the leads get a push.

### The Builder makes the posters and social cards

`@ferri get the builder to make the Build Night poster and social cards` ends with a print poster and a card for every platform, all with the same exact text.

- The background art comes from an image model (`gpt-image-2.6-flare`, one call per job, at most two). It is never asked to write words.
- Every word, the date, the venue, the address and a QR code are drawn on top by Satori from a `design.json` the Builder fills from the room's documents, so there are no typos. The kit (`builder/kits/posters`) refuses a character the fonts cannot draw, and reads the QR code back from every image it made.
- Six formats from one design: A4 print (PNG, JPEG, SVG), square, 4:5, story, link card and X. A photo the crew attaches to the request becomes the background instead.
- The Builder posts the square, the story and a poster preview in the crew room. Ferri then opens a "share the poster" card; one OK posts the image with a short caption to every space on every platform.

### The Builder lists the event on Luma and other platforms

`@ferri get the builder to put Build Night on Luma` ends with the event listed, and nothing is published until a person says yes.

- Luma's public API needs a Luma Plus subscription on the calendar. With a key (`LUMA_API_KEY`), the Builder creates the event through the API, with the poster uploaded as the cover. Without one, and for every platform without an API, it uses the platform's own form.
- The form is filled in the Builder's own browser: a Chrome window with a profile of its own on the organizer's screen. A person logs in to each platform there, themselves. Ferri never types, sees or keeps a password and never creates an account. If a login or a captcha shows up, the Builder posts a screenshot and asks on a card, and carries on after "Done".
- The kit (`builder/kits/listings`, Playwright on the installed Chrome) fills Luma's form from a `listing.json` written from the room's documents: name, times and time zone, the exact venue, description, visibility, capacity, and the poster's square card as the cover. While it fills, it blocks the platform's publish request and every click on a publish button.
- The Builder posts a screenshot of the filled form in the crew room. Submitting is a separate script whose Claude Code permission prompt is the Switch card; it refuses if the form changed since the screenshot. After "Allow once", it reads the listing's address back and posts the live page.
- Ferri then allows the platform's domain in Shield and opens the "Build Night is on Luma" announcement card. Any other site works without new code: the Builder lists the page's fields with `inspect`, writes a `form.json`, and the same fill, screenshot and card follow.

## Partner outreach by email

Events need sponsors, venues, colleges and other communities. Ferri finds them, writes to them from the community's own address, and keeps track of every reply, in a light CRM.

- `@ferri find colleges and companies in Bengaluru that could sponsor or host Build Night` is a Builder job with the `find-partners` skill. The Builder searches the web and lists organizations that fit, each with an email address only when it is published on a page that names it, and that page as the source. It never guesses an address. Ferri adds them to Contacts as prospects. Nobody is emailed.
- `@ferri email CloudCo about sponsoring cloud credits` drafts the email from the knowledge (no invented numbers) and puts all of it on a Switch card: To, From, Subject and the body. "Send it" sends it through Resend from `partners@rudratechie.xyz`. "Don't send" sends nothing, and a version written in quotes is sent instead. A cold email ends with one line: reply "no thanks" and we won't write again.
- Each contact has its own reply-to address (`partners+<code>@...`), so a reply always finds its contact. Resend's webhook reaches Desk's `/api/email`, which checks the Svix signature. Ferri fetches the email, keeps it on the contact's timeline and tells the crew in their room what the partner said and what to do next. For a question or a yes, it drafts the answer on a new card. "no thanks" marks the contact "do not contact", and Ferri refuses to write to them again. A bounce or a spam report does the same.
- At most 20 outreach emails a day (`FERRI_EMAIL_DAILY_CAP`). Desk's Contacts page lists every contact by status with its timeline, the emails waiting for an OK, "Draft an email" and "Add a contact". Pocket shows the email cards in Needs you.
- `@ferri who have we heard back from?` answers from the contacts.

The same domain gives the event site real email. Supabase sends its auth emails through Resend's SMTP from `events@rudratechie.xyz` (`scripts/supabase-email.mjs` in the site kit). Registering sends a link that confirms the address and signs in, and the sign-in page offers "Email me a link".

## Care: members who are stuck or upset

A question has an answer. A member who is stuck, confused or upset needs a person. Ferri notices them and hands them to the right one.

- Ferri reads every member message in every attached space (Listen, Approve and Auto) with one fast Haiku call next to triage, and never holds up an answer for it. A plain question goes to the learning loop as before; a joke or ordinary grumbling is not a case.
- Someone confused, stuck, upset or unsafe becomes a case (Case 1, Case 2, ...) with a plain reason the crew can read at a glance: "Meera is frustrated and feels ignored: she asked twice where her team should sit and got no reply." Its owner is the person who owns that topic, else whoever is on duty, else the leads. Unsafe (harassment, a threat, a medical problem) is always urgent: it goes to the person on duty and every lead, with a push.
- The crew room gets one line naming the owner and a Switch card: I'm on it, Send the Builder (for technical problems), Solved, Not a case, or a written message in quotes that Ferri delivers to the member, in their space, as the crew's words: `A64 "Meera, I am coming to you right now. Please stay by the registration desk."`.
- A case stays open until it is solved, unlike a card. In the crew room: `@ferri case 3 solved, I walked her team to the table`, `@ferri I've got case 3`, `@ferri send the builder to case 3`, `@ferri who's stuck?`. When the member says it works now, Ferri closes the case with their words. An open case with no news gets a check-in with a push to its owner.
- Technical problems can go to Ferri Builder. Ferri adds the member's room to the Builder's addressing policy, invites it and hands the job over there. The Builder helps the member in their own room, asks for the error text, never asks for passwords or keys, and never deploys, pushes or posts anywhere else. "Job done" solves the case. "Job stuck" gives it back to its owner with a push and what is needed. While the Builder helps someone, Ferri stays quiet on that person's messages, so the two never talk over each other. During the event, a technical case in an Auto space goes to the Builder at once; before it, or in an Approve space, the crew's tap on the card is the go-ahead. Listen spaces never get the Builder.
- Ferri never posts "sorry you're upset" to the member itself. People reach the member: the crew's own words, or the Builder for a technical problem.
- Desk's Care page lists open cases first, with owner, age, where, the Builder job and the timeline, and the same actions. Pocket shows care cards in Needs you, open cases at the top of Who is stuck, and a page per case.

## RSVP and the guest list

Ferri keeps one guest list per event, from wherever people registered, and keeps it moving: reminders, "can you still come?", and a freed spot passed to the next person on the waitlist.

- Sources: the event site the Builder ships (a status per registration, a capacity with a waitlist, a "Free my spot" button, and a guest list route for Ferri), Luma (Ferri reads the host's Guests tab in the Builder's own browser, with no model call; Luma's API needs Luma Plus, so the browser is the default), and a CSV pasted in Desk (Luma's export, Google Forms, any sheet with names and emails).
- In the crew room: `@ferri remind the guests to bring their laptop, charger and a photo ID, doors open at 9 AM`, `@ferri ask everyone who can't come to free their spot`, `@ferri how many are coming?`, `@ferri sync the guest list`.
- Every send is one Switch card with the audience, how many people, the subject and the whole email as a guest will get it. One OK sends one personal email per guest ("Hi Asha,") from `<event name> <events@...>`, with their own RSVP link. "Don't send" sends nothing. At most 80 guest emails a day by default.
- The RSVP link is Desk's public `/rsvp/<code>` page: "I'm coming" or "I can't make it". A reply to the email works too: Ferri reads it and the crew room hears it.
- A freed spot opens one card: "Asha can't come. Offer the spot to Ravi, first on the waitlist?". Yes on Luma: the Builder's browser admits Ravi (Luma emails him) and sets Asha to Not Going without a notice. On the site or a list: Ravi gets an offer email and 24 hours to say yes.
- Ferri proposes the day-before reminder and a "free your spot" nudge itself, once per event, on a card like any other.
- Desk's Guests page shows the counts, the list with its sources and last sync, Import CSV, Sync now, and the sends waiting for an OK. Pocket shows guest and spot cards.
- What we checked, on a private Luma test event with test guests on our own domain: the Luma sync, a CSV import, a declined reminder (no mail) and a sent one (delivered), a guest freeing her spot on the RSVP page, Luma admitting the next guest after the spot card, an emailed "I can't make it" read and applied, and the day-before reminder proposed once. The site's guest route was checked on a local copy of the site against the live database, and again on the live site after its redeploy (refused without the key, the list with it). The emailed spot offer (for the site or a CSV list) is built but was not run live, because the test had a Luma waitlist.

## Social posts: LinkedIn, X and Instagram through Buffer

`@ferri post the Build Night poster on LinkedIn, X and Instagram on 1 June 2027 at 10 AM, saying registration is open` ends with one card that holds every post.

- Ferri drafts one text per network from the knowledge, sized for it: X fits 280 characters with the site link, Instagram has no link (it would not be clickable there), LinkedIn is longer. Instagram is left out when there is no image.
- The poster comes from the Builder's poster job. Buffer has no upload, so Ferri puts the image on its own media host (`infra/media-worker`, a Cloudflare Worker with Workers KV, behind `FERRI_MEDIA_SECRET`) and gives Buffer that address.
- The social card shows every text, the image and the time. "Post it" (or "Schedule it", up to two years ahead), "Save as Buffer drafts", "Don't post", or the crew's own words. Nothing reaches Buffer before that answer.
- Ferri follows the posts in Buffer (sent, deleted) and removes the image from the media host as soon as every post that uses it is done, refused or deleted.
- Desk's Social page shows the channels, the cards waiting, a form to write a post, and each post with "Delete in Buffer". Pocket shows social cards.
- What we checked: Buffer's API with our key (three channels), the media host, a declined card (nothing sent, image removed), and "Save as Buffer drafts" making three dated drafts in Buffer that Desk then deleted. The accounts are real personal profiles, so we tested with drafts only: nothing was ever posted live.

## Desks: rooms for each job, with sheets

A hackathon needs a judging channel, a check-in table and a help desk. Ferri makes them from Switch templates, each with its own skill.

- `@ferri make a judging desk with arjun` makes a private channel, `#bn-judging`, on the crew room's platform, with Arjun, Ferri and a kickoff, attached to the event at once. The name starts with the event's initials.
- A desk is a skill file: `skills/desks/<kind>.md`, YAML front matter (room name, private or public, Ferri's mode there, who is invited, the topic its cards route to, care, an optional sheet, the kickoff) and then how Ferri behaves in that room. Eleven come with Ferri: help, judging, mentors, volunteers, checkin, speakers, sponsors, food, safety, tables and lost-found.
- Packs set up several at once: `skills/packs/<type>.md` for a hackathon, meetup, game night, festival, workshop or conference. `@ferri set up the desks for a meetup` opens one card listing every room; "Make them" makes them, "Don't" makes nothing.
- No kind fits? `@ferri make a desk for the rangoli judges where they post scores per entry, with arjun` has Ferri write a new desk skill and show the whole skill on a card. "Make it" saves it (editable in Desk) and makes the room.
- Sheets: in a desk with a sheet, Ferri reads each message (add a row, change a row, show the sheet, or nothing). "Team Alpha 8 for innovation" is noted, "actually make it 9" changes the row, and "@ferri show the scores" posts the ranked totals. The totals are counted in code, not by the model. Each sheet is a Switch library document in its desk room, updated on every change, and a CSV download in Desk.
- The check-in desk marks guests checked in on the guest list ("checked in Meera Test"), and asks about a name that is not on it. A help desk sends technical problems to the Builder at any stage of the event. Messages that are not sheet entries are answered as usual, with sources.
- Desk's Desks page shows each desk with its room, kind, mode and sheet, and lets the crew make a desk, set up a pack, or turn an existing space into a desk. Pocket shows desk cards.

## Wrap: recap, partners, starter kit, closing

When the event is over, Ferri helps the crew finish it and start the next one.

- `@ferri how did build night go?` posts a recap in the crew room: questions asked and answered (by Ferri at once, by the crew on cards, still unanswered), median answer time, cards, cases, guests and check-ins, sends, outreach, listings, Builder jobs and Shield. Every number is counted in code from the database. A short "lessons" part is written by Haiku, and any sentence in it with a number that is not in the counts is dropped. The recap is a Switch library document in the crew room.
- `@ferri save the partners` saves the organizations that worked with the event (from contacts, the knowledge and the plan) to Contacts, linked to the event. Nobody is emailed. Someone marked "do not contact" stays out.
- `@ferri make a starter kit from build night` sorts the event's knowledge into "keep" (rules, venue facts) and "check" (dates, prizes, people), and adds the most asked and the unanswered questions, the plan's tasks, the spaces with their modes, the desks, the partners and the lessons. Desk downloads it as markdown.
- `@ferri start Lantern Build Night 2 on 12 December at 10 AM from the Build Night kit` makes the next event in the plan stage, with the crew, the "keep" knowledge, and each "check" entry and unanswered question as a plan question to settle. Nothing is posted outside.
- Closing is a card: "Close, spaces Off", "Close and move the spaces to <next event>" (with their modes), or "Not yet". `@ferri close build night` opens the same card; chat alone never closes an event. Closing posts a goodbye line, closes the event's open cards, cancels its scheduled sends, takes the Builder out of its help rooms, and turns the spaces Off or moves them. Reopen (Desk or `@ferri reopen build night`) puts them back with their modes.
- An hour after the event ends, Ferri does this itself, once: the recap, the close card, and a thank-you announcement card for members. Each waits for its OK.
- Desk's Wrap page shows the numbers as tiles, the recap and lessons, the partners, the kit with its download, Close and Reopen. The Events page lists closed events and starts a new one from a kit. Pocket shows the wrap card.

## Customization: skills, tone, languages, settings

Every community sounds different. The crew changes how Ferri behaves without touching code.

- Skills: Ferri's persona, its answer rules, every desk and every pack are markdown files in `skills/`. Desk's Skills page edits any of them, with versions and "Reset to default", and Ferri uses an edit on its next message. The source check, the cards and the pause are in code, so no skill edit can turn them off.
- Settings per community, per event and per space, each with a default: tone (warm, playful, professional, brief, or the crew's own words), language, how long Ferri waits before answering a question said to the room, the card ladder's timing, care on or off, when the Builder helps on its own, check-ins, guest reminder and nudge timing and the daily cap, wrap timing, and whether Ferri reads decisions and the plan from crew chat.
- By chat, in the crew room: `@ferri be more playful for Build Night`, `@ferri reply in Hindi in team-alpha`, `@ferri turn off care for Build Night`, `@ferri wait a minute before answering questions in the room`, `@ferri what are the settings?`. Ferri changes it at once, says what changed and how to undo it, and records who changed it. There is no card for this: it works only from inside the crew's rooms, and every change can be undone.
- Languages: a space with its own language gets answers in that language, with the source label translated too, while the citation check stays the same. An announcement to it is translated once, shown on the same approval card ("In Hindi for Mattermost team-alpha: ..."), and each space gets its own version, edits included.
- Desk has Settings on the Community page and on each event (each key with its default and a reset), tone and language per space on the Spaces page, and the Skills page.
- What we checked: a skill edit showing in the next answer and gone after Reset, a playful tone for an event, Hindi answers in one Mattermost team room while the main room stayed English, one approval posting English and Hindi versions of an announcement, care turned off, a shorter step-in wait and a shorter card ladder. The language tests ran on Mattermost; WhatsApp spaces use the same code path but were not tested in Hindi.

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
| `pnpm eval:answers` | Check Ferri's decisions on a fixed set against the real model: answers, triage, cards, crew intents, drafts, care, guests, social, desks |
| `pnpm dev:mattermost` | Create the local Mattermost test people and put them in the rooms |
| `pnpm desk` | Run Desk at http://localhost:3100 |
| `pnpm desk:build`, then `pnpm --filter @ferri/desk start` | Desk as a production build (for Pocket on a phone, through the tunnel) |
| `pnpm whatsapp:pair` | Add the `whatsapp_web` connection to Switch and show the QR code to link WhatsApp (`--code <number>` for a pairing code) |
| `npx wrangler deploy` (in `infra/media-worker`) | Deploy the media host for social images |
| `pnpm card:preview <room id>` | Open a sample question card in a room on any platform (`--close` to close it) |
| `pnpm crew:account <crew name> <email>` | Create a Switch login for a crew member and link it, for Pocket |
| `pnpm push:keys` | Write Web Push (VAPID) keys to `.env` once |
| `pnpm shield:connect` | Point Switch Trust at Shield (`--off`, `--status`) |
| `pnpm email:setup` | Check the Resend domain, create the webhook to Desk's `/api/email`, save its secret (safe to re-run) |
| `pnpm builder:setup` | Enroll this machine with Switch, have Ferri create the Builder, set its addressing and budget (safe to re-run) |
| `pnpm builder:controller` | Run the Switch agent controller that runs the Builder |
| `node kits/listings/scripts/browser.mjs start` (in `~/.ferri/builder`) | Open the Builder's own browser, to log in to Luma and other platforms (`status` shows where it is logged in). Ferri also reads Luma's guest list there. |
| `pnpm test`, `pnpm typecheck` | Unit tests and types |

## How we checked it

- `pnpm test`: 255 unit tests in seven packages: 209 in knowledge (policy, cards, launch, the plan, the Builder's reports and hand-offs, site events, outreach, care reading rules and routing, guest statuses and CSV parsing, social text fitting, desk skills and sheets, recap numbers and the starter kit, settings), 22 in Shield (detectors), 7 in email (webhook signatures, reply addresses), 5 in push (notices), 4 in switch (the stream parser), 4 in social (the Buffer client with a fake fetch) and 4 in the Ferri service (flow helpers).
- `pnpm typecheck`: nine packages, Desk and the Ferri service included.
- Desk's production build (`pnpm desk:build`, Next.js `next build`) passes with every page, Pocket and the public RSVP page.
- `pnpm eval:answers`: 158 of 158 fixed cases pass against the real model (Claude Haiku 5.5 at low effort): answers only with a valid source, room triage, card matching, crew intents, announcement drafts, the crew decision check, plan intents and the agenda, build requests, outreach intents and partner replies, care readings and care intents, guest intents, guest replies and a reminder draft, social intents with their times, and the desk cases (sheet readings and a custom desk skill). The clock is fixed at 10:00 AM in Bengaluru, so time cases do not depend on when it runs.
- The fork's `whatsapp_web` adapter has 26 tests of its own in `../switch` (`core/tests/switch_core/bridges/collaboration/test_whatsapp_web_adapter.py`).
- The Builder's kits check themselves: `node scripts/render.mjs --example` in `builder/kits/posters` (every format, every QR code read back) and `node scripts/check.mjs` in `builder/kits/listings` (times, listing checks, and the Luma API path against a stand-in server).
- Every feature was run end to end on the real local stack (Switch with Mattermost, Slack, Discord and Telegram connected) before the next one started: questions asked on Telegram answered once from the crew room and delivered on Slack and Discord; announcements posted to seven spaces and edited in place on four platforms; scam links blocked on Discord and Mattermost in 3 to 9 ms; announcement and answer cards approved from Pocket at phone size; the Builder making the event site, a checklist and a sponsor one-pager from crew requests and Desk, its publish and email cards refused from the room, Desk and Pocket with nothing published, and a spent budget stopping it; the Builder shipping the event site to Vercel and Supabase behind a deploy card, then registration, credit claims, a low-pool alert and a revoke on the live site; the Builder making the poster and cards with one image call and the share card posting them to seven spaces on four platforms; the Builder listing Build Night on Luma from its own browser, "Decline" leaving Luma untouched, "Allow once" publishing it with the poster as the cover, a login card on a platform the browser was not logged in to, and a stray click on Luma's submit blocked during the fill; the Builder finding four real Bengaluru prospects with their source pages; an outreach email declined, then sent from rudratechie.xyz and delivered, a reply read and answered on a card, and "no thanks" stopping all mail; a magic link from the event site's Supabase arriving through Resend and signing in.
- The newer features, the same way:
  - WhatsApp: linked to the organizer's own number by QR code. The "Message yourself" chat and a real group with two other people became rooms, Ferri answered "@ferri when does hacking start?" in both with its sources (2.7 s and 3.1 s), and no other chat on the phone made a room. An announcement posted there after one approval, and its second version was edited in place (WAHA accepted the edit).
  - Care: an upset member became a case for the venue owner in 1.7 s while ordinary chat made none; a member's SSH problem went to the Builder on a tap and was solved in her own room, and a revoked API key went to the Builder on its own during the event and came back to the owner as stuck; an unsafe report reached the person on duty with a push, and their written answer reached the member; cases were solved from chat, Desk and Pocket.
  - RSVP: the checks listed under "RSVP and the guest list" above.
  - Social: Buffer drafts only, as listed under "Social posts" above.
  - Desks: a private judging desk on Mattermost in 1 second, scores added, changed and ranked; a meetup pack declined, then made; check-in marking a guest; a custom rangoli judging desk from a skill Ferri wrote; a help desk handing a member's npm problem to the Builder.
  - Wrap: a recap whose every number matched a SQL count, partners saved with nobody emailed, a starter kit, Ferri wrapping an event on its own once, a close that turned ten spaces Off and a reopen that brought them back, and Lantern Build Night 2 started from the kit with the spaces moved over with their modes.
  - Customization: the checks listed under "Customization" above.
- Not done yet, and not claimed: Pocket was checked in a browser at phone size and through the tunnel, but not yet on a real phone (the iPhone test is still to do). Social posts were saved only as Buffer drafts on real accounts; nothing was posted live to LinkedIn, X or Instagram. Luma's API path needs Luma Plus, which we do not have, so it is checked only against a stand-in server; the real Luma listing and guest list go through the Builder's browser.

## Repository layout

```
apps/ferri/          the Ferri agent service: message flow, learning loop, the plan,
                     announcements, scheduler, reminders, team rooms, outreach, care,
                     guests, social, desks, wrap, settings, Shield's HTTP route
apps/desk/           Desk (Next.js), Ferri Pocket (the PWA at /m) and the public RSVP page (/rsvp/<code>)
packages/switch/     our client for the Switch agent protocol and Gateway
packages/knowledge/  seeding, search, prompts, triage, answers with sources, drafts, the Switch mirror,
                     care, guests, social texts, desks and sheets, recap and starter kit, skills, settings
packages/shield/     Shield's detectors (pure, no network) and its log
packages/push/       Web Push subscriptions and notices
packages/email/      Resend for sending and receiving, webhook signatures, reply addresses
packages/social/     our Buffer GraphQL client and the client for Ferri's media host
packages/db/         Drizzle schema and migrations (Ferri runs them on start)
seed/                the demo community (Lantern Labs) and event (Lantern Build Night)
skills/              Ferri's persona and answer rules, in markdown
  desks/             11 desk skills (help, judging, mentors, volunteers, checkin, speakers,
                     sponsors, food, safety, tables, lost-found)
  packs/             6 desk packs (hackathon, meetup, game-night, festival, workshop, conference)
builder/             Ferri Builder's workspace template: its CLAUDE.md and permission rules
  kits/              The Builder's kits: event-site (Next.js + Supabase), posters (Satori), listings (Playwright)
  .claude/skills/    Its skills: ship-event-site, make-posters, list-event, find-partners, help-member
scripts/             setup, knowledge CLI, evals, test people, Shield connect, Builder setup and
                     controller, email setup, WhatsApp pairing
infra/               Ferri's Postgres (pgvector) for Docker, and the Cloudflare tunnel example
  media-worker/      the media host for social images (Cloudflare Worker + Workers KV)
```

## License

MIT. Switch itself is licensed by SandboxAQ under its own terms (Apache 2.0 with the Commons Clause); Ferri talks to it over its public HTTP APIs.
