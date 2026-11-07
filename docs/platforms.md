# Telegram, Slack and Discord

Every group on every platform is a Switch room, so one event can have spaces on Telegram, Slack, Discord and WhatsApp next to Mattermost. A question asked on Telegram becomes a card in the crew room; the crew answers once; everyone who asked the same thing on Slack or Discord gets the answer in their own app, with a real mention.

WhatsApp has its own page: [whatsapp.md](whatsapp.md).

## Connect a platform

One command adds the platform's connection to Switch. On Windows, use `.\ferri` (PowerShell) or `ferri` (cmd) instead of `./ferri`.

```bash
./ferri connect telegram --token <bot token> [--username <bot username>] [--name <display name>]
./ferri connect discord --token <bot token> --guild <server id> [--name <display name>]
./ferri connect slack --bot-token xoxb-... --app-token xapp-... [--workspace T...] [--name <display name>]
./ferri connect list                       # the connections Switch has
./ferri connect remove <connection id> --yes
```

- A value you leave out is read from `.env`: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `SLACK_WORKSPACE_ID`.
- It is safe to run again: a connection of that platform with the same name is reported, not duplicated.
- `./ferri doctor` shows each platform as on, off or broken.

Under the hood this is Switch's Gateway call (admin only; the Switch dashboard at http://localhost:3300 also does it from its Messaging apps page):

```
POST /gateway/collaborations
{ "bridge_type": "telegram", "display_name": "Telegram", "connection_config": { "bot_token": "...", "bot_username": "..." } }
{ "bridge_type": "slack",    "display_name": "Acme Slack", "connection_config": { "bot_token": "xoxb-...", "app_token": "xapp-...", "workspace_id": "T...", "agent_usergroups": false } }
{ "bridge_type": "discord",  "display_name": "Acme Discord", "connection_config": { "bot_token": "...", "guild_id": "..." } }
```

## Make the bot on each platform

- **Telegram**: make a bot with BotFather, turn Group Privacy off before adding it anywhere, add it to the group.
- **Slack**: create the app from Switch's manifest (Socket Mode, no public URL), generate an `xapp-` token with `connections:write`, install it, `/invite` it to a channel.
- **Discord**: create an application, turn on the Server Members and Message Content intents, invite the bot with `bot` and `applications.commands`, then post once in the channel (that creates the room).

## Then

- Type `!invite-agent @ferri` in the chat. The space shows up in Desk under Discovered, switched off, until you attach it to an event.
- Name the platform bot or app after Switch, not after Ferri. Slack and Discord turn a typed `@ferri` into a mention of a bot user whose name starts with "ferri", and then the message never reaches Ferri.
- Set `agent_greetings_enabled: false` on a connection (`PATCH /gateway/collaborations/{id}`) if Ferri should stay silent when it joins a space that is still off.
- `./ferri card:preview <room id>` opens a sample question card in any room, to see how that platform draws it (`--close` closes it).

Question cards draw buttons on Telegram, Slack and Discord. A typed answer (`A1 "text"`) works everywhere.

## Without Mattermost

Mattermost is the local chat for trying Ferri. On a small server that uses only Telegram or Discord, remove `mattermost` from `COMPOSE_PROFILES` in `.env` and run `./ferri up`. Then connect a platform as above, add Ferri to its groups, and attach the spaces to an event in Desk (one of them as the event's crew room, where cards land).
