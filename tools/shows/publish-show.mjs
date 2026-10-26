#!/usr/bin/env node
// Publishes a recorded show to unleashed.news.
//
//   node publish-show.mjs "<recording.mp4>" [--title "..."] [--blurb "..."] [--publish-at 2026-11-01T19:00:00-07:00] [--id slug]
//
// What it does: converts the OBS recording into two MP4 renditions (1080p and 720p, hardware
// H.264, fast-start so playback begins at once), cuts a poster and a thumbnail, uploads
// everything to the R2 bucket `unleashed-shows` under <id>/, and updates shows.json there, which
// the site's /shows page reads. Uploads go through wrangler, signed in as Jason (no key in this
// file). A future --publish-at keeps the show off the page until that moment.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const BUCKET = "unleashed-shows";
const PUBLIC = "https://pub-374a6088117743c78a1a88282fea42de.r2.dev";
const HERE = new URL(".", import.meta.url).pathname;
const WRANGLER = join(HERE, "node_modules", ".bin", "wrangler");

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith("--"));
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
if (!input || !existsSync(input)) { console.error("usage: node publish-show.mjs <recording.mp4> [--title ...] [--blurb ...] [--publish-at ISO] [--id slug]"); process.exit(2); }

const probe = JSON.parse(execFileSync("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", input]).toString());
const duration = Math.round(Number(probe.format.duration));
const video = probe.streams.find((s) => s.codec_type === "video");
const recordedAt = new Date(probe.format.tags?.creation_time || (basename(input).match(/(\d{4}-\d{2}-\d{2}) (\d{2})-(\d{2})/) ? basename(input).replace(/.*(\d{4}-\d{2}-\d{2}) (\d{2})-(\d{2}).*/, "$1T$2:$3:00") : Date.now()));
const id = opt("id", recordedAt.toISOString().slice(0, 16).replace(/[T:]/g, "-").replace(/-(\d{2})-(\d{2})$/, "-$1$2"));
const title = opt("title", `Unleashed — ${recordedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`);
const blurb = opt("blurb", "");
const publishAt = opt("publish-at", recordedAt.toISOString());

const work = mkdtempSync(join(tmpdir(), "unleashed-show-"));
const out = (n) => join(work, n);
const say = (s) => console.log(`\n== ${s}`);

say(`${title}  (${Math.floor(duration / 60)} min, ${video.width}x${video.height})  →  ${BUCKET}/${id}/`);

// 1. renditions. VideoToolbox H.264, fast-start, AAC 160 kbps. 1080p ≈ 5 Mbps, 720p ≈ 2.5 Mbps.
function encode(name, height, mbps) {
  say(`encoding ${name}`);
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-stats", "-y", "-i", input,
    "-vf", `scale=-2:${height}`, "-c:v", "h264_videotoolbox", "-b:v", `${mbps}M`, "-maxrate", `${mbps * 1.3}M`, "-bufsize", `${mbps * 2}M`,
    "-profile:v", "high", "-g", "60", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-ac", "2", "-movflags", "+faststart", out(name)], { stdio: "inherit" });
  if (r.status !== 0) { console.error(`ffmpeg failed on ${name}`); process.exit(1); }
}
encode("1080.mp4", 1080, 5);
encode("720.mp4", 720, 2.5);

// 2. poster (a frame 5% in, 1280 wide) and a small thumbnail
say("poster");
const at = Math.max(1, Math.round(duration * 0.05));
execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(at), "-i", input, "-frames:v", "1", "-vf", "scale=1280:-2", "-q:v", "3", out("poster.jpg")]);
execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(at), "-i", input, "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "4", out("thumb.jpg")]);

// 3. upload
function put(key, file, type) {
  const r = spawnSync(WRANGLER, ["r2", "object", "put", `${BUCKET}/${key}`, "--file", file, "--content-type", type, "--remote"], { stdio: ["ignore", "ignore", "inherit"] });
  if (r.status !== 0) { console.error(`upload failed: ${key}`); process.exit(1); }
  console.log(`  ↑ ${key}`);
}
say("uploading");
put(`${id}/1080.mp4`, out("1080.mp4"), "video/mp4");
put(`${id}/720.mp4`, out("720.mp4"), "video/mp4");
put(`${id}/poster.jpg`, out("poster.jpg"), "image/jpeg");
put(`${id}/thumb.jpg`, out("thumb.jpg"), "image/jpeg");

// 4. shows.json: fetch the current one, add or replace this show, newest first, upload
say("shows.json");
let shows = [];
try { const r = await fetch(`${PUBLIC}/shows.json`, { cache: "no-store" }); if (r.ok) shows = (await r.json()).shows || []; } catch {}
shows = shows.filter((s) => s.id !== id);
shows.push({ id, title, blurb, recordedAt: recordedAt.toISOString(), publishAt, duration,
  poster: `${PUBLIC}/${id}/poster.jpg`, thumb: `${PUBLIC}/${id}/thumb.jpg`,
  sources: { "1080": `${PUBLIC}/${id}/1080.mp4`, "720": `${PUBLIC}/${id}/720.mp4` } });
shows.sort((a, b) => (a.publishAt < b.publishAt ? 1 : -1));
writeFileSync(out("shows.json"), JSON.stringify({ updated: new Date().toISOString(), shows }, null, 2));
put("shows.json", out("shows.json"), "application/json");

rmSync(work, { recursive: true, force: true });
say(`published: https://www.unleashed.news/shows/#${id}${publishAt > new Date().toISOString() ? `  (goes live ${publishAt})` : ""}`);
