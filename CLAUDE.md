# Ferri: build rules for coding agents

Ferri is one AI teammate for community event organizers, built on Switch (https://github.com/sandbox-quantum/switch). It answers the community on every platform, turns unknown questions into cards for the crew, and turns crew decisions into updates outside.

## Layout
- `packages/switch`: our client for the Switch agent protocol (SSE down, HTTP up). See `../switch/docs/official/internals/agent-protocol.md`.
- `apps/ferri`: the Ferri agent service.
- `packages/db`: Drizzle schema, SQL migrations (`migrations/`), `createDb`, `runMigrations`, `getState`/`setState`.
- `packages/knowledge`: seeding from markdown, loading and searching the live knowledge, prompt rendering, triage, answering with sources, the Switch library mirror. Shared with the future `apps/desk`.
- `apps/ferri/src/flow.ts`: the message flow. `decideAction` (packages/knowledge/src/policy.ts) decides per message from the space's mode, the pause, the mute list and the sender; the flow then answers, logs, opens cards or stays quiet.
- `apps/ferri/src/loop.ts`: the learning loop: open or join question cards, poll card outcomes, resolve and fan out answers, the nudge/escalate/expire ladder.
- `skills/`: markdown skill files Ferri loads (`ferri.md` is the base persona, `librarian.md` the answer rules).
- `seed/`: demo community and event (made up: Lantern Labs, Lantern Build Night). Replace when the real community is chosen.
- `infra/docker-compose.yml`: Ferri's Postgres 16 with pgvector on port 5433 (Switch's Postgres holds 5432).
- `scripts/`: `setup-switch.ts`, `kb.ts` (`pnpm kb ...`), `eval-answers.ts`, `dev-mattermost.ts` (test people meera, arjun, priya; shared password `MM_TEST_PASSWORD` in `.env`).
- `apps/desk`: Desk, the organizers' dashboard (Next.js 16, App Router, Tailwind 4) on port 3100. Sign-in with a Switch account through the Gateway; server components and server actions read and write Postgres through `@ferri/db`; cards are answered through the Gateway as the signed-in person.
- `apps/desk/app/m`: Ferri Pocket, the crew's PWA (Needs you, a card, Who is stuck, Me). `public/m/sw.js` is its service worker (scope `/m`). `lib/pocket.ts` reads its data; `lib/cards.ts` answers cards through the Gateway for Desk and Pocket.
- `packages/push`: Web Push (VAPID): subscriptions per Switch user, `pushToUsers`, the notice texts. Ferri's loop pushes on card open, nudge, escalate, expire and when a card is settled (same tag, so the notice is replaced).
- Coming soon: `builder/` (the Ferri Builder Claude Code workspace).

## Conventions
- TypeScript, Node 22, ESM, pnpm workspace. Run with `tsx`. Check with `pnpm typecheck` and `pnpm test`.
- Relative imports name the `.ts` file (`import { x } from "./store.ts"`; `allowImportingTsExtensions`). tsx, Node and Next/Turbopack all resolve that; Turbopack does not map `./x.js` to `x.ts`.
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
2. Here: `pnpm install`, `pnpm db:up`, `pnpm setup:switch`, `pnpm dev:mattermost`, `pnpm kb seed`, then put `ANTHROPIC_API_KEY` in `.env`, then `pnpm dev`. `pnpm kb seed` also discovers Ferri's rooms and attaches the spaces `event.yaml` names.
4. Desk: `pnpm desk` (dev) or `pnpm desk:build` then `pnpm --filter @ferri/desk start`, at http://localhost:3100. Sign in with the Switch admin (`admin@switch.local`, `GATEWAY_ADMIN_PASSWORD` in `../switch/.env`).
5. Pocket: http://localhost:3100/m on the laptop, or through `cloudflared tunnel --url http://localhost:3100` on a phone. Ladder test timings: start Ferri with `FERRI_NUDGE_SECONDS=60 FERRI_CARD_TTL_SECONDS=300`.
3. Open Mattermost at http://localhost:8065 (user `user`, password `MATTERMOST_USER_PASSWORD` in `../switch/.env`), go to `ferri-lab`, and say `@ferri when does hacking start?`.

