# Unleashed shows: record, publish, watch

No live streaming. Shows are recorded in OBS on Jason's Mac, converted and uploaded to the
Cloudflare R2 bucket `unleashed-shows`, and watched on https://www.unleashed.news/shows/ with
no per-viewer cost (R2 charges nothing for downloads).

## Doing a show

1. Click **On Air** (the dock app). OBS opens with the studio banner and camera operator,
   and the record hook starts beside them.
2. In OBS click **Start Recording**. Do the show. Click **Stop Recording**.
3. That is all. The hook sees the recording stop and runs `publish-show.mjs` on it:
   1080p and 720p MP4s, a poster and a thumbnail go to the bucket, `shows.json` is
   updated, and a macOS notification says when the show is live. A one-hour show takes
   a few minutes to publish.

To publish with a title and blurb, or to schedule it, run the publisher by hand instead:

```
cd ~/Developer/unleashed.news/tools/shows
node publish-show.mjs "~/Movies/Unleashed Shows/Unleashed 2026-11-01 19-00.mp4" \
  --title "Who made Jeffrey Epstein?" --blurb "One line for the player." \
  --publish-at 2026-11-02T18:00:00-08:00
```

Running it again with the same `--id` (or the same recording) replaces that show.

## Pieces

- `publish-show.mjs` — the pipeline. Needs ffmpeg (Homebrew) and wrangler signed in as Jason
  (`npx wrangler whoami`); no API key is stored anywhere.
- `record-hook.mjs` — listens to OBS over obs-websocket for a stopped recording and publishes
  it; log at `~/Library/Logs/unleashed-record-hook.log`. Started by On Air
  (`theciaasset.com/tools/zoom/on-air.mjs`).
- `/shows/index.html` — the page: reads `shows.json` from the bucket, lists published shows
  newest first (a future `publishAt` stays hidden until then), plays in the site's own
  player with a 720p/1080p switch, remembers where each viewer left off.
- OBS recording settings (in the profile): HQ, Apple H.264, fragmented MP4 (survives a
  crash), into `~/Movies/Unleashed Shows`, named `Unleashed <date> <time>.mp4`.

## Bucket

`unleashed-shows` on the Cloudflare account, served at **https://videos.unleashed.news**
(custom domain, since the unleashed.news DNS moved to Cloudflare on 2026-10-26; full DDoS
protection and caching). The r2.dev development URL
`https://pub-374a6088117743c78a1a88282fea42de.r2.dev` still works as a fallback. The CORS
policy in `cors.json` allows the site's origins.

Layout in the bucket: `shows.json` at the root; `<id>/1080.mp4`, `<id>/720.mp4`,
`<id>/poster.jpg`, `<id>/thumb.jpg` per show. To remove a show: delete its folder with
`npx wrangler r2 object delete unleashed-shows/<id>/<file> --remote` for each file, and drop
it from `shows.json` (download with `npx wrangler r2 object get unleashed-shows/shows.json
--file shows.json --remote`, edit, put it back).
