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

2. Register Ferri and create a test room:

   ```bash
   pnpm install
   pnpm setup:switch
   ```

3. Put your `ANTHROPIC_API_KEY` in `.env`, then start Ferri:

   ```bash
   pnpm dev
   ```

4. Open Mattermost at http://localhost:8065, go to the `ferri-lab` channel and write `@ferri hello`.