## Switch behaviour to remember
- `payload.addressed` is true for an `@ferri` mention, in a direct chat, and for a "follow-up": the sender's next top-level message within 5 minutes of Ferri answering them, or a reply in Ferri's thread (feature flag `follow_the_conversation`, `delivery/conversation.py`). Ferri checks for a real mention itself and runs triage on follow-ups.
- When Ferri is offline, Switch itself replies to a mention with "I'm currently offline". Ferri catches up from its cursor when it comes back and answers messages younger than 10 minutes.
- Ferri's rooms: the `list_rooms` op lists every room Ferri is a member of. Mattermost channels are bridged automatically and Ferri sits in Town Square and Off-Topic; they are spaces that stay Off until attached.
- Question cards: `POST /agent-sessions/{session}/approvals` (any session id; Ferri uses `ferri-cards`). Switch escapes @mentions inside a card (zero-width space), so Ferri pings owners in a message of its own. A typed written answer needs quotes: `A1 "text"`. Ferri polls `GET /agent-sessions/approvals/outcomes` (the `approval_outcome` stream frame needs protocol revision 4+) and acknowledges with `.../delivered`. Switch renders a card it expired as "answered", so Ferri closes its cards itself before Switch's expiry. The card post is not in `read_context`.

- Outside platforms: a bridge is added with `POST /gateway/collaborations` (`bridge_type` telegram, slack, discord). A chat becomes a room when the bot lands in it (Discord: on its first message); Ferri joins with `!invite-agent @ferri` or `POST /gateway/rooms/{id}/agents`. `get_room_detail` gives `bridge_id` and the connection's display name, not the platform: `roomPlatform` asks the Gateway for the bridge type, then falls back to a platform named in the display name.
- Mentions: each bridge rewrites `@<platform username>` into a native mention (Slack `<@U…>`, Discord `<@id>`, Telegram user link). The username must be the raw one from `sender_name`; the sender id holds a folded copy (lowercase, `[^a-z0-9_-]` to `-`), so `parseSender` prefers `sender_name` and crew handles and the mute list compare folded forms (`sameHandle`).
- Slack and Discord turn a typed `@ferri` into a mention of the bot user when its name starts with "ferri", and the message then misses Ferri. The platform bot and app are named "Switch".
- A crew member is linked to a Switch account by `handles.switch = <email>` (Pocket's Me tab or `pnpm crew:account`). Pushes reach crew through that link; a Desk or Pocket answer is credited to that crew member's name.
- A service worker's scope must contain the page: `/m` is outside scope `/m/`, so Pocket's worker uses scope `/m` (header `Service-Worker-Allowed: /m`).
- A new Mattermost channel becomes a Switch room only when the bridge bot is in it, and adding Mattermost's `ferri` bot user to a channel puts Ferri in that room too. `GET /gateway/rooms` names rooms by the raw chat name ("build-night"); Ferri's spaces use the agent's room detail name ("Pulse Slack: build-night"), so Desk builds that form from `bridge_display_name`.
- `POST /gateway/rooms` refuses an internal room without an agent ("Internal rooms require at least one agent").
- Question cards draw buttons on Telegram (inline keyboard), Slack (Block Kit) and Discord (buttons); typed `A1 "text"` works on all of them, even with Slack's curly quotes.

## Status
- Spec 01, Ferri alive in Switch: done.
- Spec 02, knowledge and answers with sources: done 2026-11-05. Postgres + pgvector, knowledge tables with revisions, markdown seed, answers only from knowledge with a source line, Haiku triage for room questions, questions log, cursor in Postgres, Switch library mirror. Eval 24/24 on Haiku.
- Spec 03, the learning loop with question cards: done 2026-11-06. Crew with topic owners (seeded from `event.yaml`), crew room `ferri-crew`, cards routed owner, on duty, everyone; similar questions join one card; answers from the card, from chat ("@ferri ..."), or "remember" facts; fan-out to every waiting asker with a source; crew answers saved as knowledge with a revision and mirrored; nudge, escalate, expire; replay-safe through `questions` and `crew_actions`. Eval 38/38 on Haiku.
- Spec 04, community, events, spaces and Desk v1: done 2026-11-06. Spaces discovered Off, attached to events as Listen, Approve or Auto, or as the crew room; master pause with held deliveries; mute list; reply cards for Approve spaces; knowledge scoped to the space's event; Desk edits survive re-seeding; mirror follows every change; Desk with Overview, Cards, Spaces, Events (settings, crew), Knowledge (edit with revisions), Community (instructions, mute list).
- Spec 05, outside platforms: done 2026-11-06. Telegram, Slack and Discord connected through the Gateway; their spaces arrive in Desk as Discovered and Off; one event with spaces on four platforms; one card answered once in the crew room reaches askers on Telegram, Slack and Discord with native mentions; platform from the bridge type; `pnpm card:preview`.
- Spec 06, Ferri Pocket: done 2026-11-06. PWA at `/m` (manifest, service worker, icons), Switch sign-in, crew link, Web Push on card open, nudge, escalate, expire and settle; Needs you; answer, don't answer; reply cards Send, Edit, Don't send; Who is stuck; Desk "Add Ferri" for rooms Ferri is not in; works through a Cloudflare tunnel. Card prep no longer calls "can I ..." rule questions personal. Eval 41/41 on Haiku.
