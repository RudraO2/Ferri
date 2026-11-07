# Hosting Ferri on a server

Our live demo runs exactly this way: the same `./ferri up`, on a small always-on server, reached through a Cloudflare named tunnel. No ports are opened on the server, so it can run next to other services.

## What you need

- A Linux server with Docker and about 3 GB of free RAM (amd64 or arm64; without Mattermost every image is native on both).
- A Cloudflare account with a domain, and `cloudflared` on any machine to create the tunnel.
- A chat platform for your community: Telegram, Discord or Slack (Mattermost is the local playground and is off here).

## Steps

1. On any machine signed in to Cloudflare (`cloudflared tunnel login`):

   ```bash
   cloudflared tunnel create ferri
   cloudflared tunnel route dns ferri ferri.example.com
   ```

   This writes the tunnel's credentials file (`~/.cloudflared/<tunnel id>.json`).

2. On the server, clone the repo and copy the credentials file to `.ferri-state/tunnel.json`. Then put this in `.env`:

   ```
   ANTHROPIC_API_KEY=sk-ant-...
   COMPOSE_FILE=compose.yml:infra/demo/compose.demo.yml
   COMPOSE_PROFILES=
   CLOUDFLARE_TUNNEL_ID=<tunnel id>
   CLOUDFLARE_TUNNEL_CREDENTIALS=./.ferri-state/tunnel.json
   FERRI_PUBLIC_URL=https://ferri.example.com
   GATEWAY_COOKIE_SECURE=true
   POCKET_ALLOWED_ORIGINS=ferri.example.com
   ```

3. Start it: `./ferri up`. Desk and Pocket are at `FERRI_PUBLIC_URL`. `infra/demo/compose.demo.yml` adds the tunnel and memory limits (about 3 GB in all).

4. Connect your community's platform and attach its chats (see [platforms.md](platforms.md)):

   ```bash
   ./ferri connect discord --token <bot token> --guild <server id> --name "My Discord"
   ./ferri space list
   ./ferri space attach build-night --mode auto
   ./ferri space attach crew --crew
   ```

   A Discord channel becomes a room on its first message. Switch can also create the channels for you with Ferri in them: `POST /gateway/rooms` with `bridge_id` (the connection) and `channel_type` `channel_public` or `channel_private` (we made the demo's `#build-night` and private `#crew` this way).

5. Turn on Shield: `./ferri shield:connect`, then `docker compose restart ferri`.

6. Cap what strangers can spend. A Switch budget stops Ferri for the rest of the day once it has posted that many messages; Switch then answers with a notice:

   ```
   POST /gateway/tenants/{tenant id}/budgets
   {"agent_id": "<FERRI_AGENT_ID>", "metric": "messages", "model": "", "amount_limit": 300, "period_hours": 24}
   ```

   (`GET /gateway/tenants/current` gives the tenant id; sign in to the Gateway as the admin first.) Also set a monthly spend limit on the Anthropic key.

7. Check it: `./ferri doctor`.
