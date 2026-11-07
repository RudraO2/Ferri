# Shield: safety on every message

Shield is Ferri's Switch Trust endpoint. Switch sends every message, from people and from agents, to `POST /guardrails/check` before anyone sees it, and Shield answers in a few milliseconds (Switch's limit is 2 seconds; no model call in the path):

- Scam and lookalike links are blocked: `dlscord-gift.com`, `steamcommunlty.com`, punycode lookalikes, a brand name inside a strange domain with scam words, "free nitro" or "seed phrase" with a link, and anything on the community's block list. The message never reaches the room or Ferri, and Switch tells the sender.
- The same link posted three times in two minutes is blocked as a flood.
- API keys, tokens, private keys and database passwords are replaced with `[redacted]`, in members' messages and in Ferri's own posts.
- The crew hears about it in the crew room (the domain defanged, never the secret), and the leads get a push.
- Desk's Shield page shows the connection, the numbers and latency, what was stopped, and lets organizers allow or block domains.

## Turn it on

```bash
./ferri shield:connect            # writes SHIELD_API_KEY to .env and stores the endpoint in Switch
docker compose restart ferri      # once, so Ferri reads the key and starts Shield
```

Or use the button on Desk's Shield page.

- `./ferri shield:connect --status` shows what Switch has. `./ferri shield:connect --off` turns it off.
- In the stack, Switch reaches Shield at `http://ferri:3200`. When Ferri runs on the host instead ([development.md](development.md)), run `pnpm shield:connect` from the host: Switch then reaches it at `http://host.docker.internal:3200` (override with `SHIELD_ENDPOINT`).
- Set `GOOGLE_SAFE_BROWSING_KEY` to add a reputation lookup (capped at 700 ms).

While Shield is connected, keep Ferri running. If Ferri is down, Switch adds "Switch Trust could not check this message" to every message ([troubleshooting.md](troubleshooting.md)).
