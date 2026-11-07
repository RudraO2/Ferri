# Telegram, Discord and Slack

Connecting a platform gives Switch a bot there. Switch bridges every chat the bot is in into a room, and Ferri is one agent in all of those rooms, so one event can have spaces on Telegram, Discord, Slack, WhatsApp and Mattermost at once. `./ferri doctor` (and Desk's Setup page) shows each platform as on, off or broken, and `./ferri connect list` lists the connections Switch has.

On Windows, type `.\ferri` in PowerShell or `ferri` in cmd wherever this page says `./ferri`. WhatsApp has its own page: [whatsapp.md](whatsapp.md).

Every platform takes the same four steps:

1. Make a bot on the platform and name it Switch.
2. Give its token to Switch with `./ferri connect`.
3. Put the bot in a chat and post once there. The chat becomes a Switch room.
4. Add Ferri to the room, then attach the space to your event.

Name the bot Switch, not Ferri. A bot whose name starts with "ferri" gets in the way of a typed `@ferri`: the platform turns it into a mention of the bot, or offers the bot first, and the message misses Ferri. Each section below says how.

## Telegram

You need a Telegram account and a group you can add members to.

1. In Telegram, open [@BotFather](https://t.me/BotFather) and tap **Start**.
2. Send `/newbot`.
3. BotFather asks for a name. Send `Switch`.
4. BotFather asks for a username. It must end in `bot` and be free on Telegram, for example `lantern_switch_bot`. Do not start it with `ferri`: Telegram suggests matching usernames while people type `@ferri`, and picking the bot tags the bot, not Ferri.
5. BotFather replies with the token, a long string like `123456789:AA...`. Copy it and keep it secret. If it leaks, send `/revoke` to BotFather for a new one.
6. Send `/setprivacy`, pick your bot, then tap **Disable**. BotFather answers that the new status is DISABLED. With privacy on, the bot sees only messages aimed at it, and Ferri cannot follow the group. (The same switch: `/mybots`, your bot, **Bot Settings**, **Group Privacy**, **Turn off**.)
7. Connect it:

   ```bash
   ./ferri connect telegram --token <bot token>
   ```

   It checks the token with Telegram, reads the bot's username, warns you if privacy is still on, and adds the connection to Switch.

8. Add the bot to your group: open the group, tap its name at the top, tap **Add Members**, search for the bot's username, and add it. It needs no admin rights.
9. Post any message in the group.
10. In the group, type `!invite-agent @ferri`. (`/invite_agent @ferri` works too: Telegram's command menu uses underscores.)

Turn privacy off before the bot joins any group, because Telegram reads the setting when the bot joins. For a group the bot is already in, remove it and add it back. A bot that posts a notice saying it can only see messages that tag it is in this state.

A private chat with the bot never becomes a room. For a private test room, make a group with only you and the bot.

On Telegram, type `@ferri` in full. Telegram does not suggest it, because Ferri is not a Telegram member.

## Discord

You need a Discord server where you have the Manage Server permission.

Make the bot:

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and sign in.
2. Click **New Application**, name it `Switch`, accept the terms, and click **Create**. Not Ferri: Discord turns a typed `@ferri` into a mention of a bot whose name starts with "ferri", and the message misses Ferri.
3. In the left menu, open **Bot**. Under **Token**, click **Reset Token**, confirm with **Yes, do it!** (Discord may ask for your two-factor code), and copy the token. Discord shows it only once.
4. On the same page, under **Privileged Gateway Intents**, turn on **Server Members Intent** and **Message Content Intent**, then click **Save Changes**. Without Message Content, the bot gets messages with no text in them.

Invite it to your server:

5. In the left menu, open **OAuth2**. Under **OAuth2 URL Generator**, tick the scopes `bot` and `applications.commands`.
6. Under **Bot Permissions**, tick these ten: **View Channels**, **Send Messages**, **Send Messages in Threads**, **Create Public Threads**, **Read Message History**, **Attach Files**, **Add Reactions**, **Manage Webhooks**, **Manage Channels** and **Manage Roles**. If the page asks for an **Integration Type**, pick **Guild Install**.
7. Copy the **Generated URL** at the bottom and open it in your browser. Pick your server under **Add to Server**, click **Continue**, then **Authorize**.

   Shortcut for steps 5 to 7: copy the **Application ID** from **General Information** and open `https://discord.com/oauth2/authorize?client_id=<application id>&scope=bot+applications.commands&permissions=310043053136`. It asks for the same scopes and permissions. `./ferri connect discord` also prints this link when the bot is not in the server yet.

Get the server id:

8. In the Discord app, open **User Settings** (the gear next to your name), then **Advanced**, and turn on **Developer Mode**.
9. Right-click your server's icon in the server list and click **Copy Server ID**.

Connect it:

10. Run:

    ```bash
    ./ferri connect discord --token <bot token> --guild <server id>
    ```

    It checks the token, says whether the bot is in the server, and adds the connection.

11. Post any message in the channel where Ferri should work. On Discord a channel becomes a room on its first message, so a command as the very first message does nothing.
12. In that channel, type `!invite-agent @ferri`, picking `@ferri` from the list as below.

The bot sees every channel its permissions allow. For a private channel (often the crew's), add the bot first: open the channel's settings, **Permissions**, and add **Switch**.

To talk to Ferri on Discord, type `@ferri` and pick **@ferri** from the list Discord shows. Switch makes a Discord role named after Ferri for this, so the mention arrives as a role mention. A plain typed `@ferri`, sent without picking it from the list, does not reach Ferri. Tell your crew and your members. No **@ferri** in the list? The bot is missing **Manage Roles**: invite it again with the link above, then restart Switch (`docker compose restart switch`).

## Slack

You need a Slack workspace where you may install apps. Some workspaces need an admin to approve a new app first.

1. Copy Switch's app manifest: the **Agent Switch app manifest** block on Switch's [Slack page](https://docs.switchagents.ai/flintai/switch/deploy/messaging-apps/slack) (the same file in Switch's repo: [slack.md](https://github.com/sandbox-quantum/switch/blob/main/docs/official/deploy/messaging-apps/slack.md)). It sets the scopes, the events, Switch's slash commands and Socket Mode in one go, so Slack needs no public address to reach Switch.
2. Optional: in the manifest, change both `"Agent Switch"` values to `"Switch"`. Any name works except one that starts with "ferri": Slack would turn a typed `@ferri` into a mention of the app, and the message would miss Ferri.
3. Does your workspace have guests? Then delete the `agent_view` block from the manifest. It declares the app an Agent, which cuts guests off from the app and cannot be undone.
4. Open [api.slack.com/apps](https://api.slack.com/apps), click **Create New App**, then **From a manifest**.
5. Pick your workspace and click **Next**. Paste the manifest into the **JSON** tab, click **Next**, check the summary, and click **Create**.
6. In the left menu, open **Socket Mode** and check that **Enable Socket Mode** is on. The manifest turns it on.
7. Open **Basic Information**. Under **App-Level Tokens**, click **Generate Token and Scopes**, give the token a name (for example `switch`), click **Add Scope**, pick `connections:write`, and click **Generate**. Copy the token: it starts with `xapp-`.
8. Open **Install App**, click **Install to** your workspace, then **Allow**. Copy the **Bot User OAuth Token**: it starts with `xoxb-`.
9. Connect it:

   ```bash
   ./ferri connect slack --bot-token xoxb-... --app-token xapp-...
   ```

   Switch checks both tokens and reads the workspace id from them, so you do not need `--workspace`.

10. In each channel for Ferri, type `/invite @Switch` (or the name you gave the app). A channel becomes a room when the app joins it.
11. In that channel, type `!invite-agent @ferri`.

On Slack, type `@ferri` in full. Slack shows it as plain text, and it still reaches Ferri. On a paid plan that lets apps manage user groups, Slack also suggests it as you type.

## Attach your groups and choose the crew room

A chat Ferri joins arrives in Desk as a space, switched off. Ferri is in it but ignores it until you attach it to an event. A space has one of four modes:

- **Off**: Ferri ignores the space. Every new space starts here.
- **Listen**: Ferri reads and logs the questions it hears, and never posts.
- **Approve**: Ferri drafts each reply on a card in the crew room, and posts it only after a crew member's OK.
- **Auto**: Ferri answers with its sources. A question it cannot answer gets a holding reply and becomes a card for the crew.

Approved announcements go to every Auto and Approve space, not to the crew room.

The crew room is not a mode. It is the one space per event where question cards land and where the crew works with Ferri: answering cards, teaching facts, asking for announcements. Make your organizers' own chat the crew room.

In Desk:

1. Open Desk (http://localhost:3100) and go to **Spaces**.
2. Under **New spaces**, each chat has an event, a mode and a **crew room** box. Pick the event and the mode, then click **Attach**. **Keep off** moves it to the Off list without attaching it.
3. For the crew room, pick the event, pick **Auto**, tick **crew room**, and click **Attach** (or **Save** for a space that is already attached). An event has one crew room: ticking another space moves the role there.
4. A chat Ferri is not in yet is listed under **Rooms Ferri is not in**. Click **Add Ferri** there instead of typing `!invite-agent @ferri`. The chat then shows under **New spaces**.
5. To change a space later, change its mode under **Attached** and click **Save**. **Off** detaches it.

A space belongs to one live event at a time. Attaching it to another event moves it there.

On the command line:

```bash
./ferri space list
./ferri space attach "Ferri Telegram: Lantern Build Night" --mode auto
./ferri space attach "Ferri Slack: crew" --crew
./ferri space detach "Ferri Discord: off-topic"
```

- `space list` first picks up chats Ferri joined since it last looked, then shows each space with its platform and what it is attached to: the event and mode, crew room, or Off.
- Give the name as `space list` shows it, in quotes: the connection's name, a colon, then the chat's name. Capitals do not matter.
- `--mode` is `listen`, `approve` or `auto`, and `auto` is the default. `--crew` makes the space the event's crew room. With more than one live event, add `--event <slug>`.
- `space detach` turns a space Off.

## Good to know

- `./ferri connect list` shows each connection's id, platform, name, room count and status. `./ferri connect remove <connection id> --yes` removes a connection and every Switch room on it; the chats on the platform stay.
- A value you leave out of `connect` is read from `.env`: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `SLACK_WORKSPACE_ID`.
- `--name <display name>` names the connection in Switch. The defaults are `Ferri Telegram`, `Ferri Discord` and `Ferri Slack`, and space names start with it. Running `connect` again with the same platform and name changes nothing. Two connections must not share one bot.
- Set `agent_greetings_enabled: false` on a connection (`PATCH /gateway/collaborations/{id}`) if Ferri should stay silent when it joins a space that is still off.
- Question cards draw buttons on Telegram, Discord and Slack. A typed answer (`A1 "text"`) works everywhere. `./ferri card:preview <room id>` opens a sample question card in any room, to see how that platform draws it (`--close` closes it).

Under the hood, `connect` is Switch's Gateway call (admin only; the Switch dashboard at http://localhost:3300 also does it from its Messaging apps page):

```
POST /gateway/collaborations
{ "bridge_type": "telegram", "display_name": "Ferri Telegram", "connection_config": { "bot_token": "...", "bot_username": "..." }, "channel_creation_enabled": false }
{ "bridge_type": "discord", "display_name": "Ferri Discord", "connection_config": { "bot_token": "...", "guild_id": "..." } }
{ "bridge_type": "slack", "display_name": "Ferri Slack", "connection_config": { "bot_token": "xoxb-...", "app_token": "xapp-...", "workspace_id": "T..." } }
```

## Without Mattermost

Mattermost is the local chat for trying Ferri. On a small server that uses only Telegram or Discord, remove `mattermost` from `COMPOSE_PROFILES` in `.env` and run `./ferri up`. Then connect a platform as above, add Ferri to its groups, and attach the spaces to an event in Desk (one of them as the event's crew room, where cards land).
