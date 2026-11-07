# Troubleshooting

These are the failures we hit while setting Ferri up from a clean folder. Each one has the symptom, the cause and the fix.

Start with `./ferri doctor` (Windows: `.\ferri doctor` in PowerShell, `ferri doctor` in cmd). It checks the core of the stack and every optional part, and prints the next step for anything that is off or broken.

## Setup and the stack

### "Docker is installed but not running"
- **Cause**: Docker Desktop (or the Docker service on Linux) is not started.
- **Fix**: start Docker Desktop, wait until it says it is running, then run `./ferri up` again.

### "Docker is not installed" or "Docker Compose v2 is missing"
- **Cause**: there is no `docker` command, or it has no `docker compose` subcommand.
- **Fix**: install Docker Desktop (Windows, macOS) or Docker Engine with the compose plugin v2.22 or newer (Linux): https://docs.docker.com/get-docker/

### A port is already in use
- **Symptom**: `./ferri up` stops with "port is already allocated" or "address already in use".
- **Cause**: another program on your machine uses one of the ports the stack publishes.
- **Fix**: change the port in `.env`, then run `./ferri up` again.

  | Port | Setting in `.env` | What it is |
  |---|---|---|
  | 3100 | `DESK_HOST_PORT` | Desk and Pocket |
  | 8065 | `MATTERMOST_HOST_PORT` | Mattermost |
  | 8800 | `API_HOST_PORT` | Switch API |
  | 3300 | `GATEWAY_HOST_PORT` | Switch dashboard |
  | 5433 | `FERRI_DB_HOST_PORT` | Ferri's Postgres |

  `./ferri up` updates `SWITCH_URL`, `DATABASE_URL` and `MATTERMOST_SITE_URL` in `.env` to follow a changed port.

### ".env is a folder"
- **Cause**: a container started while `.env` did not exist, and Docker created a folder with that name for the bind mount.
- **Fix**: remove the folder with `rmdir .env`, then run `./ferri up`. It creates the file and fills it.

### The first `./ferri up` takes several minutes
- **Cause**: the first start downloads about 1.2 GB (Switch, Mattermost, Postgres, Ferri): about 5 minutes on a 50 Mbit/s line. If it cannot pull one of Ferri's two images, it also builds that image: Ferri's from the checkout ("building it from this checkout (a few minutes, once)"), Switch's core from our Switch fork ("building it from the Switch fork on GitHub (a few minutes, once)").
- **Fix**: nothing to fix. Later starts take seconds.

