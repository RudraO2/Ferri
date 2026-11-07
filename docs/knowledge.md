# How Ferri answers and learns

## How Ferri answers

- The knowledge lives in Postgres (`knowledge_entries`, every edit kept in `knowledge_revisions`). Markdown in `seed/` is one way in; each `##` section is one entry.
- Ferri answers only from that knowledge and names the source under every answer. If the knowledge does not have it, Ferri says it is checking with the team and logs the question.
- A fast model (Claude Haiku) reads every message, so Ferri also notices questions nobody addressed to it. It waits a moment so a person can answer first, and steps in only when it has a sourced answer.
- Every handled question is one row in `questions`, which is also how Ferri never answers the same message twice.

## How Ferri learns

1. A member asks something the knowledge does not cover. Ferri tells them it is checking with the team.
2. Ferri opens a Switch question card in the crew room and pings the person who owns that topic (crew and topics live in `seed/events/<event>/event.yaml`). Someone else asking the same thing in other words joins the same card.
3. Anyone on the crew answers, on the card (`A1 "your answer"`) or just by telling Ferri (`@ferri dogs are fine on a leash`). Crew can also teach Ferri directly: `@ferri remember: lockers are on the 2nd floor`.
4. Everyone who was waiting gets the answer in their own room, with the source. The answer is saved as knowledge, so the next person gets it instantly.
5. Nobody answers: Ferri nudges the owner, then the whole crew, and finally marks the question unanswered. It never sends members anything the crew has not said.

## The demo knowledge

`./ferri up` loads `seed/`: a made-up community, Lantern Labs, and its event, Lantern Build Night. It writes them into Postgres and mirrors the knowledge into a Switch library document attached to `ferri-lab`. Loading again is safe: only changed sections get a new version, and an edit made in Desk is never overwritten.

To serve your own community, edit the markdown in `seed/` (and the crew and topics in `seed/events/<event>/event.yaml`), then run `./ferri kb seed`. Or edit the knowledge in Desk.

## Knowledge commands

| Command | What it does |
|---|---|
| `./ferri kb seed` | Load `seed/` into the database and update the Switch mirror. Also discovers Ferri's rooms and attaches the spaces `event.yaml` names. |
| `./ferri kb list` | Show the live knowledge entries |
| `./ferri kb ask "<question>"` | Run the answer pipeline without Switch (`--room` as a room question, `--search` to force full text search) |
| `./ferri eval:answers` | Check Ferri's decisions on a fixed set against the real model ([testing.md](testing.md)) |

On the host, the same commands are `pnpm kb seed` and so on ([development.md](development.md)).
