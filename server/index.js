// LAN server: one process = one table. Serves the browser client and keeps the
// authoritative game state. Every connected browser gets its own filtered view
// (other players' dials stay secret) after every change.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import * as E from "../shared/engine.js";
import { FACTIONS, validateArmy } from "../shared/factions.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".md": "text/markdown" };

let game = E.createGame();

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

function saveArmy(author, { id, name, faction, list }) {
  if (!FACTIONS[faction]) throw new Error("Unknown faction.");
  const title = String(name || "").trim().slice(0, 40);
  if (!title) throw new Error("Give the army a name.");
  // Structure only: a saved list may be built for any budget.
  const v = validateArmy(faction, list, Infinity);
  if (!v.ok) throw new Error(v.errors.join(" "));
  const entry = { id: id || `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: title, faction, list: list.map((e) => ({ unit: e.unit, upgrade: e.upgrade || null })), cost: v.cost, author, savedAt: new Date().toISOString() };
  const i = armies.findIndex((a) => a.id === entry.id);
  if (i >= 0) armies[i] = entry;
  else armies.push(entry);
  return persistArmies();
}
const sockets = new Map(); // ws -> { token, spectator }

const http = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
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

const wss = new WebSocketServer({ server: http });

function broadcast() {
  const online = new Set([...sockets.values()].map((s) => s.token));
  for (const [ws, info] of sockets) {
    const view = E.viewFor(game, info.spectator ? null : info.token);
    for (const p of view.players) p.connected = online.has(p.id);
    view.spectator = info.spectator || !E.player(game, info.token);
    view.armies = armies;
    ws.send(JSON.stringify({ t: "state", state: view }));
  }
}

function handle(ws, info, m) {
  const pid = info.token;
  switch (m.t) {
    case "hello":
      info.token = String(m.token || "").slice(0, 64);
      info.spectator = !!m.spectate;
      if (!info.spectator && !E.player(game, info.token) && game.phase === "muster") E.addPlayer(game, info.token, m.name);
      if (E.player(game, info.token) && m.name) E.player(game, info.token).name = String(m.name).slice(0, 24);
      break;
    case "faction": E.setFaction(game, pid, m.faction); break;
    case "settings": E.setSettings(game, pid, m); break;
    case "army": E.submitArmy(game, pid, m.list); E.ready(game, pid); break;
    case "ready": E.ready(game, pid); break;
    case "unready": E.unready(game, pid); break;
    case "deploy": E.deployUnit(game, pid, m.uid, m.x, m.y, m.h); break;
    case "dial": E.setDial(game, pid, m.uid, m.code); break;
    case "act": E.act(game, pid, m); break;
    case "pass": E.pass(game, pid); break;
    case "attack": E.declareAttack(game, pid, m); break;
    case "mod": E.modify(game, pid, m); break;
    case "leave": E.removePlayer(game, pid); break;
    case "saveArmy": return saveArmy(E.player(game, pid)?.name || "Unknown", m);
    case "deleteArmy": armies = armies.filter((a) => a.id !== m.id); return persistArmies();
    case "reset": {
      if (game.players[0]?.id !== pid && game.phase !== "over") throw new Error("Only the host can restart mid-battle.");
      const old = game;
      game = E.createGame(old.settings);
      for (const p of old.players) {
        E.addPlayer(game, p.id, p.name);
        if (p.faction) E.setFaction(game, p.id, p.faction);
      }
      break;
    }
    default:
      throw new Error(`Unknown message ${m.t}`);
  }
  E.run(game);
}

wss.on("connection", (ws) => {
  const info = { token: null, spectator: true };
  sockets.set(ws, info);
  ws.on("message", async (raw) => {
    try {
      await handle(ws, info, JSON.parse(raw));
    } catch (err) {
      ws.send(JSON.stringify({ t: "error", msg: err.message }));
    }
    broadcast();
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
