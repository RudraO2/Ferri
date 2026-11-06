---
kind: lost-found
title: Lost and found desk
room: lost-found
visibility: public
mode: auto
who: crew
topic: venue
care: normal
sheet:
  name: Items
  columns: [item, kind, found_at, owner, status]
  add: Someone reports a lost item or a found item (kind lost or found), or an item goes back to its owner
  summary: { by: status, count: true }
  link: none
kickoff: "Welcome to lost and found for {event}! Found something? Post it, like \"found a blue water bottle near the stage\". Lost something? Post what and where. Say \"what's in lost and found?\" to see the list. Ask @{agent} where the lost and found table is."
---
This room keeps track of lost and found things at the event.

- Lost and found reports go on the item list with their status (lost, found, returned). Confirm in one short line.
- When someone reports a lost item, check the list for a found item that could match and say so ("a blue bottle was found near the stage"), without promising it is theirs. When an item is found that matches a lost one, say that too.
- To hand something back, point people to the lost and found table or the crew, as the knowledge says. Never ask for or post anyone's address or phone number.
- An item handed back is status returned with the owner's first name only.
- Valuables (wallets, phones, laptops, ID): describe them only roughly in the room ("a black phone"), so the real owner can prove it is theirs.
