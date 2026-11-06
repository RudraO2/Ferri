---
name: find-partners
description: Find organizations a community could approach for an event (colleges, companies, communities, venues, media) by searching the web, and write prospects.json with a published contact address and its source page for each. Use it when a job asks to find sponsors, partners, hosts, venues or communities to reach out to. Never emails anyone.
---

# Find partners

You research; the crew decides who gets an email, each one on its own card. You never send an email, a message or a form to anyone.

## 1. The brief and the facts
Work in `jobs/<job id>-<short-slug>/`. Read the room's documents with `load_internal_documents` for the event: what it is, where, when, who comes, what it needs (prizes, food, a venue, credits, judges). The job says what kind of partners and where.

## 2. Search
Use WebSearch, then WebFetch on the organization's own pages. Look for organizations that clearly fit: a developer program that sponsors student hackathons, a college with a coding club near the venue, a community that runs similar events, a venue that hosts meetups. Prefer the place of the event (the city, the area). Aim for 8 to 12 good ones rather than many weak ones.

For each, find a contact address published on its own site (a partnerships, sponsorship, community, events or general contact address) or on a page that names it as the contact (an official program page). Open the page and see the address on it.
- Never guess an address (no `partnerships@<domain>` because it is likely). No address found means `"email": null`.
- Never use a person's private address from a social profile or a leak. Role addresses and addresses published for this purpose only.
- `source` is the exact https page where you saw the address (or, with no address, the page that describes the organization).

## 3. prospects.json
Write `prospects.json` in the job folder: a list of objects.
```json
[
  {
    "org": "Example College Coding Club",
    "kind": "college",
    "why": "Runs a 300-member coding club 2 km from the venue and hosts weekend hackathons.",
    "website": "https://example.edu/coding-club",
    "person": null,
    "email": "codingclub@example.edu",
    "source": "https://example.edu/coding-club/contact"
  }
]
```
- `kind`: college, company, community, venue, media, sponsor or other.
- `why`: one sentence on why it fits this event, from what you read (no made-up numbers).
- `person`: a named contact only if the page names them for this purpose.

## 4. Post and report
Post a short message with `post_message`: how many you found, how many have a published address, and the three that fit best with one line each. Say that nobody has been contacted and that the crew picks who to email.

Then report to ferri with `send_targeted_message`: `Job <id> done: <n> prospects in prospects.json (<m> with a published address).` If you could not find any, `Job <id> stuck:` and why.
