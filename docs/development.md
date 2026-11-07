# Developing Ferri

`./ferri up` runs everything in Docker, which is all you need to try Ferri. To change Ferri's code, run Ferri and Desk on your machine and keep the rest in Docker.

## Run Ferri on the host

You need Node 22 and pnpm (and Docker for the rest of the stack).

```bash
pnpm install
./ferri up                       # Switch, Mattermost, Ferri's Postgres (or: docker compose up -d once .env exists)
docker compose stop ferri desk   # stop the containers you will run yourself
pnpm dev                         # Ferri, restarts on change
pnpm desk                        # Desk at http://localhost:3100, in another terminal
```

- `.env` holds the host's view of the stack: `SWITCH_URL=http://localhost:8800` and `DATABASE_URL=postgres://ferri:ferri@localhost:5433/ferri`. Inside the stack the compose file points them at the containers instead. If you changed a port, `./ferri up` updated these.
- Never run the `ferri` container and `pnpm dev` at the same time: two Ferris on one Switch connection answer twice.
- Shield: when Ferri runs on the host, run `pnpm shield:connect` from the host, so Switch reaches Shield at `http://host.docker.internal:3200` ([shield.md](shield.md)). Back in Docker, run `./ferri shield:connect` again.
- Ladder test timings: start Ferri with `FERRI_NUDGE_SECONDS=60 FERRI_CARD_TTL_SECONDS=300`.
- Testing always uses `claude-haiku-5-5` at low effort: set `FERRI_MODEL_MAIN=claude-haiku-5-5` in `.env`.
- Go back to the full stack with `./ferri up`.

## Commands on the host

Every `./ferri <script>` has a host form, `pnpm <script>`, which reads the same `.env`.

| Command | What it does |
|---|---|
| `pnpm kb seed` | Load `seed/` into the database and update the Switch mirror |
| `pnpm kb list` | Show the live knowledge entries |
| `pnpm kb ask "<question>"` | Run the answer pipeline without Switch (`--room` as a room question, `--search` to force full text search) |
| `pnpm eval:answers` | Check Ferri's decisions on a fixed set against the real model: answers, triage, cards, crew intents, drafts, care, guests, social, desks |
| `pnpm dev:mattermost` | Create the local Mattermost test people and put them in the rooms |
| `pnpm setup:switch` | Register Ferri in Switch (agent, addressing, rooms `ferri-lab` and `ferri-crew`) |
| `pnpm db:up` | Start only Ferri's Postgres (the `ferri-db` service) |
| `pnpm db:generate` | Generate a migration after a schema change |
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
| `pnpm doctor`, `pnpm connect ...`, `pnpm smoke` | The doctor, platform connections and the smoke test, from the host |
| `pnpm test`, `pnpm typecheck` | Unit tests and types |

## How the stack is put together

- `compose.yml` runs Switch (core, gateway, its Postgres), Mattermost, Ferri's Postgres, a one-shot setup, Ferri and Desk. See [architecture.md](architecture.md#the-docker-stack).
- `ferri` and `ferri.cmd` are the one command. They check Docker, make `.env` from `.env.example`, pull or build the image, start the stack, wait for health and print the summary (`scripts/stack.ts`).
- `Dockerfile` builds one image for Ferri, Desk and the command-line tasks. `./ferri build` builds it from your checkout.

## The older two-repo setup

Before the one-command stack, Switch ran from a checkout of our fork next to this repo. It still works, and it is the way to change Switch itself. In that setup Switch's API is on port 8000, so `SWITCH_URL=http://localhost:8000` in `.env`.

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

   Switch has no way for an agent to edit a message it posted. The fork adds `POST /agents/{agent_id}/messages/{event_id}/edit`: Switch checks the message is the agent's own, runs the new text through Switch Trust, and the room's bridge redraws the post in place (Mattermost, Slack, Discord, Telegram). Without the image, announcements still post; edits are posted again as "Update:". The same image carries the `whatsapp_web` bridge.

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

3. Put your `ANTHROPIC_API_KEY` in `.env`, then start Ferri: `pnpm dev`.

4. Desk: `pnpm desk`, signing in with the Switch admin (`admin@switch.local`, `GATEWAY_ADMIN_PASSWORD` in `../switch/.env`). Mattermost is at http://localhost:8065 (user `user`, password `MATTERMOST_USER_PASSWORD` in `../switch/.env`).

5. WhatsApp in this setup: in `../switch/.env`, set `WAHA_API_KEY` and add `waha` to `OUTBOUND_ALLOWED_PRIVATE_HOSTS`. Then start the sidecar and pair it from here:

   ```bash
   cd ../switch
   docker compose -f deploy/local/standalone-docker-compose.yml -f deploy/local/ferri/compose.override.yml --profile whatsapp --project-directory . up -d waha
   cd ../ferri
   pnpm whatsapp:pair              # or: pnpm whatsapp:pair --code <phone number> for a pairing code
   ```

6. The Builder's controller: `pnpm builder:setup` downloads the released controller ([builder.md](builder.md)). If you would rather build it from the Switch checkout, do this once; Ferri finds the build next to this repo:

   ```bash
   cd ../switch/console
   npx pnpm@10.28.2 install --filter "@switch-console/agent-controller..."
   npx pnpm@10.28.2 -r --filter "@switch-console/agent-controller..." run build
   ```

## Checks before a commit

`pnpm typecheck` and `pnpm test`. Run `pnpm eval:answers` after any change to a prompt, a skill file or the answer flow. CI runs typecheck, tests, Desk's build and the stack smoke test on every push ([testing.md](testing.md)).
