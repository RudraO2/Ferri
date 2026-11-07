# Desks: rooms for each job, with sheets

A hackathon needs a judging channel, a check-in table and a help desk. Ferri makes them from Switch templates, each with its own skill.

- `@ferri make a judging desk with arjun` makes a private channel, `#bn-judging`, on the crew room's platform, with Arjun, Ferri and a kickoff, attached to the event at once. The name starts with the event's initials.
- A desk is a skill file: `skills/desks/<kind>.md`, YAML front matter (room name, private or public, Ferri's mode there, who is invited, the topic its cards route to, care, an optional sheet, the kickoff) and then how Ferri behaves in that room. Eleven come with Ferri: help, judging, mentors, volunteers, checkin, speakers, sponsors, food, safety, tables and lost-found.
- Packs set up several at once: `skills/packs/<type>.md` for a hackathon, meetup, game night, festival, workshop or conference. `@ferri set up the desks for a meetup` opens one card listing every room; "Make them" makes them, "Don't" makes nothing.
- No kind fits? `@ferri make a desk for the rangoli judges where they post scores per entry, with arjun` has Ferri write a new desk skill and show the whole skill on a card. "Make it" saves it (editable in Desk) and makes the room.
- Sheets: in a desk with a sheet, Ferri reads each message (add a row, change a row, show the sheet, or nothing). "Team Alpha 8 for innovation" is noted, "actually make it 9" changes the row, and "@ferri show the scores" posts the ranked totals. The totals are counted in code, not by the model. Each sheet is a Switch library document in its desk room, updated on every change, and a CSV download in Desk.
- The check-in desk marks guests checked in on the guest list ("checked in Meera Test"), and asks about a name that is not on it. A help desk sends technical problems to the Builder at any stage of the event. Messages that are not sheet entries are answered as usual, with sources.
- Desk's Desks page shows each desk with its room, kind, mode and sheet, and lets the crew make a desk, set up a pack, or turn an existing space into a desk. Pocket shows desk cards.
