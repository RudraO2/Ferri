# Ferri Pocket

Pocket is the crew's phone app: a PWA at `/m` inside Desk (http://localhost:3100/m), with the same Switch sign-in.

- **Needs you**: the cards for you (topics you own, replies waiting for your OK, anything escalated to the whole crew), then the rest of what is open.
- **A card**: who is waiting, on which platform, and for how long. Write the answer and send it, or don't answer. For a reply waiting in an Approve space: Send, Edit, or Don't send. It goes through Switch under your name.
- **Who is stuck**: every member still waiting on the crew, longest first, and who never got an answer in the last day.
- **Me**: say which crew member you are (once), turn on notifications, send a test.
- **Push**: Web Push (VAPID). Your phone buzzes when a card for you opens, at the nudge, when it is escalated to everyone, and when it expires. When someone else answers, the notification changes to "Answered by Priya" so stale buzzes never linger.

Pocket also shows the other cards that need the crew: announcements and `+ Announce`, plan decisions, care cases, guest sends and freed spots, social posts, desks, the Builder's questions and the wrap card.

## Setup

- **Push keys**: `./ferri up` writes the VAPID keys to `.env` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`) once. `./ferri push:keys` writes them if they are missing. Changing them drops every phone's subscription.
- **Crew logins**: a crew member without a Switch login gets one with `./ferri crew:account <crew name> <email>`, which also links them to their crew entry.
- **HTTPS for phones**: phones need HTTPS for a PWA and Web Push. For a quick try, run a Cloudflare quick tunnel on the machine that runs the stack:

  ```bash
  cloudflared tunnel --url http://localhost:3100
  ```

  Open the `https://….trycloudflare.com/m` link on the phone. Put that address in `.env` as `FERRI_PUBLIC_URL` and restart Desk and Ferri (`docker compose restart ferri desk`).

- **A stable address**: for real use, put Desk on a stable hostname with a named tunnel (example config: `infra/cloudflared.example.yml`), because push subscriptions belong to one web address. For example `https://ferri.example.com/m`. Set `FERRI_PUBLIC_URL` to it.
- **Allowed origins**: the hosts allowed to post Pocket's forms are baked into Ferri's image at build time from `POCKET_ALLOWED_ORIGINS` (default `*.trycloudflare.com`). For your own host name, add it there and set `FERRI_VERSION=local` in `.env`, then run `./ferri up`. No image is published under that tag, so `./ferri up` builds Ferri's image from your checkout with your hosts, every time, instead of pulling the published one over it.
- **iPhone**: add Pocket to the Home Screen first, then allow notifications from it.

`FERRI_PUBLIC_URL` also serves the public RSVP page ([rsvp.md](rsvp.md)), Resend's webhook ([email.md](email.md)) and the event site's reports ([builder.md](builder.md)). `./ferri doctor` checks that it is reachable.
