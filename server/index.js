// LAN server: one process = one table. Serves the browser client and keeps the
// authoritative game state. Every connected browser gets its own filtered view
// (other players' dials stay secret) after every change.
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import * as E from "../shared/engine.js";
import { AI_NAMES, aiStep } from "../shared/ai.js";
import { FACTIONS, validateArmy } from "../shared/factions.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".md": "text/markdown" };

let game = E.createGame();

// ── Stale code check ─────────────────────────────────────────────────────────
// The browser reloads the newest files from disk, but the rules this process
// runs were loaded at start-up. When server or shared code changes on disk,
// every screen is told to restart the game server instead of failing oddly.
const CODE_DIRS = ["server", "shared", "shared/rosters", "shared/presets"];
async function codeStamp() {
  let newest = 0;
  for (const d of CODE_DIRS) {
    for (const f of await readdir(join(ROOT, d)).catch(() => [])) {
      if (f.endsWith(".js")) newest = Math.max(newest, (await stat(join(ROOT, d, f))).mtimeMs);
    }
  }
  return newest;
}
const BOOT_STAMP = await codeStamp();
let stale = false;
// Page files are re-read from disk on every request, so open tabs just need a reload to
// pick them up. The build stamp changes when the page files change or the server restarts.
async function pageStamp() {
  let newest = 0;
  for (const f of await readdir(join(ROOT, "public")).catch(() => [])) {
    if (/\.(js|css|html)$/.test(f)) newest = Math.max(newest, (await stat(join(ROOT, "public", f))).mtimeMs);
  }
  return newest;
}
let build = `${Date.now()}:${await pageStamp()}`;
setInterval(async () => {
  const page = await pageStamp().catch(() => 0);
  const next = `${build.split(":")[0]}:${page}`;
  const nowStale = stale || (await codeStamp().catch(() => 0)) > BOOT_STAMP;
  if (next !== build || nowStale !== stale) {
    build = next;
    stale = nowStale;
    broadcast();
  }
}, 10000).unref();

/** The host is the first human in a seat: computer opponents never host. */
const hostId = () => game.players.find((p) => !p.ai)?.id ?? null;
// Started from Start Game, exit code 75 asks that window to start a fresh server.
const SUPERVISED = process.env.DOW_SUPERVISED === "1";
const STALE_HINT = SUPERVISED
  ? "The game server is running older code. Press Restart now in the banner to load the latest rules."
  : "The game server is running older code. Stop it and open Start Game again to load the latest rules.";

// ── Saved armies (persist across battles and restarts, shared by the table) ──
const DATA = join(ROOT, "data");
const ARMIES = join(DATA, "armies.json");
let armies = [];
try {
  armies = JSON.parse(await readFile(ARMIES, "utf8"));
} catch {
  armies = [];
}
async function persistArmies() {
  await mkdir(DATA, { recursive: true });
  await writeFile(ARMIES, JSON.stringify(armies, null, 2));
}

const MAX_ARMIES = 300;
const MAX_ARMIES_EACH = 40;

