---
name: make-posters
description: Make an event's poster and social cards (print A4, square, 4:5, story, link card, X) from the kit in kits/posters, with generated background art and the exact text and a QR code drawn on top. Use it when a job asks for a poster, a flyer, social cards, a story, a banner or images to share an event.
---

# Make the poster and social cards

You make one design and the kit renders every size from it. The background is art from the image model (or a community photo); every word, the date, the venue, the address and the QR code are drawn by the kit from `design.json`, so they are exactly what you typed. Never ask the image model for text.

Never write a key, a password or a secret into the room, a report or a file.

One look per event: the event site takes its look from the newest poster job (the accent, the ink, the fonts, the art as its hero, the link card as its preview image), and the listing uses the square card as its cover. So the posters set the event's look; make them with care.

The bar is a poster a good design studio made for a real event: designed art (shapes, light, a flat illustration or a print texture), never an AI photo of a scene; one clear hierarchy (the event name large, then date and place, then one call to action); every word on a solid panel, on one grid. The kit does the layout and the art prompt; your part is the words, the colours, the style and the motif. A poster that looks generated costs the event its visitors' trust.

## When the job also asks for the site
Make the posters first, in this job's folder. Point the QR code and the address at `https://<slug>.vercel.app` (the slug is the event name in lowercase with dashes), the site's address once it is live. Post the images (step 7), but do not report yet: then call your `ship-event-site` skill with the Skill tool and follow it. Its report covers both.

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
- `kicker`: optional, short ("Lantern Labs presents"). When it names the community, it goes on the tag with the logo instead of the community name.
- `tagline`: one sentence, at most about 90 characters.
- `date`: the day(s), written out ("Sat 21 to Sun 22 November 2026"). `time`: the start ("Doors 9:00 AM"); it sits on its own line under the date.
- `venue`: the place first, then a comma and the address ("Koramangala Makerspace, 80 Feet Road, Bengaluru"): the part before the first comma is drawn bold, the rest under it.
- `url`: the full address with https://. `cta`: "Register free" if registration is free, else "Register". It is the one call to action, so keep it to two or three words.
- `highlights`: up to 3 short facts from the documents (prizes, "24 hours", food), each under about 22 characters. They show on the print poster and the story.
- `community`, `logo`: the community logo from `assets/community/` in your working folder (an absolute path).
- Colours: `accent` is the event's one strong colour (a hex that suits the subject; the button, the dots and the art's lead colour; the event site uses it for its buttons and links). `theme`: `"dark"` (text on `ink`, the default; night events, tech, music) or `"light"` (text on `paper`; daytime, family, food, books, outdoors). `ink`: a deep, slightly tinted near-black that suits the accent ("#120f1a" with amber), not pure black; the event site reads it too. `paper` (light theme only): a warm off-white, default "#f4efe6".
- `art`: `art/background.png`. `artStyle`: the art's style, picked from the event's subject (see step 5). `artPrompt`: the motif only, a few words of one simple idea from the event's theme ("paper lanterns as glowing circles hanging from thin lines", "a die and a pawn as flat shapes"). Not a scene, no people, no words; the kit adds the style, the palette from your colours, the composition and the rules.
- Optional: `artFocus` ("center", "top", "50% 30%") moves the crop of the art; `artEdge` (`"cut"` or `"fade"`) overrides how the art meets the panel (the kit cuts flat art cleanly and fades photos and gradient light).
- Characters: letters, digits, normal punctuation and ₹ are fine. No emoji, no arrows; the render refuses characters the fonts cannot draw.

## 4. Community images
- The community's logo is in `assets/community/`. Use it.
- If someone posted a photo with the request (the message lists a downloaded path) or in the room for this job, use it: copy it into the job folder and set `"photo": "<file>"`. A photo is the background instead of the art, so make no image call. If the crew wants both, set `"photoInset": true` and make the art too.

## 5. The art (one call)
Pick `artStyle` from the event's subject, and say which in your caption only if the crew asked about the art:
- `geometric`: a few bold flat shapes, Swiss and Bauhaus style. Hackathons, build nights, dev and AI meetups, maker events.
- `gradient`: soft gradient-mesh light. Talks, conferences, launches, community meetups.
- `illustration`: one symbolic motif as an editorial flat illustration. Food, music, film, games, sport, outdoors, culture.
- `riso`: risograph print on warm paper. Workshops, zines, art and design, books, indie events (it suits `"theme": "light"`).
- `custom`: your `artPrompt` as written (the rules still apply), only when the crew asks for a particular picture.
Without `artStyle` the script picks one from the event's words and says which. `--show-prompt` prints the full prompt without a call, if you want to check it first.

From your working folder: `node kits/posters/scripts/art.mjs --job <job folder>`.
- Exit 0: `art/background.png` is ready (or already there and reused).
- Exit 3: no key or the call failed. Go on: the render draws its own background. Say "without generated art" in your caption.
- Exit 4: the job used its image calls. Reuse what you have.
Run it once. Run it again (`--again`) only when the crew asks for different art. Images cost money.

## 6. Render and check
`node kits/posters/scripts/render.mjs --job <job folder>`. It writes `out/` (every size, PNG, JPEG for social, SVG for the poster) and checks that every character exists in the fonts and that the QR code on every image reads back as the URL. If it fails, read the message, fix `design.json` (shorter text, other characters), and run it again. Never change the kit.

Then look at `out/<slug>-square.jpg`, `out/<slug>-story.jpg` and `out/<slug>-poster-preview.jpg` with the Read tool, as the crew will see them. Check: the art looks designed (no faces, no fake letters or signs, no busy photo scene), its colours sit with the accent and the panel, and the title, date, place and button read at a glance. If the art fails that, say so in your report instead of posting it; a second image call needs the crew to ask (step 5). If the layout looks off (a crop cuts the art's main shape), move the crop with `artFocus` and render again; renders cost nothing.

## 7. Post it in the room
One `send_attachment` with `paths` set to these three JPEGs from `out/`: `<slug>-square.jpg`, `<slug>-story.jpg` and `<slug>-poster-preview.jpg` (the print-size PNG is too big for a chat upload), and a caption of two or three sentences:
- what they are, and the exact text on them as the render printed it (when, where, the address), and that the QR code goes to the address;
- that every size (print A4 as PNG, JPEG and SVG, square, 4:5, story, link card, X) is in Desk;
- placeholders, or "without generated art" if that happened.
That caption is your one result message.

Do not post the images anywhere else, and do not ask to share them: Ferri asks the crew on a card before anything goes outside.

## 8. Report
`send_targeted_message` to ferri: `Job <id> done: Poster and social cards for <event>, pointing to <url>.` followed by the three file names you posted. If you cannot finish, `Job <id> stuck:` and what you need.
