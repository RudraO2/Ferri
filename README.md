# Ferri

Ferri is an AI teammate for people who run community events. It answers the community on every platform and asks the organizing team only when it does not know. When the team decides something, Ferri tells everyone.

Built on [Switch](https://github.com/sandbox-quantum/switch), which puts agents and people in the same rooms across Slack, Discord, Telegram, Mattermost and Microsoft Teams.

> Work in progress. This README grows with each piece we ship.

## Run it locally

You need Docker Desktop, Node 22 and pnpm.

1. Start Switch (our fork, checked out next to this repo as `switch/`):

   ```bash
   cd ../switch
   cp .env.example .env
   bash deploy/local/generate-env-secrets.sh .env local
   # In .env set:
   #   SWITCH_IMAGE_NAMESPACE=sandbox-quantum/dev
   #   SWITCH_VERSION=0.31.1-dev.339.g86d5928
   #   FEATURE_FLAGS_ENABLED=agent_management,service_connections,follow_the_conversation
   #   CONTROLLER_TOKEN_SECRET=<32+ random characters>
   docker compose -f deploy/local/standalone-docker-compose.yml --profile collab --profile gateway --project-directory . up -d
   ```

2. Start Ferri's own Postgres (pgvector, port 5433) and load the demo knowledge:

   ```bash
   pnpm install
   pnpm db:up
   pnpm setup:switch
   pnpm kb seed
   ```

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

## Useful commands

| Command | What it does |
|---|---|
| `pnpm kb seed` | Load `seed/` into the database and update the Switch mirror |
| `pnpm kb list` | Show the live knowledge entries |
| `pnpm kb ask "<question>"` | Run the answer pipeline without Switch (`--room` as a room question, `--search` to force full text search) |
| `pnpm eval:answers` | Check Ferri's decisions on a fixed question set |
| `pnpm test`, `pnpm typecheck` | Unit tests and types |