function saveArmy(owner, author, { id, name, faction, list }) {
  if (!owner) throw new Error("Take a seat to save armies.");
  if (!FACTIONS[faction]) throw new Error("Unknown faction.");
  if (!Array.isArray(list) || list.length > 20) throw new Error("Bad army list.");
  const title = String(name || "").trim().slice(0, 40);
  if (!title) throw new Error("Give the army a name.");
  // Structure only: a saved list may be built for any budget.
  const v = validateArmy(faction, list, Infinity);
  if (!v.ok) throw new Error(v.errors.join(" "));
  // Ids are always server-made; a client id only selects one of its own armies to update.
  const existing = armies.findIndex((a) => a.id === id && a.owner === owner);
  if (existing < 0 && (armies.length >= MAX_ARMIES || armies.filter((a) => a.owner === owner).length >= MAX_ARMIES_EACH)) throw new Error("Too many saved armies; delete some first.");
  const entry = {
    id: existing >= 0 ? armies[existing].id : `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    name: title, faction, list: list.map((e) => ({ unit: String(e.unit), upgrade: e.upgrade ? String(e.upgrade) : null })),
    cost: v.cost, author: String(author).slice(0, 24), owner, savedAt: new Date().toISOString(),
  };
  if (existing >= 0) armies[existing] = entry;
  else armies.push(entry);
  return persistArmies();
}

function deleteArmy(pid, id) {
  const a = armies.find((x) => x.id === id);
  if (!a) return;
  if (a.owner !== pid && hostId() !== pid) throw new Error("Only the army's author or the host can delete it.");
  armies = armies.filter((x) => x.id !== id);
  return persistArmies();
}

// Saved armies as a viewer sees them: owner tokens stay on the server.
const publicArmies = (pid) => armies.map(({ owner, ...a }) => ({ ...a, mine: !!pid && owner === pid }));
const sockets = new Map(); // ws -> { token, spectator }

const http = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/api/art-upload" && req.method === "POST") {
    // Art handoff from a browser on THIS computer only (the ChatGPT art pipeline).
    // Files land in Art/ and are installed by scripts/install-art.mjs.
    const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
    const origin = req.headers.origin;
    const okOrigin = !origin || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    // The custom header forces a CORS preflight, which this server never answers,
    // so other web pages open in the host's browser cannot post here.
    if (!local || !okOrigin || req.headers["x-dow-art"] !== "1") return res.writeHead(403).end("local art pipeline only");
    if (Number(req.headers["content-length"] || 0) > 8e6) return res.writeHead(413).end("too large");
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 8e6) return res.writeHead(413).end("too large");
    }
    try {
      const { name, data } = JSON.parse(body);
      if (!/^dow-art__[a-z]+(__[A-Za-z0-9-]+)*\.(png|jpg)$/.test(name)) throw new Error("bad name");
      await mkdir(join(ROOT, "Art"), { recursive: true });
      await writeFile(join(ROOT, "Art", name), Buffer.from(String(data).replace(/^data:[^,]+,/, ""), "base64"));
      res.writeHead(200, { "content-type": "text/plain" });
      return res.end("ok");
    } catch (err) {
      return res.writeHead(400).end(err.message);
    }
  }
  if (url.pathname === "/art-index.json") {
    // Which painted art files exist, so clients never request missing ones.
    const files = await readdir(join(ROOT, "public/art"), { recursive: true }).catch(() => []);
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    return res.end(JSON.stringify(files.filter((f) => /\.(png|jpe?g|webp)$/.test(f)).map((f) => f.split("\\").join("/"))));
  }
  let path = url.pathname === "/" ? "/index.html" : url.pathname;
  if (!path.startsWith("/shared/") && !path.startsWith("/docs/")) path = `/public${path}`;
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

// Same-origin browsers only (stops other web pages from driving the game), small frames.
const wss = new WebSocketServer({
  server: http,
  maxPayload: 64 * 1024,
  verifyClient: ({ req }) => {
    const origin = req.headers.origin;
    if (!origin) return true; // non-browser clients (tests, bots)
    try {
      return new URL(origin).host === req.headers.host;
    } catch {
      return false;
    }
  },
});

function broadcast() {
  const online = new Set([...sockets.values()].map((s) => s.token));
  // Views carry public seat ids, so map connection status by seat (computer seats are always here).
  const here = new Set(game.players.filter((p) => p.ai || online.has(p.id)).map((p) => `p${p.seat}`));
  for (const [ws, info] of sockets) {
    const view = E.viewFor(game, info.spectator ? null : info.token);
    for (const p of view.players) p.connected = here.has(p.id);
    view.spectator = info.spectator || !E.player(game, info.token);
    view.armies = publicArmies(info.spectator ? null : info.token);
    view.serverStale = stale;
    view.build = build;
    view.host = E.player(game, hostId()) ? `p${E.player(game, hostId()).seat}` : null;
    view.canRestart = SUPERVISED;
    ws.send(JSON.stringify({ t: "state", state: view }));
  }
}

function handle(ws, info, m) {
  const pid = info.token;
  switch (m.t) {
    case "hello":
      if (typeof m.token !== "string" || !/^[A-Za-z0-9]{8,64}$/.test(m.token)) throw new Error("Bad session token; reload the page.");
      info.token = m.token;
      info.spectator = !!m.spectate;
      if (!info.spectator && !E.player(game, info.token) && game.phase === "muster") {
        E.addPlayer(game, info.token, m.name);
        game.hold = false; // a human is seated again: they decide when to start
      }
      if (E.player(game, info.token) && m.name) E.player(game, info.token).name = String(m.name).slice(0, 24);
      break;
    case "faction": E.setFaction(game, pid, m.faction); break;
    case "settings": E.setSettings(game, pid, m); break;
    case "army": E.submitArmy(game, pid, m.list); E.ready(game, pid); break;
    case "ready": E.ready(game, pid); break;
    case "unready": E.unready(game, pid); break;
    case "deploy": E.deployUnit(game, pid, m.uid, m.x, m.y, m.h); break;
    case "dial": E.setDial(game, pid, m.uid, m.code); break;
    case "dials": E.setDials(game, pid, m.dials); break;
    case "act": E.act(game, pid, m); break;
    case "pass": E.pass(game, pid); break;
    case "attack": E.declareAttack(game, pid, m); break;
    case "mod": E.modify(game, pid, m); break;
    case "leave": E.removePlayer(game, pid); break;
    case "surrender": E.surrender(game, pid); break;
    case "restart": {
      if (!SUPERVISED || !stale) throw new Error("The server can only restart itself when it is out of date.");
      if (!E.player(game, pid)) throw new Error("Only seated players can restart the server.");
      console.log("Restart requested from the game: loading the latest rules.");
      setTimeout(() => process.exit(75), 300); // let this reply and the broadcast go out first
      return;
    }
    case "addAI": addAI(pid, m.faction); break;
    case "removeAI": removeAI(pid, m.seat); break;
    case "saveArmy": return saveArmy(E.player(game, pid) ? pid : null, E.player(game, pid)?.name || "Unknown", m);
    case "deleteArmy": return deleteArmy(pid, m.id);
    case "startWatch": {
      if (game.phase !== "muster" || game.players.some((p) => !p.ai)) throw new Error("Only a computer-only table can be started from the watching screen.");
      game.hold = false;
      break;
    }
    case "sitOut": {
      // Give up the seat before the battle and watch instead (computer opponents and settings stay).
      if (game.phase !== "muster") throw new Error("You can only step out of your seat before the battle starts.");
      E.removePlayer(game, pid);
      info.spectator = true;
      break;
    }
    case "reset": {
      const host = hostId() === pid;
      const noHumans = !game.players.some((p) => !p.ai); // a computer-only battle: any watcher may end it
      if (!host && !noHumans && !(game.phase === "over" && E.player(game, pid))) throw new Error("Only the host can restart mid-battle.");
      const old = game;
      game = E.createGame(old.settings);
      game.hold = noHumans; // don't let a computer-only table start straight back up
      for (const p of old.players) {
        const np = E.addPlayer(game, p.id, p.name);
        np.ai = !!p.ai;
        // A new battle is a blank slate for people; computer opponents keep the army they were given.
        if (p.faction && p.ai) E.setFaction(game, p.id, p.faction);
      }
      break;
    }
    default:
      throw new Error(`Unknown message ${m.t}`);
  }
  E.run(game);
}

// ── Computer opponents: one decision per tick so their moves can be watched ──
let aiTimer = null;
function scheduleAI(delay = 400) {
  clearTimeout(aiTimer);
  aiTimer = setTimeout(aiTick, delay);
}
function aiTick() {
  for (const p of game.players.filter((x) => x.ai)) {
    let acted = false;
    try {
      acted = aiStep(game, p.id);
    } catch (err) {
      // Never let a bad decision stall the table: give up this choice instead.
      console.error(`AI ${p.name}:`, err.message);
      if (game.pending?.pid === p.id) {
        try { E.pass(game, p.id); acted = true; } catch { /* nothing to pass */ }
      }
    }
    if (acted) {
      E.run(game);
      broadcast();
      return scheduleAI(game.pending?.type === "action" || game.pending?.type === "attack" ? 600 : 350);
    }
  }
}

function addAI(pid, faction) {
  if (hostId() !== pid) throw new Error("Only the host can add computer opponents.");
  if (game.phase !== "muster") throw new Error("Add computer opponents before the battle starts.");
  const id = `ai${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const fid = Object.hasOwn(AI_NAMES, faction) ? faction : Object.keys(AI_NAMES)[Math.floor(Math.random() * 6)];
  const p = E.addPlayer(game, id, AI_NAMES[fid]);
  p.ai = true;
  E.setFaction(game, id, fid);
}

function removeAI(pid, seatId) {
  if (hostId() !== pid) throw new Error("Only the host can remove computer opponents.");
  const p = game.players.find((x) => x.ai && `p${x.seat}` === seatId);
  if (p) E.removePlayer(game, p.id);
}

wss.on("connection", (ws) => {
  const info = { token: null, spectator: true, bucket: 40, last: Date.now() };
  sockets.set(ws, info);
  ws.on("message", async (raw) => {
    // Rate limit: 40-message burst, refilling at 20 per second.
    const now = Date.now();
    info.bucket = Math.min(40, info.bucket + ((now - info.last) / 1000) * 20);
    info.last = now;
    if (info.bucket < 1) return ws.send(JSON.stringify({ t: "error", msg: "Slow down a little." }));
    info.bucket -= 1;
    try {
      await handle(ws, info, JSON.parse(raw));
    } catch (err) {
      ws.send(JSON.stringify({ t: "error", msg: stale ? `${err.message} ${STALE_HINT}` : err.message }));
    }
    broadcast();
    scheduleAI();
  });
  ws.on("close", () => {
    sockets.delete(ws);
    broadcast();
  });
});

http.listen(PORT, "0.0.0.0", () => {
  const ips = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
  console.log("Drums of War: Warbands is running.");
  console.log(`  This computer:   http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  Same Wi-Fi:      http://${ip}:${PORT}`);
  console.log("Everyone at the table opens the Same Wi-Fi address in a browser.");
});
