# Customization: skills, tone, languages, settings

Every community sounds different. The crew changes how Ferri behaves without touching code.

- Skills: Ferri's persona, its answer rules, every desk and every pack are markdown files in `skills/`. Desk's Skills page edits any of them, with versions and "Reset to default", and Ferri uses an edit on its next message. The source check, the cards and the pause are in code, so no skill edit can turn them off.
- Settings per community, per event and per space, each with a default: tone (warm, playful, professional, brief, or the crew's own words), language, how long Ferri waits before answering a question said to the room, the card ladder's timing, care on or off, when the Builder helps on its own, check-ins, guest reminder and nudge timing and the daily cap, wrap timing, and whether Ferri reads decisions and the plan from crew chat.
- By chat, in the crew room: `@ferri be more playful for Build Night`, `@ferri reply in Hindi in team-alpha`, `@ferri turn off care for Build Night`, `@ferri wait a minute before answering questions in the room`, `@ferri what are the settings?`. Ferri changes it at once, says what changed and how to undo it, and records who changed it. There is no card for this: it works only from inside the crew's rooms, and every change can be undone.
- Languages: a space with its own language gets answers in that language, with the source label translated too, while the citation check stays the same. An announcement to it is translated once, shown on the same approval card ("In Hindi for Mattermost team-alpha: ..."), and each space gets its own version, edits included.
- Desk has Settings on the Community page and on each event (each key with its default and a reset), tone and language per space on the Spaces page, and the Skills page.
- What we checked: a skill edit showing in the next answer and gone after Reset, a playful tone for an event, Hindi answers in one Mattermost team room while the main room stayed English, one approval posting English and Hindi versions of an announcement, care turned off, a shorter step-in wait and a shorter card ladder. The language tests ran on Mattermost; WhatsApp spaces use the same code path but were not tested in Hindi.

## Settings in `.env`

A few settings have a base value for the whole install in `.env` (Desk and chat settings override them):

- `FERRI_MODEL_MAIN` (answers, planning, drafting; `claude-sonnet-5-5`) and `FERRI_MODEL_FAST` (per-message triage; `claude-haiku-5-5`), with `FERRI_EFFORT_MAIN` and `FERRI_EFFORT_FAST`. `claude-haiku-5-5` as the main model is cheaper and fine for trying Ferri.
- `FERRI_ROOM_GRACE_SECONDS` (20): how long Ferri waits on a question nobody addressed to it.
- `FERRI_COMMUNITY`: which community this install serves (its slug). Empty: the first one in the database.
- `FERRI_NUDGE_SECONDS`, `FERRI_CARD_TTL_SECONDS`: test overrides for the card ladder. Leave them empty in real use.

Restart Ferri after a change: `docker compose restart ferri desk`.
