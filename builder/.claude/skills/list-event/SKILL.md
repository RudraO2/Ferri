---
name: list-event
description: List the community's event on an event platform (Luma first; any other platform with a create form) from the kit in kits/listings. Fills the platform's form in the Builder's own browser where a person logged in, posts a screenshot, and submits only after the crew says yes on a card. Use it when a job asks to put the event on Luma, Meetup, Commudle, Devfolio or any listing site.
---

# List the event on a platform

You fill the platform's own create form in the Builder's browser (a Chrome window on the organizer's screen with a profile of its own), show the crew a screenshot, and submit only after a yes on a Switch card. A person logs in to the platform in that window themselves.

Never type, ask for, read or store a password. Never create an account. Never try to solve a captcha or a verification step: a person does those in the window. Never write a key or a secret into the room, a report or a file.

All commands run from your working folder. The kit is `kits/listings`; if `kits/listings/node_modules` is missing, run `npm ci` in `kits/listings` once.

## 1. The job folder and the facts
Work in `jobs/<job id>-<short-slug>/` (for example `jobs/B14-luma-listing/`). Read the room's documents with `load_internal_documents` (Ferri's knowledge and the event plan; decided items in the plan win over older knowledge).

Write `listing.json` there, fresh from the documents (`kits/listings/example/listing.json` shows the shape; its event is made up):
- `platform`: `luma`, or `generic` for any other site (step 6).
- `name`: the event's name exactly as the documents write it.
- `start`, `end`: local times like `2026-11-21T10:00`, from the schedule (when people arrive or it starts, and when it ends). `timezone`: the IANA zone (`Asia/Kolkata` for India).
- `venue`: the full address as one line, exactly as the documents write it. `online`: a join link for an online event, else null.
- `description`: two or three short paragraphs separated by a blank line: what it is and who it is for, the key facts from the documents (prizes, food, team size) in their own words and numbers, and how to register, with the site's address when there is one.
- `url`: the event's site, or null. `visibility`: `public` unless the job says private. `capacity`: a number only if the documents give one, else null.
- `cover`: the poster's square card if the hand-off names one (its path, from your working folder), else null.
A missing fact stays a `[placeholder]`: the kit refuses to type a placeholder into a form, so report it and stop.

Check it: `node kits/listings/scripts/listing.mjs check --job <job folder>`.

## 2. Luma: the API or the browser
If `.ferri/listings.json` has a Luma key (`node kits/listings/scripts/luma-api.mjs check` exits 0), use the API: run `node kits/listings/scripts/luma-api.mjs create --job <job folder>`. It asks the crew on a card by itself; just run it and wait. Then go to step 5.

Exit 3 (no key; Luma's API needs Luma Plus) means the browser path, steps 3 and 4.

## 3. Fill the form in the browser
1. `node kits/listings/scripts/browser.mjs start` (it says if it is already open).
2. `node kits/listings/scripts/listing.mjs fill --job <job folder>`.
   - Exit 0: the form is filled and nothing is submitted. It prints every value it typed and the screenshot `out/<platform>-filled.jpg`.
   - Exit 5: a person is needed (not logged in, a captcha, a check). Post `out/needs-you.jpg` with `send_attachment` and a caption like "To list Build Night on Luma, please log in to Luma in the Builder's browser window (the Chrome window titled Luma). I don't see or keep the password." Then ask with `AskUserQuestion`: "Log in to Luma in the Builder's browser window, then pick Done." with the options "Done, logged in" and "Not now". After Done, run fill again. After "Not now" or no answer, report `Job <id> stuck:` and stop.
   - Exit 2: `listing.json` is not ready; fix it or report the placeholder.
   - Exit 1: read the message and the error screenshot. Run fill once more at most; then report stuck with what you saw.
3. Look at the screenshot with the Read tool. If something is wrong (a field empty or in the wrong place), fix `listing.json` and fill again.

## 4. Show the crew, then submit
1. Post the screenshot with `send_attachment` (the one file `out/<platform>-filled.jpg`) and a caption of two or three sentences: that it is filled in on the platform and not published yet; the name, when, where and visibility exactly as fill printed them, and whether the poster is the cover; that the screenshot shows the start of the description and its full text is in the job's listing.json in Desk. End with "Approve the card to publish it."
2. Then run `node kits/listings/scripts/publish.mjs --job <job folder> --say "Publish <event> on <platform> (<visibility>)"`. Switch shows the crew a permission card for it first; just run the command and wait. Do not add a question of your own.
   - Denied: nothing is published. Post one line ("Okay, I won't publish it.") and report `Job <id> done: Not published; the crew said no.`
   - Exit 4: the form changed since the screenshot, or the tab is gone. Fill again, post the new screenshot, and run publish again.
   - Exit 5: a person is needed again (as in step 3).
   - Exit 0: it prints the listing's address and writes `out/<platform>-live.jpg`.

## 5. Post it and report
1. `send_attachment` with `out/<platform>-live.jpg` (if there is one) and a caption: "Build Night is live on Luma: <address>" and anything the crew should check.
2. Report to ferri with `send_targeted_message`: `Job <id> done: <event> is listed on <platform> at <address>.` If you could not finish, `Job <id> stuck:` and what you need.

## 6. Any other platform (generic)
1. Ask a person to log in there in the Builder's browser if needed (step 3's card), opening the page for them: `node kits/listings/scripts/browser.mjs open <the platform's sign-in or create page>`.
2. `node kits/listings/scripts/listing.mjs inspect --job <job folder> --url <the create page>` lists the page's fields and buttons (`out/inspect.json`, `out/inspect.jpg`).
3. Write `form.json` in the job folder (the shape is at the top of `kits/listings/recipes/generic.mjs`): the create page, how to tell the person is logged in, each field with its label and a value from `listing.json` (`{{name}}`, `{{venue}}`, `{{description}}`, `{{startDate}}`, ...), the publish button's name in `submit`, and the address pattern of a published listing in `published`. Never put the publish button in `fields`.
4. Set `"platform": "generic"` in `listing.json`, then steps 3 to 5 as for Luma.

## 7. Taking a listing down
Only when a job asks: `node kits/listings/scripts/takedown.mjs --job <the job folder that published it>`. It asks the crew on a card first.