### "pull access denied", "denied" or "unauthorized" for a ghcr.io image
- **Cause**: Docker could not pull one of Ferri's two images: `ghcr.io/rudrao2/ferri` (Ferri, Desk and the commands) or `ghcr.io/rudrao2/ferri-switch-core` (Switch's core with our fork's changes). The image is not published for your version, the package is private, or Docker holds an old sign-in for ghcr.io.
- **Fix**: run `./ferri up`. It builds what it cannot pull: Ferri's image from your checkout, and Switch's core image from our fork ([github.com/RudraO2/switch](https://github.com/RudraO2/switch)) at the commit in `SWITCH_FORK_REF` in `.env`, on top of Switch's published core. Each build takes a few minutes, once. Plain `docker compose up -d` does not build Switch's core image, so use `./ferri up` the first time. If the build fails too:
  - An old sign-in makes even public pulls fail: run `docker logout ghcr.io`, then `./ferri up` again.
  - The machine must reach github.com and ghcr.io. Behind a proxy or firewall, allow both.
  - Docker fetches the fork with git. On Linux, install git where Docker runs (`sudo apt install git`).

### "the stack did not come up"
- **Cause**: one of the services failed to start or did not get healthy within 15 minutes.
- **Fix**: `./ferri ps` shows which service stopped. `./ferri logs ferri-setup` shows the setup steps (Ferri in Switch, test people, demo knowledge). `./ferri logs switch` and `./ferri logs mattermost` show the other common ones. Run `./ferri up` again after fixing the cause; it is safe to repeat.

### Mattermost is slow on Apple Silicon
- **Cause**: Mattermost publishes its image for amd64 only, so Docker runs it emulated on an M-series Mac.
- **Fix**: give it a minute on the first start. Everything else in the stack runs natively on arm64.

### Start over
- **Fix**: `./ferri reset` stops the stack and deletes all its data (Switch, Mattermost, Ferri). It asks you to type `yes` first. Your `.env` is kept. Then `./ferri up` starts fresh.

## Ferri in chat

### Switch answers "I'm currently offline"
- **Cause**: Ferri is not connected to Switch, so Switch answers the mention for it.
- **Fix**: `./ferri logs ferri` shows why. `./ferri doctor` checks the agent key and the connection. When Ferri comes back it catches up and answers messages younger than 10 minutes.

### Ferri does not answer at all
- **Cause**: most often `ANTHROPIC_API_KEY` is wrong, or the account is out of credit.
- **Fix**: `./ferri doctor` checks the key. Fix it in `.env`, then restart Ferri: `docker compose restart ferri desk`.

### Every message gets "Switch Trust could not check this message"
- **Cause**: Shield is connected (Switch sends every message to it), but Ferri, which serves Shield, is down.
- **Fix**: start Ferri again (`./ferri up`), or turn Shield off: `./ferri shield:connect --off`.

### Ferri does not answer a question nobody addressed to it
- **Cause**: Ferri waits a moment so a person can answer first (`FERRI_ROOM_GRACE_SECONDS`, 20 by default), and steps in only when it has a sourced answer.
- **Fix**: wait, or address it: `@ferri ...`.

### `@ferri` on Slack or Discord never reaches Ferri
- **Cause**: Slack and Discord turn a typed `@ferri` into a mention of a bot user whose name starts with "ferri". The message then never reaches Ferri.
- **Fix**: name the platform bot or app after Switch, not after Ferri. See [platforms.md](platforms.md).

### Two Ferris answer, or answers come twice
- **Cause**: Ferri runs twice on one Switch connection, for example the `ferri` container and `pnpm dev` on the host.
- **Fix**: stop one. When you develop on the host, run `docker compose stop ferri desk` first ([development.md](development.md)). On Windows, a `node` child can survive a stopped `pnpm start`: check with `Get-CimInstance Win32_Process -Filter "Name='node.exe'"`.

## Optional parts

### Pocket on a phone does not load, or notifications never come
- **Cause**: phones need HTTPS for a PWA and Web Push. `http://localhost` works only on the same computer.
- **Fix**: put Desk behind a tunnel and set `FERRI_PUBLIC_URL`. See [pocket.md](pocket.md). On an iPhone, add Pocket to the Home Screen first, then allow notifications from it.

### Pocket's forms are refused on your own host name
- **Cause**: the origins allowed to post Pocket's forms are baked into Ferri's image at build time from `POCKET_ALLOWED_ORIGINS` (default `*.trycloudflare.com`).
- **Fix**: add your host to `POCKET_ALLOWED_ORIGINS` in `.env`, set `FERRI_VERSION=local` there too, then run `./ferri up`. With that tag `./ferri up` builds Ferri's image from your checkout (no image is published under it) instead of pulling the published one, which has only the default hosts.

### The Builder: "Waiting for the controller"
- **Cause**: `pnpm builder:setup` waits until the Switch agent controller on your machine is online.
- **Fix**: start `pnpm builder:controller` in another terminal and leave it running. See [builder.md](builder.md).

### The Builder: "The controller reports no Claude Code"
- **Cause**: Claude Code is not installed on the machine that runs the controller.
- **Fix**: `npm i -g @anthropic-ai/claude-code`, then restart `pnpm builder:controller`.

### The Builder answers "Agent X has reached its budget"
- **Cause**: the Builder spent its Switch budget for the last 24 hours (`FERRI_BUILDER_BUDGET_OUTPUT`, `FERRI_BUILDER_BUDGET_TURNS`).
- **Fix**: wait for the reset (00:00 UTC), or raise the budget in `.env` and run `pnpm builder:setup` again.
