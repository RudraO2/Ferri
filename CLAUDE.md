# Ferri: build rules for coding agents

Ferri is one AI teammate for community event organizers, built on Switch (https://github.com/sandbox-quantum/switch). It answers the community on every platform, turns unknown questions into cards for the crew, and turns crew decisions into updates outside.

## Layout
- `packages/switch`: our client for the Switch agent protocol (SSE down, HTTP up). See `../switch/docs/official/internals/agent-protocol.md`.
- `apps/ferri`: the Ferri agent service.
- `skills/`: markdown skill files Ferri loads (`ferri.md` is the base persona).
- `scripts/`: setup scripts (`pnpm setup:switch`).
- Coming soon: `packages/db` (Drizzle and Postgres), `apps/desk` (dashboard and Pocket PWA), `builder/` (the Ferri Builder Claude Code workspace), `infra/`.

## Conventions
- TypeScript, Node 22, ESM, pnpm workspace. Run with `tsx`. Check with `pnpm typecheck` and `pnpm test`.
- Models: `claude-sonnet-5-5` for answers, planning and drafting in production; `claude-haiku-5-5` for per-message triage. Use the official `@anthropic-ai/sdk`.
- Testing always uses `claude-haiku-5-5` at low effort (set `FERRI_MODEL_MAIN=claude-haiku-5-5` in `.env`). Do not spend Sonnet credits on tests.
- Switch sequence numbers can exceed `Number.MAX_SAFE_INTEGER`. Keep cursors as strings.
- Facts about the Switch API come from reading `../switch` (our fork, checked out next to this repo). Do not guess endpoints.
- Every feature works end to end on the real local stack before the next one starts.
- Commits: the repo owner is the only author. No AI attribution anywhere.
- Ferri never posts notices about reading messages or storing data. This is the owner's decision.

## Running locally
1. In `../switch`: `docker compose -f deploy/local/standalone-docker-compose.yml --profile collab --profile gateway --project-directory . up -d`
2. Here: `pnpm install`, then `pnpm setup:switch`, then put `ANTHROPIC_API_KEY` in `.env`, then `pnpm dev`.
3. Open Mattermost at http://localhost:8065 (user `user`, password `MATTERMOST_USER_PASSWORD` in `../switch/.env`), go to `ferri-lab`, and say `@ferri hello`.

## Status
- Spec 01, Ferri alive in Switch: done.
