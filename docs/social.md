# Social posts: LinkedIn, X and Instagram through Buffer

`@ferri post the Build Night poster on LinkedIn, X and Instagram on 1 June 2027 at 10 AM, saying registration is open` ends with one card that holds every post.

- Ferri drafts one text per network from the knowledge, sized for it: X fits 280 characters with the site link, Instagram has no link (it would not be clickable there), LinkedIn is longer. Instagram is left out when there is no image.
- The poster comes from the Builder's poster job ([builder.md](builder.md)). Buffer has no upload, so Ferri puts the image on its own media host (`infra/media-worker`, a Cloudflare Worker with Workers KV, behind `FERRI_MEDIA_SECRET`) and gives Buffer that address.
- The social card shows every text, the image and the time. "Post it" (or "Schedule it", up to two years ahead), "Save as Buffer drafts", "Don't post", or the crew's own words. Nothing reaches Buffer before that answer.
- Ferri follows the posts in Buffer (sent, deleted) and removes the image from the media host as soon as every post that uses it is done, refused or deleted.
- Desk's Social page shows the channels, the cards waiting, a form to write a post, and each post with "Delete in Buffer". Pocket shows social cards.
- What we checked: Buffer's API with our key (three channels), the media host, a declined card (nothing sent, image removed), and "Save as Buffer drafts" making three dated drafts in Buffer that Desk then deleted. The accounts are real personal profiles, so we tested with drafts only: nothing was ever posted live.

## Turn it on

1. Get a Buffer API key: Buffer, Settings, API (publish.buffer.com/settings/api), with the scopes `account:read`, `posts:read` and `posts:write`. Put it in `.env` as `BUFFER_API_KEY`.
2. Pick a long random secret and put it in `.env` as `FERRI_MEDIA_SECRET`.
3. Deploy the media host. Buffer has no upload: it fetches each image from a public address when the post goes out, so the image must stay reachable until then. The media host is a small Cloudflare Worker with Workers KV in `infra/media-worker`. On any machine with Node and a Cloudflare account:

   ```bash
   cd infra/media-worker
   npx wrangler login
   npx wrangler kv namespace create MEDIA      # put the id it prints into wrangler.toml, replacing the one there
   npx wrangler secret put MEDIA_SECRET        # the same value as FERRI_MEDIA_SECRET
   npx wrangler deploy
   ```

4. Put your Worker's address (the one `wrangler deploy` prints, for example `https://<worker name>.<your subdomain>.workers.dev`) in `.env` as `FERRI_MEDIA_URL`.
5. Restart Ferri and Desk: `docker compose restart ferri desk`.

`./ferri doctor` checks the Buffer key and whether the media host is set. On real accounts, test with "Save as Buffer drafts" and a far-off date.
