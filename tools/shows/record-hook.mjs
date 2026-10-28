// Runs beside OBS (started by On Air). When a recording stops, it publishes the show to
// unleashed.news automatically with publish-show.mjs and posts a macOS notification when
// the show is up. Jason's only job: Start Recording, do the show, Stop Recording.
import { readFileSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { spawn, execFile } from "node:child_process";
import { createServer } from "node:http";
import { join } from "node:path";

const HOME = homedir();
const LOG = `${HOME}/Library/Logs/unleashed-record-hook.log`;
const HERE = new URL(".", import.meta.url).pathname;
const log = (s) => { try { appendFileSync(LOG, `${new Date().toISOString()} ${s}\n`); } catch {} };
// When the recording began, and how many seconds in the rolling credits started (the studio page tells us, below),
// so the replay can offer "Skip to the next show" from that moment (Jason, 2026-10-28).
let recordingSince = 0, creditsAt = null;
const notify = (title, text) => execFile("osascript", ["-e", `display notification ${JSON.stringify(text)} with title ${JSON.stringify(title)}`]);

const cfg = JSON.parse(readFileSync(`${HOME}/Library/Application Support/obs-studio/plugin_config/obs-websocket/config.json`, "utf8"));
const sha = (s) => createHash("sha256").update(s).digest("base64");
const ws = new WebSocket(`ws://127.0.0.1:${cfg.server_port}`);
ws.onerror = () => {};
ws.onclose = () => { log("OBS gone, hook off"); process.exit(0); };
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.op === 0) {
    const a = m.d.authentication;
    ws.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, eventSubscriptions: 64, authentication: a ? sha(sha(cfg.server_password + a.salt) + a.challenge) : undefined } }));   // 64 = Outputs events
  } else if (m.op === 2) { log("record hook on"); }
  else if (m.op === 5 && m.d.eventType === "RecordStateChanged" && m.d.eventData.outputState === "OBS_WEBSOCKET_OUTPUT_STARTED") { recordingSince = Date.now(); creditsAt = null; log("recording started"); }
  else if (m.op === 5 && m.d.eventType === "RecordStateChanged" && m.d.eventData.outputState === "OBS_WEBSOCKET_OUTPUT_STOPPED" && m.d.eventData.outputPath) {
    const file = m.d.eventData.outputPath;
    log(`recording stopped: ${file} — publishing${creditsAt != null ? ` (credits at ${creditsAt} s)` : ""}`);
    notify("Unleashed", "Recording saved. Publishing the show to unleashed.news…");
    const args = [join(HERE, "publish-show.mjs"), file]; if (creditsAt != null) args.push("--credits-at", String(creditsAt));
    recordingSince = 0; creditsAt = null;
    const p = spawn(process.execPath, args, { cwd: HERE, stdio: ["ignore", "pipe", "pipe"] });
    let tail = "";
    p.stdout.on("data", (d) => { tail = (tail + d).slice(-400); });
    p.stderr.on("data", (d) => { tail = (tail + d).slice(-400); });
    p.on("exit", (code) => {
      log(`publish exit ${code}: ${tail.replace(/\s+/g, " ").trim().slice(-200)}`);
      if (code === 0) notify("Unleashed", "The show is live on unleashed.news/shows");
      else notify("Unleashed", "Publishing failed — see ~/Library/Logs/unleashed-record-hook.log");
    });
  }
};

// The studio page (studio.unleashed.news) posts here the moment the rolling credits begin; while a recording is running,
// that moment is kept as seconds into the recording and written into the show's entry as creditsAt.
createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "POST" && req.url === "/credits") {
    if (recordingSince) { creditsAt = Math.max(0, Math.round((Date.now() - recordingSince) / 1000)); log(`credits began at ${creditsAt} s`); }
    else log("credits began, but no recording is running");
    res.end("ok"); return;
  }
  res.end("unleashed record hook");
}).listen(48611, "127.0.0.1");
