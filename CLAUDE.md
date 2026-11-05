# Ferri: build rules for coding agents

Ferri is one AI teammate for community event organizers, built on Switch (https://github.com/sandbox-quantum/switch). It answers the community on every platform, turns unknown questions into cards for the crew, and turns crew decisions into updates outside.

## Layout
- `packages/switch`: our client for the Switch agent protocol (SSE down, HTTP up). See `../switch/docs/official/internals/agent-protocol.md`.
- `apps/ferri`: the Ferri agent service.
- `packages/db`: Drizzle schema, SQL migrations (`migrations/`), `createDb`, `runMigrations`, `getState`/`setState`.
- `packages/knowledge`: seeding from markdown, loading and searching the live knowledge, prompt rendering, triage, answering with sources, the Switch library mirror. Shared with the future `apps/desk`.
- `apps/ferri/src/flow.ts`: the message flow (mention, Switch follow-up, room question).
- `skills/`: markdown skill files Ferri loads (`ferri.md` is the base persona, `librarian.md` the answer rules).
- `seed/`: demo community and event (made up: Lantern Labs, Lantern Build Night). Replace when the real community is chosen.
- `infra/docker-compose.yml`: Ferri's Postgres 16 with pgvector on port 5433 (Switch's Postgres holds 5432).
- `scripts/`: `setup-switch.ts`, `kb.ts` (`pnpm kb ...`), `eval-answers.ts`.
- Coming soon: `apps/desk` (dashboard and Pocket PWA), `builder/` (the Ferri Builder Claude Code workspace).

## Conventions
- TypeScript, Node 22, ESM, pnpm workspace. Run with `tsx`. Check with `pnpm typecheck` and `pnpm test`.
- Models: `claude-sonnet-5-5` for answers, planning and drafting in production; `claude-haiku-5-5` for per-message triage. Use the official `@anthropic-ai/sdk`.
- Testing always uses `claude-haiku-5-5` at low effort (set `FERRI_MODEL_MAIN=claude-haiku-5-5` in `.env`). Do not spend Sonnet credits on tests.
- Switch sequence numbers can exceed `Number.MAX_SAFE_INTEGER`. Keep cursors as strings.
- Facts about the Switch API come from reading `../switch` (our fork, checked out next to this repo). Do not guess endpoints.
- Every feature works end to end on the real local stack before the next one starts.
- Commits: the repo owner is the only author. No AI attribution anywhere.
- Ferri never posts notices about reading messages or storing data. This is the owner's decision.
- Schema changes: edit `packages/db/src/schema.ts`, run `pnpm db:generate`, commit the new file in `packages/db/migrations/`. Ferri runs migrations on start. `0000_extensions.sql` is hand-written (pgvector).
- Ferri answers only from the knowledge tables and must cite a real entry; an answer without a valid citation is downgraded to the holding reply in code (`finalizeAnswer`). Keep that check.
- Run `pnpm eval:answers` after any change to a prompt, a skill file or the answer flow.
- On Windows, stopping `pnpm start` from a background shell can leave the `node` child running (two Ferris on one connection). Check with `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` and stop the old one.

## Running locally
1. In `../switch`: `docker compose -f deploy/local/standalone-docker-compose.yml --profile collab --profile gateway --project-directory . up -d`
2. Here: `pnpm install`, `pnpm db:up`, `pnpm setup:switch`, `pnpm kb seed`, then put `ANTHROPIC_API_KEY` in `.env`, then `pnpm dev`.
3. Open Mattermost at http://localhost:8065 (user `user`, password `MATTERMOST_USER_PASSWORD` in `../switch/.env`), go to `ferri-lab`, and say `@ferri when does hacking start?`.

## Switch behaviour to remember
- `payload.addressed` is true for an `@ferri` mention, in a direct chat, and for a "follow-up": the sender's next top-level message within 5 minutes of Ferri answering them, or a reply in Ferri's thread (feature flag `follow_the_conversation`, `delivery/conversation.py`). Ferri checks for a real mention itself and runs triage on follow-ups.
- When Ferri is offline, Switch itself replies to a mention with "I'm currently offline". Ferri catches up from its cursor when it comes back and answers messages younger than 10 minutes.

## Status
- Spec 01, Ferri alive in Switch: done.
- Spec 02, knowledge and answers with sources: done 2026-11-05. Postgres + pgvector, knowledge tables with revisions, markdown seed, answers only from knowledge with a source line, Haiku triage for room questions, questions log, cursor in Postgres, Switch library mirror. Eval 24/24 on Haiku.
