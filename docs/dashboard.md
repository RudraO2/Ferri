# Desk, the organizers' dashboard

Desk is where organizers run Ferri: http://localhost:3100 once `./ferri up` is done, signing in with a Switch account (`admin@switch.local` and the password `./ferri up` prints, also in `.env` as `GATEWAY_ADMIN_PASSWORD`).

- **Spaces**: every group or channel Ferri is in, on any platform. New ones arrive in a Discovered list, switched off. Rooms in Switch that Ferri is not in yet are listed with an **Add Ferri** button, so nobody has to type `!invite-agent`. Attach a space to an event as Listen (reads, never posts), Approve (every reply waits for an organizer), or Auto (answers with sources), or make it the event's crew room, where cards land.
- **Pause**: one switch stops every post everywhere. Questions are still logged, and answers the crew gives during the pause go out when it is lifted.
- **Cards**: questions waiting for the crew, replies waiting for approval (Send, edit and send, Don't send), answered, unanswered and dismissed. Answers from Desk go through Switch under your name.
- **Events**: stage, dates, venue, instructions, attached spaces, and the crew with the topics each person owns.
- **Knowledge**: every entry, searchable; editing one makes a new version that Ferri uses at once. Seeding again never overwrites an edit made in Desk.
- **Community**: the central instructions, the mute list, and the community's settings.
- **Setup**: a first-run checklist on top (platform connected, Ferri in a group, event attached, crew room set, knowledge loaded, crew on Pocket) that ticks itself from Switch and Ferri's own data, each tick with its next step and guide; the built-in Mattermost test chat and the Lantern demo show as demo, not done. Below it, the same checks as `./ferri doctor`: the core of the stack and every optional part, on, off or broken, with the next step.
- **More pages**, each described in its own doc: Plan and Announcements ([plan-and-launch.md](plan-and-launch.md)), Care ([care.md](care.md)), Guests ([rsvp.md](rsvp.md)), Social ([social.md](social.md)), Desks ([desks.md](desks.md)), Contacts ([email.md](email.md)), Wrap ([wrap.md](wrap.md)), Skills ([customization.md](customization.md)), Builder ([builder.md](builder.md)) and Shield ([shield.md](shield.md)).

Ferri Pocket, the crew's phone app, lives inside Desk at `/m` ([pocket.md](pocket.md)).
