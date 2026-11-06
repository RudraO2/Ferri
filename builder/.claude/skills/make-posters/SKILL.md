---
name: make-posters
description: Make an event's poster and social cards (print A4, square, 4:5, story, link card, X) from the kit in kits/posters, with generated background art and the exact text and a QR code drawn on top. Use it when a job asks for a poster, a flyer, social cards, a story, a banner or images to share an event.
---

# Make the poster and social cards

You make one design and the kit renders every size from it. The background is art from the image model (or a community photo); every word, the date, the venue, the address and the QR code are drawn by the kit from `design.json`, so they are exactly what you typed. Never ask the image model for text.

Never write a key, a password or a secret into the room, a report or a file.

## 0. Ready?
- The kit is `kits/posters` in your working folder. If `kits/posters/node_modules` is missing, run `npm ci` in `kits/posters` once.
- `.ferri/studio.json` has the image model, quality and the call limit. You do not need to read it; the scripts do.

## 1. The job folder
Work in `jobs/<job id>-<short-slug>/` (for example `jobs/B6-build-night-poster/`). All paths below are inside it.

## 2. The facts
Read the room's documents with `load_internal_documents` (Ferri's knowledge and the event plan). Decided items in the plan win over older knowledge. The site's address is in the knowledge (the "site is live" announcement) or in the brief; the QR code and the address on the cards point there. If there is no site and the brief gives no link, use a placeholder and report it.

## 3. design.json
`kits/posters/example/design.json` shows the shape; its event is made up, so write every value fresh from the documents. Only facts from the documents, in their own words and numbers: never add up, round or reword a number (three prizes stay three prizes, not a total). A missing fact stays a `[placeholder]` and goes in your report.
- `event`: the event's name exactly as the documents write it.
- `kicker`: optional, short ("Lantern Labs presents").
- `tagline`: one sentence, at most about 90 characters.
- `date`: the day(s), written out ("Sat 21 to Sun 22 November 2026"). `time`: the start ("doors 9:00 AM").
- `venue`: place and area, short enough for one or two lines ("Koramangala Makerspace, 80 Feet Road, Bengaluru").
- `url`: the full address with https://. `cta`: "Register free" if registration is free, else "Register".
- `highlights`: up to 3 short facts from the documents (prizes, "24 hours", food), each under about 22 characters.
- `community`, `accent` (a hex colour that suits the art), `logo`: the community logo from `assets/community/` in your working folder (an absolute path).
- `art`: `art/background.png`. `artPrompt`: what the background shows, from the event's theme and place: mood, light, colours, a scene. No words in it.
- Characters: letters, digits, normal punctuation and ₹ are fine. No emoji, no arrows; the render refuses characters the fonts cannot draw.

## 4. Community images
- The community's logo is in `assets/community/`. Use it.
- If someone posted a photo with the request (the message lists a downloaded path) or in the room for this job, use it: copy it into the job folder and set `"photo": "<file>"`. A photo is the background instead of the art, so make no image call. If the crew wants both, set `"photoInset": true` and make the art too.

## 5. The art (one call)
From your working folder: `node kits/posters/scripts/art.mjs --job <job folder>`.
- Exit 0: `art/background.png` is ready (or already there and reused).
- Exit 3: no key or the call failed. Go on: the render draws its own background. Say "without generated art" in your caption.
- Exit 4: the job used its image calls. Reuse what you have.
Run it once. Run it again (`--again`) only when the crew asks for different art. Images cost money.

## 6. Render and check
`node kits/posters/scripts/render.mjs --job <job folder>`. It writes `out/` (every size, PNG, JPEG for social, SVG for the poster) and checks that every character exists in the fonts and that the QR code on every image reads back as the URL. If it fails, read the message, fix `design.json` (shorter text, other characters), and run it again. Never change the kit.

Then look at `out/<slug>-square.png` with the Read tool. If the text is hard to read on the art, pick another accent or a calmer prompt and say why.

## 7. Post it in the room
One `send_attachment` with `paths` set to these three JPEGs from `out/`: `<slug>-square.jpg`, `<slug>-story.jpg` and `<slug>-poster-preview.jpg` (the print-size PNG is too big for a chat upload), and a caption of two or three sentences:
- what they are, and the exact text on them as the render printed it (when, where, the address), and that the QR code goes to the address;
- that every size (print A4 as PNG, JPEG and SVG, square, 4:5, story, link card, X) is in Desk;
- placeholders, or "without generated art" if that happened.
That caption is your one result message.

Do not post the images anywhere else, and do not ask to share them: Ferri asks the crew on a card before anything goes outside.

## 8. Report
`send_targeted_message` to ferri: `Job <id> done: Poster and social cards for <event>, pointing to <url>.` followed by the three file names you posted. If you cannot finish, `Job <id> stuck:` and what you need.
