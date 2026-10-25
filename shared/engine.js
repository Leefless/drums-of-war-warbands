// Drums of War: Warbands rules engine. The server owns one state object and
// mutates it only through the exported commands; every command validates and
// throws an Error with a player-facing message when illegal. After each command
// the server calls run(), which advances the game until it needs a player.
//
// Round structure (X-Wing style):
//   plan        every player secretly sets a maneuver for each unit (simultaneous)
//   activation  lowest initiative first: reveal, move, then take actions
//   engagement  highest initiative first: attack; units at the same initiative fire simultaneously
//   end         tokens clear, regeneration, victory check

import {
  BASE_SIZE, BOARD, boardSize, corners, inArc, insideBoard, isAim, isHold, isStance, maneuverPose, maneuverSegments, parseManeuver, polyCircleOverlap,
  polyDistance, polysOverlap, rangeBand, right, zoneDepth,
} from "./geometry.js";
import { AIM_ROW, STANCE_ROW } from "./dials.js";
import { MAPS, mapEffect, matchupDice } from "./battlefield.js";
import { applyItem, itemById, itemCost } from "./items.js";
import { FACTION_TAGS, FACTIONS, UPGRADES, unitDef, validateArmy } from "./factions.js";
import { COVER, RADIUS, SLOW_DEPTH, hazeBetween, inside, layTerrain, lineOfSight, onKind, terrainCount, touches, visibleTo } from "./terrain.js";

export const MAX_PLAYERS = 4;
export const ATTACK_FACES = ["strike", "strike", "strike", "rend", "omen", "omen", "blank", "blank"];
export const DEFENSE_FACES = ["parry", "parry", "parry", "omen", "omen", "blank", "blank", "blank"];
export const CRITS = ["shaken", "bleeding", "staggered", "broken"];
export const CRIT_TEXT = {
  shaken: "Shaken: gains 1 strain.",
  bleeding: "Bleeding: suffers 1 damage in the End phase.",
  staggered: "Staggered: cannot take actions during its next activation.",
  broken: "Broken Arms: rolls 1 fewer attack die for the rest of the battle.",
};
export const OBSTACLE_KINDS = ["hill", "thicket", "ruins", "lava", "marsh", "rift", "block"];

// ── State ────────────────────────────────────────────────────────────────────
export const AI_SPEEDS = ["fast", "normal", "slow"];

export function createGame({ budget = 100, maxRounds = 12, seed = Date.now(), aiSpeed = "normal", pauseAttacks = false } = {}) {
  return {
    board: boardSize(budget),
    phase: "muster",
    round: 0,
    settings: { budget, maxRounds, aiSpeed, pauseAttacks },
    players: [],
    units: [],
    obstacles: [],
    dials: {},
    queue: [],
    group: null,
    pending: null,
    attack: null,
    lastAttack: null,
    beat: null, // a pause after an attack so every screen can follow it (see clearBeat)
    firstSeat: 0,
    nextUid: 1,
    rng: seed >>> 0 || 1,
    log: [],
    winner: null,
  };
}

function rand(state) {
  // mulberry32, stored on the state so games are replayable in tests
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const roll = (state, faces) => faces[Math.floor(rand(state) * faces.length)];

function log(state, msg) {
  // Record which units a line mentions, so fog of war can scrub it per viewer.
  const named = state.units.filter((u) => msg.includes(u.name));
  const refs = named.map((u) => u.id);
  // The acting unit is the one the line starts with (for colouring the line by army).
  const actor = named.filter((u) => msg.startsWith(u.name)).sort((a, b) => b.name.length - a.name.length)[0];
  state.log.push({ round: state.round, phase: state.phase, msg, refs, who: actor?.owner ?? null });
  if (state.log.length > 300) state.log.shift();
}

const fail = (msg) => {
  throw new Error(msg);
};
export const player = (state, pid) => state.players.find((p) => p.id === pid);
export const unit = (state, uid) => state.units.find((u) => u.id === uid);
const alive = (state) => state.units.filter((u) => !u.dead);
const has = (u, ab) => u.abilities.includes(ab);
const rule = (u, r) => FACTIONS[u.faction].rules.includes(r);
const sizeOf = (u) => BASE_SIZE[u.base];
export const poly = (u) => corners(u, sizeOf(u));
export const strainCap = (u) => (rule(u, "mob") ? 2 : 1);
export const strained = (u) => u.strain >= strainCap(u);
const deathless = (u) => rule(u, "deathless");
const ignoresObstacles = (u) => has(u, "ethereal") || has(u, "flying");

/** Range band between two units' bases (1 when touching). */
export function rangeBetween(a, b) {
  return rangeBand(polyDistance(poly(a), poly(b)));
}

// ── Muster ───────────────────────────────────────────────────────────────────
export function addPlayer(state, pid, name) {
  if (player(state, pid)) return player(state, pid);
  if (state.phase !== "muster") fail("The battle has already started. You can watch as a spectator.");
  if (state.players.length >= MAX_PLAYERS) fail("The table is full (4 players).");
  const used = new Set(state.players.map((p) => p.seat));
  const seat = [0, 1, 2, 3].find((s) => !used.has(s));
  const p = { id: pid, name: String(name || "Warlord").slice(0, 24), seat, faction: null, army: [], ready: false, eliminated: false, vp: 0 };
  state.players.push(p);
  state.players.sort((a, b) => a.seat - b.seat);
  log(state, `${p.name} takes a seat at the table.`);
  return p;
}

export function removePlayer(state, pid) {
  if (state.phase !== "muster") return;
  state.players = state.players.filter((p) => p.id !== pid);
}

export function setSettings(state, pid, msg) {
  const { budget, maxRounds, aiSpeed, pauseAttacks } = msg && typeof msg === "object" ? msg : {};
  if (state.phase !== "muster") fail("Settings are locked once deployment begins.");
  if (state.players.find((p) => !p.ai)?.id !== pid) fail("Only the host (the first player seated) can change settings.");
  if (budget != null) {
    state.settings.budget = Math.max(40, Math.min(300, Number(budget) || 100));
    state.board = boardSize(state.settings.budget);
  }
  if (maxRounds != null) state.settings.maxRounds = Math.max(3, Math.min(20, Number(maxRounds) || 12));
  if (aiSpeed != null && AI_SPEEDS.includes(aiSpeed)) state.settings.aiSpeed = aiSpeed;
  if (pauseAttacks != null) state.settings.pauseAttacks = !!pauseAttacks;
  // Speed and pausing only change pacing; the army limits do, so only those unready everyone.
  if (budget != null || maxRounds != null) for (const p of state.players) p.ready = false;
}

export function setFaction(state, pid, faction) {
  const p = player(state, pid) || fail("Join the table first.");
  if (state.phase !== "muster") fail("Factions are locked.");
  if (typeof faction !== "string" || !Object.hasOwn(FACTIONS, faction)) fail("Unknown faction.");
  p.faction = faction;
  p.army = [];
  p.ready = false;
}

export function submitArmy(state, pid, list, buys = []) {
  const p = player(state, pid) || fail("Join the table first.");
  if (state.phase !== "muster") fail("Muster is over.");
  const v = validateArmy(p.faction, list, state.settings.budget, buys);
  if (!v.ok) fail(v.errors.join(" "));
  p.army = list.map((e) => ({ unit: e.unit, upgrade: e.upgrade || null, item: e.item || null }));
  p.buys = Array.isArray(buys) ? [...buys] : [];
  p.spent = v.cost;
  p.ready = true;
  log(state, `${p.name} musters ${FACTIONS[p.faction].name} (${v.cost} DP).`);
}

export function unready(state, pid) {
  const p = player(state, pid) || fail("Join the table first.");
  if (state.phase === "muster" || state.phase === "deploy" || state.phase === "plan") p.ready = false;
}

// ── Deployment ───────────────────────────────────────────────────────────────
export function zoneFor(seat, size = BOARD) {
  const D = zoneDepth(size); // deep enough for two ranks of large bases (more on bigger boards)
  const lo = 110;
  const hi = size - 110;
  return [
    { x0: lo, x1: hi, y0: size - D, y1: size, h: 0, edge: "south" },
    { x0: lo, x1: hi, y0: 0, y1: D, h: 180, edge: "north" },
    { x0: 0, x1: D, y0: lo, y1: hi, h: 90, edge: "west" },
    { x0: size - D, x1: size, y0: lo, y1: hi, h: 270, edge: "east" },
  ][seat];
}

function inZone(u, z) {
  return poly(u).every((v) => v.x >= z.x0 && v.x <= z.x1 && v.y >= z.y0 && v.y <= z.y1);
}

function buildUnit(state, p, entry) {
  const u = baseUnit(state, p, entry);
  const it = entry.item ? itemById(p.faction, entry.item) : null;
  if (!it) return u;
  // A magic item changes the profile (shared/items.js) and adds its price.
  const x = applyItem(u, it);
  return {
    ...u, item: it.id, cost: u.cost + itemCost(p.faction, it, u.type),
    init: x.init, def: x.def, wounds: x.wounds, maxWounds: x.wounds, ward: x.ward, maxWard: x.ward,
    weapons: x.weapons, abilities: x.abilities, actions: x.actions,
    // An item that gives a weapon range 2 or more brings the Aim row with it.
    dial: !u.dial.includes(AIM_ROW[0]) && x.weapons.some((w) => w.range[1] >= 2) ? [...u.dial, ...AIM_ROW] : u.dial,
  };
}

function baseUnit(state, p, entry) {
  const d = unitDef(p.faction, entry.unit);
  const g = entry.upgrade ? UPGRADES[entry.upgrade] : null;
  const abilities = [...d.abilities];
  if (g?.ability && !abilities.includes(g.ability)) abilities.push(g.ability);
  const actions = [...d.actions];
  if (g?.addAction) actions.push(g.addAction);
  const wounds = d.wounds + (g?.mod?.wounds || 0);
  const ward = d.ward + (g?.mod?.ward || 0);
  return {
    id: `u${state.nextUid++}`,
    owner: p.id,
    faction: p.faction,
    type: d.id,
    name: d.name,
    icon: d.icon,
    champion: !!d.champion,
    upgrade: g?.id || null,
    cost: d.cost + (g?.cost || 0),
    base: d.base,
    init: Math.min(6, d.init + (g?.mod?.init || 0)),
    weapons: d.weapons.map((w) => ({ ...w })),
    def: d.def,
    wounds,
    maxWounds: wounds,
    ward,
    maxWard: ward,
    actions,
    abilities,
    dial: [...d.dial, ...STANCE_ROW, ...(d.weapons.some((w) => w.range[1] >= 2) ? AIM_ROW : [])],
    tags: FACTION_TAGS[p.faction] || [],
    x: 0, y: 0, h: 0,
    strain: 0,
    stance: 0,
    aim: 0,
    tokens: { steel: 0, guard: 0, brace: 0, frenzy: 0, charge: 0, mark: null },
    cond: {},
    souls: abilities.includes("phylactery") && abilities.includes("raise") ? 2 : 0,
    dead: false,
    dying: false,
    revealed: null,
    trail: null,
  };
}

/** Lay the random terrain for the chosen battlefield around any pieces players have already placed. */
function placeObstacles(state) {
  const bought = state.obstacles.filter((o) => o.owner);
  const buys = state.players.reduce((a, p) => a + (p.buys?.length || 0), 0);
  const count = Math.max(4, terrainCount(state.board) - Math.ceil(buys * 1.5)); // bought pieces replace scenery
  const laid = layTerrain(() => rand(state), state.board, { weights: MAPS[state.map]?.weights, count, avoid: bought });
  state.obstacles = [...laid, ...bought];
}

/** The battlefield is settled when the battle starts: lock it in and apply its initiative effects. */
function applyBattlefield(state) {
  state.mapChosen = true;
  for (const u of state.units) {
    const e = mapEffect(state.map, u.faction);
    if (e?.init) u.init = Math.max(1, Math.min(6, u.init + e.init));
  }
  const m = MAPS[state.map];
  if (m) log(state, `The battle is fought on ${m.name}.`);
}

/** The chooser picks the battlefield during deployment (once); random terrain is re-laid for it. */
export function chooseMap(state, pid, mapId) {
  if (state.phase !== "deploy") fail("The battlefield is chosen during deployment.");
  if (state.mapChooser !== pid) fail("Only the player with the most DP in reserve chooses the battlefield.");
  if (state.mapChosen) fail("The battlefield is already chosen.");
  if (!Object.hasOwn(MAPS, mapId)) fail("Unknown battlefield.");
  state.map = mapId;
  state.mapChosen = true;
  placeObstacles(state);
  // Units stand in their zones, which terrain never enters, so nothing needs to move.
  log(state, `${player(state, pid).name} chooses ${MAPS[mapId].name}.`);
}

/** Where a bought piece may go: on the board, clear of every deployment zone and of other terrain. */
export function terrainSpotOk(state, o) {
  if (o.x < o.r || o.y < o.r || o.x > state.board - o.r || o.y > state.board - o.r) return false;
  // Clear of the deployment zones actually in use (a two-player battle leaves both flanks open).
  for (const p of state.players) {
    const z = zoneFor(p.seat, state.board);
    const nx = Math.max(z.x0, Math.min(z.x1, o.x));
    const ny = Math.max(z.y0, Math.min(z.y1, o.y));
    if (Math.hypot(o.x - nx, o.y - ny) < o.r + 5) return false;
  }
  return state.obstacles.every((q) => q.id === o.id || Math.hypot(q.x - o.x, q.y - o.y) > q.r + o.r + 10);
}
export const boughtRadius = (kind) => Math.round((RADIUS[kind][0] + RADIUS[kind][1]) / 2);

/** Place one bought terrain piece during deployment. */
export function placeTerrain(state, pid, msg) {
  if (state.phase !== "deploy") fail("Terrain is placed during deployment.");
  const p = player(state, pid) || fail("Join the table first.");
  const kind = msg?.kind;
  const i = (p.toPlace || []).indexOf(kind);
  if (i < 0) fail("You have no such terrain piece left to place.");
  const o = { id: `b${state.nextUid++}`, kind, r: boughtRadius(kind), x: Number(msg.x), y: Number(msg.y), owner: pid };
  if (!Number.isFinite(o.x) || !Number.isFinite(o.y) || !terrainSpotOk(state, o)) fail("Terrain must go outside every deployment zone and clear of other terrain.");
  state.obstacles.push(o);
  p.toPlace.splice(i, 1);
  p.ready = false;
}

/** Pick a placed bought piece back up to move it. */
export function pickUpTerrain(state, pid, oid) {
  if (state.phase !== "deploy") fail("Terrain is placed during deployment.");
  const p = player(state, pid) || fail("Join the table first.");
  const o = state.obstacles.find((x) => x.id === oid && x.owner === pid);
  if (!o) fail("That is not your terrain piece.");
  state.obstacles = state.obstacles.filter((x) => x !== o);
  p.toPlace.push(o.kind);
  p.ready = false;
}

/** Put any pieces a player has not placed somewhere legal, leaning toward their own side. */
function autoPlaceTerrain(state, p) {
  const z = zoneFor(p.seat, state.board);
  const home = { x: (z.x0 + z.x1) / 2, y: (z.y0 + z.y1) / 2 };
  const mid = state.board / 2;
  for (const kind of [...(p.toPlace || [])]) {
    const r = boughtRadius(kind);
    // Sample the whole board; of the legal spots, prefer ones between home and the centre.
    let spot = null;
    let best = Infinity;
    for (let t = 0; t < 600; t++) {
      const o = { id: "tmp", kind, r, x: r + rand(state) * (state.board - 2 * r), y: r + rand(state) * (state.board - 2 * r) };
      if (!terrainSpotOk(state, o)) continue;
      const aim = { x: home.x + (mid - home.x) * 0.55, y: home.y + (mid - home.y) * 0.55 };
      const d = Math.hypot(o.x - aim.x, o.y - aim.y);
      if (d < best) [best, spot] = [d, o];
    }
    const label = kind === "block" ? "rocks" : kind === "thicket" ? "forest" : kind;
    if (spot) {
      state.obstacles.push({ ...spot, id: `b${state.nextUid++}`, owner: p.id });
      log(state, `${p.name}'s ${label} is placed.`);
    } else log(state, `There is no room left for ${p.name}'s ${label}; it stays off the field.`);
    p.toPlace.splice(p.toPlace.indexOf(kind), 1);
  }
}

/** Default placement: ranks of evenly spaced bases from the zone's back edge, never overlapping. */
function layoutZone(units, z) {
  const horizontal = z.edge === "south" || z.edge === "north";
  const span = horizontal ? z.x1 - z.x0 : z.y1 - z.y0;
  const GAP = 8;
  const rows = [[]];
  let used = 0;
  for (const u of units) {
    const w = BASE_SIZE[u.base] + GAP;
    if (used + w > span && rows.at(-1).length) {
      rows.push([]);
      used = 0;
    }
    rows.at(-1).push(u);
    used += w;
  }
  // The back edge is the table edge: south and east zones count inward from the far side.
  const back = { south: z.y1, north: z.y0, west: z.x0, east: z.x1 }[z.edge];
  const inward = z.edge === "south" || z.edge === "east" ? -1 : 1;
  let depth = 4;
  for (const row of rows) {
    const deep = Math.max(...row.map((u) => BASE_SIZE[u.base]));
    const width = row.reduce((a, u) => a + BASE_SIZE[u.base] + GAP, -GAP);
    let along = (horizontal ? z.x0 : z.y0) + (span - width) / 2;
    const cross = back + inward * (depth + deep / 2);
    for (const u of row) {
      const c = along + BASE_SIZE[u.base] / 2;
      Object.assign(u, horizontal ? { x: c, y: cross } : { x: cross, y: c }, { h: z.h });
      along += BASE_SIZE[u.base] + GAP;
    }
    depth += deep + GAP;
  }
}

function startDeploy(state) {
  state.phase = "deploy";
  // Battlefield: the player with the most points left unspent chooses it (ties: lowest seat).
  const left = (p) => state.settings.budget - (p.spent ?? 0);
  state.mapChooser = [...state.players].sort((a, b) => left(b) - left(a) || a.seat - b.seat)[0]?.id ?? null;
  // Until the chooser picks, the battlefield is a random one (no army is favoured by default).
  const maps = Object.keys(MAPS);
  state.map = maps[Math.floor(rand(state) * maps.length)];
  state.mapChosen = false;
  for (const p of state.players) p.toPlace = [...(p.buys || [])];
  state.obstacles = [];
  placeObstacles(state);
  for (const p of state.players) {
    p.ready = false;
    const z = zoneFor(p.seat, state.board);
    const units = p.army.map((e) => buildUnit(state, p, e));
    layoutZone(units, z);
    state.units.push(...units);
  }
  // Duplicate units get numbered names so players (and the fog) can tell them apart.
  const byName = {};
  for (const u of state.units) (byName[u.name] ||= []).push(u);
  for (const group of Object.values(byName)) if (group.length > 1) group.forEach((u, i) => (u.name = `${u.name} (${i + 1})`));
  const chooser = player(state, state.mapChooser);
  if (chooser) log(state, `${chooser.name} kept the most DP in reserve (${left(chooser)}) and chooses the battlefield.`);
  log(state, "Deployment begins. Arrange your warband inside your edge zone, place any terrain you bought, then press Ready.");
}

export function deployUnit(state, pid, uid, x, y, h) {
  if (state.phase !== "deploy") fail("Not in deployment.");
  const u = unit(state, uid);
  if (!u || u.owner !== pid) fail("That is not your unit.");
  const p = player(state, pid);
  const moved = { ...u, x: Number(x), y: Number(y), h: ((Number(h) % 360) + 360) % 360 };
  if (!inZone(moved, zoneFor(p.seat, state.board))) fail("Units must deploy fully inside your zone.");
  if (state.units.some((o) => o.id !== uid && polysOverlap(poly(moved), poly(o)))) fail("Bases cannot overlap.");
  if (blocksAt(state, u, moved)) fail("Units cannot stand on rocks.");
  Object.assign(u, { x: moved.x, y: moved.y, h: moved.h });
  p.ready = false;
}

// ── Readiness (muster, deploy, plan) ─────────────────────────────────────────
export function ready(state, pid) {
  const p = player(state, pid) || fail("Join the table first.");
  if (state.phase === "muster") {
    if (!p.army.length) fail("Submit a valid army first.");
    const v = validateArmy(p.faction, p.army, state.settings.budget, p.buys || []);
    if (!v.ok) fail(v.errors.join(" "));
  } else if (state.phase === "plan") {
    const mine = alive(state).filter((u) => u.owner === pid);
    if (mine.some((u) => !state.dials[u.id])) fail("Set a maneuver for every unit first.");
  } else if (state.phase === "deploy") {
    const mine = alive(state).filter((u) => u.owner === pid);
    for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) {
      if (polysOverlap(poly(mine[i]), poly(mine[j]))) fail(`${mine[i].name} and ${mine[j].name} overlap; move one before readying.`);
    }
    if (p.toPlace?.length) autoPlaceTerrain(state, p); // unplaced terrain goes somewhere sensible
  } else {
    fail("Nothing to ready for right now.");
  }
  p.ready = true;
}

export function setDial(state, pid, uid, code) {
  if (state.phase !== "plan") fail("You can only set dials during planning.");
  const u = unit(state, uid);
  if (!u || u.owner !== pid || u.dead) fail("That is not your unit.");
  if (!u.dial.includes(code)) fail("That maneuver is not on this unit's dial.");
  const m = parseManeuver(code);
  if (m.color === "red" && strained(u)) fail("A Strained unit cannot plan a red maneuver.");
  state.dials[uid] = code;
  player(state, pid).ready = false;
}

/** Set several dials in one go (quick orders). All or nothing: any bad entry rejects the batch. */
export function setDials(state, pid, dials) {
  if (!dials || typeof dials !== "object" || Array.isArray(dials)) fail("Bad dials.");
  const entries = Object.entries(dials);
  if (entries.length > 30) fail("Too many dials.");
  const before = { ...state.dials };
  try {
    for (const [uid, code] of entries) setDial(state, pid, uid, code);
  } catch (err) {
    state.dials = before;
    throw err;
  }
}

const activePlayers = (state) => state.players.filter((p) => !p.eliminated);

function seatOrder(state) {
  const seats = activePlayers(state).map((p) => p.seat).sort((a, b) => a - b);
  const i = Math.max(0, seats.findIndex((s) => s >= state.firstSeat));
  return [...seats.slice(i), ...seats.slice(0, i)];
}

function initiativeQueue(state, descending) {
  const order = seatOrder(state);
  const seatOf = (u) => order.indexOf(player(state, u.owner).seat);
  return alive(state)
    .sort((a, b) => (descending ? b.init - a.init : a.init - b.init) || seatOf(a) - seatOf(b))
    .map((u) => u.id);
}

function startRound(state) {
  state.round += 1;
  state.phase = "plan";
  state.dials = {};
  for (const p of state.players) p.ready = p.eliminated;
  for (const u of state.units) {
    u.revealed = null;
    u.trail = null;
    u.lastSpeed = 0;
    u.stance = 0;
    u.aim = 0;
  }
  log(state, `Round ${state.round}: set your dials.`);
}

// ── Movement ─────────────────────────────────────────────────────────────────
const others = (state, u) => alive(state).filter((o) => o.id !== u.id);

function overlapsAny(state, u, pose) {
  const P = corners(pose, sizeOf(u));
  return others(state, u).filter((o) => polysOverlap(P, poly(o)));
}

/** True when a pose would put the unit's base on impassable rocks. */
function blocksAt(state, u, pose) {
  return state.obstacles.some((o) => o.kind === "block" && touches(u, o, pose));
}
const flies = (u) => has(u, "flying") || has(u, "ethereal");

function obstaclesOnPath(state, u, poses) {
  const hit = new Set();
  for (const pose of poses) {
    const P = corners(pose, sizeOf(u));
    for (const o of state.obstacles) if (polyCircleOverlap(P, o)) hit.add(o.id);
  }
  return state.obstacles.filter((o) => hit.has(o.id));
}

function obstacleEffect(state, u, o) {
  if (u.dead) return;
  if (o.kind === "ruins") {
    const f = roll(state, ATTACK_FACES);
    log(state, `${u.name} crashes through ruins (${f}).`);
    u.cond.noAction = true;
    if (f === "strike" || f === "rend") damage(state, u, f, null);
  } else if (o.kind === "thicket") {
    if (rule(u, "wildwood")) return;
    log(state, `${u.name} is tangled in a thicket.`);
    gainStrain(state, u);
  } else if (o.kind === "lava") {
    if (u.faction === "calamity") {
      u.tokens.charge = Math.min(2, u.tokens.charge + 1);
      log(state, `${u.name} bathes in the lava (+1 Calamity charge).`);
      return;
    }
    log(state, `${u.name} is burned crossing the lava.`);
    damage(state, u, "strike", null);
  } else if (o.kind === "marsh") {
    log(state, `${u.name} wades into the marsh.`);
  } else if (o.kind === "rift") {
    if (u.faction === "calamity") {
      u.tokens.charge = Math.min(2, u.tokens.charge + 1);
      log(state, `${u.name} drinks from the rift (+1 Calamity charge).`);
      return;
    }
    const f = roll(state, ATTACK_FACES);
    log(state, `${u.name} brushes an open rift (${f}).`);
    if (f === "omen") gainStrain(state, u);
    else if (f === "strike" || f === "rend") damage(state, u, f, null);
  }
}

/** Where a maneuver would leave a unit, with bump resolution. Pure: does not mutate. */
export function planMove(state, u, code) {
  const man = parseManeuver(code);
  const size = sizeOf(u);
  const start = { x: u.x, y: u.y, h: u.h };
  if (man.type === "X") return { man, pose: start, t: 1, bumped: [], path: [start], fled: false };
  if (isHold(man)) {
    // Pivot in place; if the new facing would overlap a neighbour or rocks, keep the old one.
    const turned = maneuverPose(start, man, size, 1);
    const pose = overlapsAny(state, u, turned).length || blocksAt(state, u, turned) ? start : turned;
    return { man, pose, t: 1, bumped: [], path: [start, pose], fled: false };
  }
  const STEP = 0.02;
  let t = 1;
  let slowedBy = null;
  let blockedBy = null;
  // Walk the template: rocks stop the unit before it touches them, and lava or
  // marsh let it in only SLOW_DEPTH deep. Rifts, fliers and ghosts skip this.
  if (man.type !== "RF" && !flies(u)) {
    const len = man.type === "S" || man.type === "A" ? size + 40 * man.speed : maneuverLength(man, size);
    const startIn = new Set(state.obstacles.filter((o) => touches(u, o)).map((o) => o.id));
    let limit = 1;
    for (let s2 = STEP; s2 <= 1 + 1e-9 && s2 <= limit; s2 += STEP) {
      const p = maneuverPose(start, man, size, Math.min(1, s2));
      const rock = state.obstacles.find((o) => o.kind === "block" && touches(u, o, p));
      if (rock) {
        blockedBy = rock;
        limit = Math.max(0, s2 - STEP);
        break;
      }
      if (!slowedBy) {
        const bog = state.obstacles.find((o) => (o.kind === "lava" || o.kind === "marsh") && !startIn.has(o.id) && touches(u, o, p));
        if (bog) {
          slowedBy = bog;
          limit = Math.min(1, s2 + SLOW_DEPTH / len);
        }
      }
    }
    t = Math.min(1, limit);
  }
  let pose = maneuverPose(start, man, size, t);
  let bumped = overlapsAny(state, u, pose);
  if (!blockedBy && blocksAt(state, u, pose)) blockedBy = state.obstacles.find((o) => o.kind === "block" && touches(u, o, pose));
  if (bumped.length || blocksAt(state, u, pose)) {
    const t0 = t;
    for (t = t0 - STEP; t > 0; t -= STEP) {
      pose = maneuverPose(start, man, size, t);
      if (!overlapsAny(state, u, pose).length && !blocksAt(state, u, pose)) break;
    }
    if (t <= 0) {
      t = 0;
      pose = start;
    }
  }
  if (t < 1 && man.type === "A") pose = maneuverPose(start, man, size, t); // a stopped Wheel About does not turn
  const path = [];
  for (let s = 0; s <= t + 1e-9; s += 0.05) path.push(maneuverPose(start, man, size, Math.min(s, t)));
  path.push(pose);
  return { man, pose, t, bumped, path, slowedBy, blockedBy, fled: !insideBoard(corners(pose, size), state.board) };
}

/** Dice a stance (or Aim) is worth: the movement given up, so faster units gain more (top speed 1 to 3: 1, 4 to 5: 2). */
export function stanceBonus(u) {
  const top = Math.max(0, ...u.dial.map(parseManeuver).filter((m) => !isHold(m)).map((m) => m.speed));
  return Math.max(1, Math.floor(top / 2));
}

function maneuverLength(man, size) {
  const segs = maneuverSegments(man, size);
  return segs.reduce((a, g) => a + (g.kind === "line" ? g.len : g.r * (Math.abs(g.deg) * Math.PI) / 180), 0);
}

function executeManeuver(state, u, code) {
  const wasHigh = onKind(state, u, "hill");
  const startTouch = new Set(state.obstacles.filter((o) => touches(u, o)).map((o) => o.id));
  const mv = planMove(state, u, code);
  const { man } = mv;
  u.trail = mv.path.map((p) => ({ x: p.x, y: p.y }));
  Object.assign(u, { x: mv.pose.x, y: mv.pose.y, h: mv.pose.h });
  u.revealed = code;
  const climbed = !wasHigh && onKind(state, u, "hill");
  const bumpNote = mv.bumped.length ? `, bumping ${mv.bumped.map((b) => b.name).join(", ")}` : mv.blockedBy ? ", stopped by rocks" : mv.slowedBy ? `, slowed by the ${mv.slowedBy.kind}` : "";
  if (isHold(man)) {
    const turn = { D: "holds its facing", DL: "turns left", DBL: "turns half left", DBR: "turns half right", DR: "turns right", DA: "turns to face the rear" }[man.type.replace(/^M/, "D")];
    const stuck = mv.pose.h === mv.path[0].h && man.type !== "D" && man.type !== "M";
    const how = stuck ? ", but has no room to turn" : ` and ${turn}`;
    if (isStance(man)) {
      u.stance = stanceBonus(u);
      log(state, `${u.name} sets a defensive stance${how}: +${u.stance} defence ${u.stance === 1 ? "die" : "dice"} this round.`);
    } else {
      u.aim = stanceBonus(u);
      log(state, `${u.name} takes aim${how}: offsets up to ${u.aim} stance ${u.aim === 1 ? "die" : "dice"} this round.`);
    }
  } else log(state, `${u.name} executes ${code.replace(":", " ")}${bumpNote}.`);
  if (mv.fled) {
    log(state, `${u.name} leaves the field and is lost.`);
    kill(state, u, "fled");
    return mv;
  }
  if (mv.bumped.length || mv.blockedBy) u.cond.noAction = true;
  if (mv.bumped.length && has(u, "ram")) {
    for (const b of mv.bumped) if (b.owner !== u.owner) {
      log(state, `${u.name} rams ${b.name}!`);
      damage(state, b, "strike", u.owner);
    }
  }
  u.lastSpeed = man.speed;
  const ignorePath = has(u, "ethereal") || man.type === "RF";
  // Only pieces the unit was not already touching trigger (entering, crossing).
  const touched = obstaclesOnPath(state, u, ignorePath ? [mv.pose] : mv.path).filter((o) => !startTouch.has(o.id));
  if (!ignoresObstacles(u)) for (const o of touched) obstacleEffect(state, u, o);
  if (u.dead) return mv;
  if (climbed && !flies(u)) {
    log(state, `${u.name} climbs to the high ground.`);
    gainStrain(state, u);
  }
  if (man.color === "red") gainStrain(state, u);
  if (man.color === "blue" && u.strain > 0) u.strain -= 1;
  if (rule(u, "momentum") && man.speed >= 4) {
    u.tokens.frenzy = 1;
    log(state, `${u.name} builds Momentum (Frenzy).`);
  }
  return mv;
}

/** Pose for an action move (surge / sidestep), or null when blocked. */
function actionMovePose(state, u, a, dir) {
  const size = sizeOf(u);
  let pose;
  if (a === "surge") {
    pose = maneuverPose(u, parseManeuver({ S: "1S:w", L: "1BL:w", R: "1BR:w" }[dir]), size, 1);
  } else {
    const r = right(u.h);
    const d = (size + 40) * (dir === "R" ? 1 : -1);
    pose = { x: u.x + r.x * d, y: u.y + r.y * d, h: u.h };
  }
  if (!insideBoard(corners(pose, size), state.board)) return null;
  if (overlapsAny(state, u, pose).length) return null;
  if (blocksAt(state, u, pose)) return null;
  return pose;
}

// ── Strain and damage ────────────────────────────────────────────────────────
function gainStrain(state, u) {
  if (u.dead) return;
  if (deathless(u)) {
    log(state, `${u.name} is Deathless: the strain tears at it instead (1 damage).`);
    damage(state, u, "strike", null);
    return;
  }
  u.strain += 1;
}

function damage(state, u, kind, byPid) {
  if (u.dead || u.dying) return;
  if (u.ward > 0) {
    u.ward -= 1;
    return;
  }
  u.wounds -= 1;
  if (kind === "rend" && u.wounds > 0) {
    const c = CRITS[Math.floor(rand(state) * CRITS.length)];
    log(state, `${u.name} suffers a Rend: ${CRIT_TEXT[c]}`);
    if (c === "shaken") {
      if (!has(u, "fearless")) gainStrain(state, u);
    }
    else if (c === "broken") u.cond.broken = (u.cond.broken || 0) + 1;
    else u.cond[c] = true;
  }
  if (u.wounds <= 0) kill(state, u, byPid);
}

function kill(state, u, byPid) {
  if (u.dead || u.dying) return;
  u.wounds = Math.max(0, u.wounds);
  if (byPid === "fled") {
    // A unit that runs off the table scores for every opponent still fighting.
    for (const k of activePlayers(state)) if (k.id !== u.owner) k.vp += u.cost;
  } else if (byPid && byPid !== u.owner) {
    const k = player(state, byPid);
    if (k) k.vp += u.cost;
  }
  if (state.phase === "engagement") u.dying = true;
  else u.dead = true;
  log(state, `${u.name} is destroyed.`);
  for (const n of alive(state)) {
    if (n.id !== u.id && has(n, "raise") && !n.dying && rangeBetween(n, u) <= 2) n.souls = Math.min(3, n.souls + 1);
  }
  if (has(u, "unstable")) {
    log(state, `${u.name} bursts in a spray of Calamity!`);
    for (const n of alive(state)) if (n.id !== u.id && !n.dying && rangeBetween(n, u) <= 1) damage(state, n, "strike", u.owner);
  }
}

function flushDying(state) {
  for (const u of state.units) if (u.dying) {
    u.dying = false;
    u.dead = true;
  }
}

// ── Actions ──────────────────────────────────────────────────────────────────
/** Parse an action bar entry ("steel>r:sidestep") into { a, red, link }. */
export function parseAction(entry) {
  const [head, tail] = entry.split(">");
  const one = (s) => ({ a: s.replace(/^r:/, ""), red: s.startsWith("r:") });
  return { ...one(head), link: tail ? one(tail) : null };
}

const enemiesOf = (state, u) => alive(state).filter((o) => o.owner !== u.owner && !o.dying);
const friendsOf = (state, u) => alive(state).filter((o) => o.owner === u.owner && !o.dying && o.id !== u.id);

/** Parameters an action can take right now, or null when it cannot be performed. */
function actionParams(state, u, a, depth = 0) {
  switch (a) {
    case "steel":
    case "guard":
    case "brace":
      return {};
    case "rally":
      return u.strain > 0 ? {} : null;
    case "channel":
      return u.tokens.charge < 2 ? {} : null;
    case "mark": {
      const spotted = visibleTo(state, u.owner);
      const targets = enemiesOf(state, u).filter((e) => spotted.has(e.id) && rangeBetween(u, e) <= 3).map((e) => e.id);
      return targets.length ? { targets } : null;
    }
    case "mend": {
      const targets = [u, ...friendsOf(state, u)].filter((f) => f.ward < f.maxWard && (f === u || rangeBetween(u, f) <= 1)).map((f) => f.id);
      return targets.length ? { targets } : null;
    }
    case "surge":
    case "sidestep": {
      const dirs = (a === "surge" ? ["L", "S", "R"] : ["L", "R"]).filter((d) => actionMovePose(state, u, a, d));
      return dirs.length ? { dirs } : null;
    }
    case "command": {
      if (depth > 0) return null;
      const targets = [];
      for (const f of friendsOf(state, u)) {
        if (rangeBetween(u, f) > 2 || (strained(f) && !deathless(f))) continue;
        if (u.act?.commanded?.includes(f.id)) continue; // a Master commands two different units
        const subs = commandMenu(f)
          .map((s) => ({ a: s, ...actionParams(state, f, s, 1) }))
          .filter((s) => actionParams(state, f, s.a, 1));
        if (subs.length) targets.push({ id: f.id, subs });
      }
      return targets.length ? { targets } : null;
    }
    default:
      return null;
  }
}

function commandMenu(f) {
  const own = f.actions.map(parseAction).filter((x) => !x.red && x.a !== "command").map((x) => x.a);
  const extra = has(f, "thrall") ? ["steel", "guard", "surge"] : [];
  return [...new Set([...own, ...extra])];
}

function beginActions(state, u) {
  const slots = [{ only: null }];
  if (has(u, "master")) slots.push({ only: null });
  const code = u.revealed || "";
  if (rule(u, "unyielding") && (code.startsWith("0X") || code.startsWith("1S"))) slots.push({ only: ["steel", "brace"] });
  if (rule(u, "overreach")) slots.push({ only: null, taint: true });
  u.act = { slots, taken: [], link: null, commanded: [] };
}

/** Actions the unit can choose right now during its activation. */
export function actionOptions(state, u) {
  if (!u.act || u.dead || u.cond.noAction || u.cond.staggered) return [];
  const out = [];
  const isStrained = strained(u);
  const free = u.act.slots;
  if (u.act.link && !isStrained && !u.act.taken.includes(u.act.link.a)) {
    const p = actionParams(state, u, u.act.link.a);
    if (p) out.push({ a: u.act.link.a, red: u.act.link.red, linked: true, ...p });
  }
  for (const entry of u.actions) {
    const x = parseAction(entry);
    if (u.act.taken.includes(x.a) && !(x.a === "command" && has(u, "master"))) continue;
    if (!free.some((s) => !s.only || s.only.includes(x.a))) continue;
    const rallyAnyway = x.a === "rally" && rule(u, "rally");
    if (isStrained && !rallyAnyway) continue;
    const p = actionParams(state, u, x.a);
    if (!p) continue;
    const slot = pickSlot(free, x.a);
    out.push({ a: x.a, red: x.red, link: x.link, taint: !!slot.taint, ...p });
  }
  return out;
}

function pickSlot(slots, a) {
  // Spend the most restricted slot that allows this action, and the Taint slot last.
  const ok = slots.filter((s) => !s.only || s.only.includes(a));
  return ok.find((s) => s.only) || ok.find((s) => !s.taint) || ok[0];
}

/** Resolve one action's effect (shared by a unit's own actions and Command). */
function applyAction(state, u, a, params, byName) {
  const who = byName ? `${u.name} (commanded by ${byName})` : u.name;
  switch (a) {
    case "steel":
      u.tokens.steel += 1;
      break;
    case "guard":
      u.tokens.guard += 1;
      break;
    case "brace":
      u.tokens.brace += 1;
      break;
    case "rally":
      u.strain = Math.max(0, u.strain - 1);
      break;
    case "channel":
      u.tokens.charge = Math.min(2, u.tokens.charge + 1);
      break;
    case "mark": {
      const t = unit(state, params.target);
      if (!t || !actionParams(state, u, "mark")?.targets.includes(t.id)) fail("Pick an enemy at range 1 to 3.");
      u.tokens.mark = t.id;
      log(state, `${who} marks ${t.name}.`);
      return;
    }
    case "mend": {
      const t = unit(state, params.target);
      if (!t || !actionParams(state, u, "mend")?.targets.includes(t.id)) fail("Pick a damaged-ward friend at range 1.");
      t.ward += 1;
      log(state, `${who} mends a ward on ${t.name}.`);
      return;
    }
    case "surge":
    case "sidestep": {
      const pose = actionMovePose(state, u, a, params.dir);
      if (!pose) fail("That move is blocked.");
      const from = { x: u.x, y: u.y };
      const before = new Set(state.obstacles.filter((o) => touches(u, o)).map((o) => o.id));
      const wasHigh = onKind(state, u, "hill");
      Object.assign(u, pose);
      if (!wasHigh && onKind(state, u, "hill") && !flies(u)) {
        log(state, `${u.name} climbs to the high ground.`);
        gainStrain(state, u);
      }
      u.trail = [...(u.trail || [from]), { x: u.x, y: u.y }];
      if (!ignoresObstacles(u)) for (const o of obstaclesOnPath(state, u, [pose])) if (!before.has(o.id)) obstacleEffect(state, u, o);
      break;
    }
    default:
      fail("Unknown action.");
  }
  log(state, `${who} takes ${a[0].toUpperCase()}${a.slice(1)}.`);
}

export function act(state, pid, msg) {
  if (!msg || typeof msg !== "object") fail("Bad action.");
  const a = msg.a;
  const params = msg.params && typeof msg.params === "object" ? msg.params : {};
  const pend = state.pending;
  if (!pend || pend.type !== "action" || pend.pid !== pid) fail("It is not your action step.");
  const u = unit(state, pend.uid);
  const opt = actionOptions(state, u).find((o) => o.a === a);
  if (!opt) fail("That action is not available.");
  if (a === "command") {
    const t = opt.targets.find((x) => x.id === params.target) || fail("Pick a friendly unit at range 1 to 2.");
    const sub = t.subs.find((s) => s.a === params.sub) || fail("That unit cannot take that action.");
    log(state, `${u.name} issues a Command.`);
    applyAction(state, unit(state, t.id), sub.a, params.subParams || {}, u.name);
    u.act.commanded.push(t.id);
  } else {
    applyAction(state, u, a, params, null);
  }
  u.act.taken.push(a);
  if (opt.linked) {
    u.act.link = null;
  } else {
    const slot = pickSlot(u.act.slots, a);
    u.act.slots = u.act.slots.filter((s) => s !== slot);
    u.act.link = opt.link;
    if (slot.taint) taint(state, u);
  }
  if (opt.red) gainStrain(state, u);
  state.pending = null;
  const next = u.dead ? [] : actionOptions(state, u);
  if (next.length) state.pending = { type: "action", pid, uid: u.id, options: next };
  else finishActivation(state, u);
}

function taint(state, u) {
  const f = roll(state, ATTACK_FACES);
  log(state, `${u.name} Overreaches and rolls Taint: ${f}.`);
  if (f === "rend") damage(state, u, "rend", null);
  else if (f === "strike" && !has(u, "riftEye")) damage(state, u, "strike", null);
}

export function pass(state, pid) {
  const pend = state.pending;
  if (!pend || pend.pid !== pid) fail("Nothing to pass.");
  if (pend.type === "pick") return takeTurn(state, pid, pend.options[0]); // no preference: the first in line goes
  state.pending = null;
  if (pend.type === "action") finishActivation(state, unit(state, pend.uid));
  else if (pend.type === "attack") log(state, `${unit(state, pend.uid).name} holds its attack.`);
  else if (pend.type === "attackMods") rollDefense(state);
  else if (pend.type === "defenseMods") resolveAttack(state);
}

function finishActivation(state, u) {
  if (u) {
    u.act = null;
    if (u.cond.staggeredUsed) {
      delete u.cond.staggered;
      delete u.cond.staggeredUsed;
    }
  }
  state.pending = null;
}

// ── Engagement ───────────────────────────────────────────────────────────────
const tagged = (t) => t.tags.includes("undead") || t.tags.includes("calamity");

/** Lava or marsh between the two units: the defender gains +1 die. */
function obstructed(state, a, t) {
  return hazeBetween(state, a, t);
}
const inCover = (state, u) => state.obstacles.some((o) => COVER.has(o.kind) && inside(u, o));
const maxRange = (state, u, w) => Math.min(4, w.range[1] + (onKind(state, u, "hill") ? 1 : 0));

/** Every legal (target, weapon) pair for a unit. */
export function attackOptions(state, u) {
  if (u.dead) return [];
  const out = [];
  const spotted = visibleTo(state, u.owner);
  for (let wi = 0; wi < u.weapons.length; wi++) {
    const w = u.weapons[wi];
    for (const t of enemiesOf(state, u)) {
      if (!spotted.has(t.id) || !lineOfSight(state, u, t)) continue;
      const r = rangeBetween(u, t);
      if (r < w.range[0] || r > maxRange(state, u, w)) continue;
      if (has(t, "stealthy") && r >= 3) continue;
      if (!inArc(u, w.arc, t, sizeOf(t))) continue;
      out.push({ target: t.id, weapon: wi, range: r });
    }
  }
  return out;
}

/** Where an attacker's base centre stands relative to the target's facing: "front", "flank" or "rear". */
export function attackSide(u, t) {
  const c = { x: u.x, y: u.y, h: 0 };
  if (inArc(t, "front", c, 0)) return "front";
  return inArc(t, "rear", c, 0) ? "rear" : "flank";
}

export function attackDice(state, u, t, w, r) {
  let n = w.dice - (u.cond.broken || 0);
  if (r === 1 && !w.noRangeBonus) n += 1;
  if (has(u, "bane") && tagged(t)) n += 1;
  if (has(u, "brutal") && r === 1) n += 1;
  if (has(u, "charge") && r === 1 && u.lastSpeed >= 3) n += 1;
  if (has(u, "berserk") && u.wounds < u.maxWounds) n += 1;
  if (onKind(state, u, "thicket") && !rule(u, "wildwood")) n -= 1;
  if (!visibleTo(state, t.owner).has(u.id)) n += 1; // ambush from out of sight
  // Matchups: +1 die against the army you hunt.
  n += matchupDice(u.faction, t.faction);
  // Battlefield: Fury / Blunted change dice at range 1.
  const me = mapEffect(state.map, u.faction);
  if (r === 1 && me?.melee) n += me.melee;
  // Calamity Rift Ambush: +1 die from outside the target's front arc (flank or rear).
  if (rule(u, "riftAmbush") && attackSide(u, t) !== "front") n += 1;
  // Aim only cancels a defensive stance: never more dice than the target's stance added, and
  // nothing when Rift Ambush already strikes around the stance from the flank or rear.
  const aroundStance = rule(u, "riftAmbush") && attackSide(u, t) !== "front";
  if (u.aim && t.stance && !aroundStance) n += Math.min(u.aim, t.stance);
  if (has(u, "swarm")) {
    const buddy = friendsOf(state, u).some((f) => has(f, "swarm") && rangeBetween(f, t) <= 2 && inArc(f, "front", t, sizeOf(t)));
    if (buddy) n += 1;
  }
  return Math.max(1, n);
}

export function defenseDice(state, u, t, w, r) {
  // A stance braces the way the unit faces; Calamity Rift Ambush strikes around it from the flank or rear.
  const braced = t.stance && !(rule(u, "riftAmbush") && attackSide(u, t) !== "front");
  let n = t.def + (braced ? t.stance : 0);
  if (r >= 3 && !w.noRangeBonus && !has(u, "sniper")) n += 1;
  if (obstructed(state, u, t)) n += 1;
  if (inCover(state, t)) n += 1;
  if (onKind(state, t, "hill") && !onKind(state, u, "hill")) n += 1;
  if (onKind(state, t, "marsh")) n -= 1;
  if (has(t, "elusive") && r >= 2) n += 1;
  if (has(t, "shieldwall") && friendsOf(state, t).some((f) => has(f, "shieldwall") && rangeBetween(f, t) <= 1)) n += 1;
  // Concord Discipline: nobody fights alone.
  if (rule(t, "discipline") && friendsOf(state, t).some((f) => rangeBetween(f, t) <= 1)) n += 1;
  if (friendsOf(state, t).some((f) => has(f, "guardian") && rangeBetween(f, t) <= 1)) n += 1;
  if (has(u, "pierce")) n -= 1;
  // Battlefield: Stalwart / Exposed change defence against attacks from range 2 or more.
  const te = mapEffect(state.map, t.faction);
  if (r >= 2 && te?.ranged) n += te.ranged;
  return Math.max(0, n);
}

export function declareAttack(state, pid, msg) {
  if (!msg || typeof msg !== "object") fail("Bad attack.");
  const { target, weapon } = msg;
  const pend = state.pending;
  if (!pend || pend.type !== "attack" || pend.pid !== pid) fail("It is not your attack.");
  const u = unit(state, pend.uid);
  const opt = pend.options.find((o) => o.target === target && o.weapon === weapon) || fail("Not a legal target.");
  const t = unit(state, target);
  const w = u.weapons[weapon];
  const ambush = !visibleTo(state, t.owner).has(u.id);
  const n = attackDice(state, u, t, w, opt.range);
  u.firedRound = state.round; // firing gives away your position this round
  state.attack = {
    attacker: u.id, target: t.id, weapon, range: opt.range,
    obstructed: obstructed(state, u, t),
    atk: Array.from({ length: n }, () => roll(state, ATTACK_FACES)),
    def: [], rerolled: [], used: [], brace: false, defDice: defenseDice(state, u, t, w, opt.range),
  };
  state.attack.ambush = ambush;
  state.attack.steps = [{ side: "atk", op: "roll", faces: [...state.attack.atk] }];
  const side = rule(u, "riftAmbush") ? attackSide(u, t) : "front";
  const around = side === "rear" ? " from the rear (Rift Ambush)" : side === "flank" ? " from the flank (Rift Ambush)" : "";
  log(state, `${ambush ? "Ambush! " : ""}${u.name} attacks ${t.name}${around} with ${w.name} at range ${opt.range}: ${state.attack.atk.join(", ")}.`);
  state.pending = null;
  offerAttackMods(state);
}

function inspirer(state, u) {
  return friendsOf(state, u).find((f) => has(f, "inspire") && rangeBetween(f, u) <= 1);
}

export function attackModOptions(state) {
  const A = state.attack;
  const u = unit(state, A.attacker);
  const out = [];
  const rerollable = A.atk.map((_, i) => i).filter((i) => !A.rerolled.includes(i));
  if (u.tokens.steel > 0 && A.atk.includes("omen")) out.push({ op: "steel" });
  if (u.tokens.mark === A.target && rerollable.length) out.push({ op: "mark", max: rerollable.length });
  if (u.tokens.frenzy > 0 && rerollable.length) out.push({ op: "frenzy", max: 2 });
  if (!A.used.includes("inspire") && inspirer(state, u) && rerollable.length) out.push({ op: "inspire", max: 1 });
  if (u.tokens.charge > 0 && A.atk.some((f) => f !== "rend")) out.push({ op: "channel", max: 1 });
  return out;
}

export function defenseModOptions(state) {
  const A = state.attack;
  const t = unit(state, A.target);
  const out = [];
  if (t.tokens.steel > 0 && A.def.includes("omen")) out.push({ op: "steel" });
  if (t.tokens.guard > 0) out.push({ op: "guard" });
  if (t.tokens.brace > 0 && !A.brace) out.push({ op: "brace" });
  return out;
}

function offerAttackMods(state) {
  const A = state.attack;
  const opts = attackModOptions(state);
  if (opts.length) state.pending = { type: "attackMods", pid: unit(state, A.attacker).owner, options: opts };
  else rollDefense(state);
}

function offerDefenseMods(state) {
  const A = state.attack;
  const opts = defenseModOptions(state);
  if (opts.length) state.pending = { type: "defenseMods", pid: unit(state, A.target).owner, options: opts };
  else resolveAttack(state);
}

function rollDefense(state) {
  const A = state.attack;
  A.def = Array.from({ length: A.defDice }, () => roll(state, DEFENSE_FACES));
  A.steps.push({ side: "def", op: "roll", faces: [...A.def] });
  log(state, `${unit(state, A.target).name} defends: ${A.def.join(", ") || "no dice"}.`);
  state.pending = null;
  offerDefenseMods(state);
}

export function modify(state, pid, msg) {
  if (!msg || typeof msg !== "object") fail("Bad modifier.");
  const op = msg.op;
  const dice = Array.isArray(msg.dice) ? msg.dice : [];
  const pend = state.pending;
  if (!pend || (pend.type !== "attackMods" && pend.type !== "defenseMods") || pend.pid !== pid) fail("Not your dice to modify.");
  const opt = pend.options.find((o) => o.op === op) || fail("That modifier is not available.");
  const A = state.attack;
  const attacking = pend.type === "attackMods";
  const u = unit(state, attacking ? A.attacker : A.target);
  const pick = [...new Set(dice.map(Number))].filter((i) => i >= 0 && i < A.atk.length && !A.rerolled.includes(i));
  const reroll = (max) => {
    const chosen = (pick.length ? pick : A.atk.map((f, i) => (f === "blank" || f === "omen" ? i : -1)).filter((i) => i >= 0 && !A.rerolled.includes(i))).slice(0, max);
    for (const i of chosen) A.atk[i] = roll(state, ATTACK_FACES);
    A.rerolled.push(...chosen);
    return chosen.length;
  };
  if (attacking) {
    if (op === "steel") {
      u.tokens.steel -= 1;
      A.atk = A.atk.map((f) => (f === "omen" ? "strike" : f));
    } else if (op === "mark") {
      u.tokens.mark = null;
      reroll(opt.max);
    } else if (op === "frenzy") {
      u.tokens.frenzy = 0;
      reroll(2);
    } else if (op === "inspire") {
      reroll(1);
    } else if (op === "channel") {
      u.tokens.charge -= 1;
      const want = Number(dice[0]);
      const j = Number.isInteger(want) && A.atk[want] && A.atk[want] !== "rend" ? want : A.atk.findIndex((f) => f !== "rend");
      A.atk[j] = "rend";
    }
    A.used.push(op);
    A.steps.push({ side: "atk", op, faces: [...A.atk] });
    log(state, `${u.name} uses ${op}: ${A.atk.join(", ")}.`);
  } else {
    if (op === "steel") {
      u.tokens.steel -= 1;
      A.def = A.def.map((f) => (f === "omen" ? "parry" : f));
    } else if (op === "guard") {
      u.tokens.guard -= 1;
      A.def.push("parry");
    } else if (op === "brace") {
      u.tokens.brace -= 1;
      A.brace = true;
    }
    A.steps.push({ side: "def", op, faces: [...A.def] });
    log(state, `${u.name} uses ${op}: ${A.def.join(", ") || "no dice"}.`);
  }
  state.pending = null;
  if (attacking) offerAttackMods(state);
  else offerDefenseMods(state);
}

/** Cancel and apply damage. Exported for tests. */
export function tally(A, stoneRune) {
  let strikes = A.atk.filter((f) => f === "strike").length;
  let rends = A.atk.filter((f) => f === "rend").length;
  let parries = A.def.filter((f) => f === "parry").length;
  const s = Math.min(strikes, parries);
  strikes -= s;
  parries -= s;
  rends -= Math.min(rends, parries);
  if (A.brace) {
    if (strikes > 0) strikes -= 1;
    else if (stoneRune && rends > 0) rends -= 1;
  }
  return { strikes, rends };
}

/** Damage an attack deals after cancellation, Brace and Armored. Exported for tests. */
export function finalDamage(A, t) {
  let { strikes, rends } = tally(A, has(t, "stoneRune"));
  const armored = has(t, "armored") && strikes + rends >= 2;
  if (armored) {
    if (strikes > 0) strikes -= 1;
    else rends -= 1;
  }
  return { strikes, rends, armored };
}

function resolveAttack(state) {
  const A = state.attack;
  const u = unit(state, A.attacker);
  const t = unit(state, A.target);
  const { strikes, rends, armored } = finalDamage(A, t);
  if (armored) log(state, `${t.name}'s armour turns one blow.`);
  log(state, strikes + rends ? `${t.name} takes ${strikes} Strike${strikes === 1 ? "" : "s"} and ${rends} Rend${rends === 1 ? "" : "s"}.` : `${t.name} turns the blow aside.`);
  for (let i = 0; i < strikes; i++) damage(state, t, "strike", u.owner);
  for (let i = 0; i < rends; i++) damage(state, t, "rend", u.owner);
  if (strikes + rends > 0) {
    if (has(u, "vampiric") && !u.dead && u.wounds < u.maxWounds) {
      u.wounds += 1;
      log(state, `${u.name} drinks deep (+1 wound).`);
    }
    if (has(u, "poison") && !t.dead && !t.dying) {
      t.cond.bleeding = true;
      t.cond.bleedingBy = u.owner;
      log(state, `${t.name} is poisoned (Bleeding).`);
    }
    if (has(u, "blast")) {
      for (const e of enemiesOf(state, u)) if (e.id !== t.id && rangeBetween(e, t) <= 1) {
        log(state, `The blast catches ${e.name}.`);
        damage(state, e, "strike", u.owner);
      }
    }
  }
  state.lastAttack = { ...A, armored, result: { strikes, rends }, n: (state.lastAttack?.n || 0) + 1 };
  state.attack = null;
  state.pending = null;
  // Hold the battle here until every screen has followed the attack (the server ends the beat).
  if (state.settings.pauseAttacks) state.beat = { n: state.lastAttack.n };
}

/** End the pause after an attack so the battle carries on. */
export function clearBeat(state) {
  state.beat = null;
}

// ── Choosing between tied units ─────────────────────────────────────────────
/**
 * X-Wing rule for ties: when a person has two or more units waiting at the initiative that acts
 * next, they choose which goes first (computer opponents simply take them in order). In the
 * Engagement only units with a target count. Returns true when the choice is now pending.
 */
function offerPick(state) {
  const u = unit(state, state.queue[0]);
  if (!u || u.dead || state.picked === u.id) return false;
  const owner = player(state, u.owner);
  if (!owner || owner.ai) return false;
  const engage = state.phase === "engagement";
  const tied = state.queue
    .map((id) => unit(state, id))
    .filter((x) => x && !x.dead && x.owner === u.owner && x.init === u.init && (!engage || attackOptions(state, x).length));
  if (tied.length < 2) return false;
  // A choice made earlier in the battle stands: the remembered unit goes first without asking.
  const pref = owner.tiePref?.[state.phase] || [];
  const ranked = tied.filter((x) => pref.includes(x.id)).sort((a, b) => pref.indexOf(a.id) - pref.indexOf(b.id))[0];
  if (ranked) {
    state.queue = [ranked.id, ...state.queue.filter((id) => id !== ranked.id)];
    state.picked = ranked.id;
    return false;
  }
  state.pending = { type: "pick", pid: u.owner, uid: null, options: tied.map((x) => x.id) };
  return true;
}

/** The player picks which of their tied units takes its turn now. */
export function takeTurn(state, pid, uid) {
  const pend = state.pending;
  if (!pend || pend.type !== "pick" || pend.pid !== pid) fail("You are not choosing a unit right now.");
  if (!pend.options.includes(uid)) fail("That unit cannot go now.");
  // Remember the choice for the rest of the battle: this unit goes ahead of the ones it was picked over.
  const p = player(state, pid);
  p.tiePref ||= { activation: [], engagement: [] };
  const pref = p.tiePref[state.phase];
  const before = pend.options.filter((id) => id !== uid).map((id) => pref.indexOf(id)).filter((i) => i >= 0);
  if (!pref.includes(uid)) pref.splice(before.length ? Math.min(...before) : pref.length, 0, uid);
  state.queue = [uid, ...state.queue.filter((id) => id !== uid)];
  state.picked = uid;
  state.pending = null;
}

// ── Phase driver ─────────────────────────────────────────────────────────────
function allReady(state) {
  const ps = activePlayers(state);
  return ps.length > 0 && ps.every((p) => p.ready);
}

function startActivation(state) {
  state.phase = "activation";
  state.queue = initiativeQueue(state, false);
  log(state, "Dials revealed. Activation begins, lowest initiative first.");
}

function startEngagement(state) {
  state.phase = "engagement";
  for (const f of alive(state).filter((x) => has(x, "fear"))) {
    for (const e of enemiesOf(state, f)) {
      if (!deathless(e) && !has(e, "fearless") && rangeBetween(f, e) <= 1) {
        log(state, `${e.name} quails before ${f.name} (+1 strain).`);
        gainStrain(state, e);
      }
    }
  }
  for (const c of alive(state).filter((x) => has(x, "warcry"))) {
    const rallied = [c, ...friendsOf(state, c).filter((f) => rangeBetween(c, f) <= 2)];
    for (const f of rallied) f.tokens.steel = Math.max(f.tokens.steel, 1);
    log(state, `${c.name} sounds a warcry (${rallied.length} unit${rallied.length === 1 ? "" : "s"} steeled).`);
  }
  state.queue = initiativeQueue(state, true);
  state.group = null;
  log(state, "Engagement begins, highest initiative first.");
}

function endPhase(state) {
  const fighting = activePlayers(state); // a mutual wipe is decided among these
  flushDying(state);
  state.phase = "end"; // deaths from here on are immediate, not simultaneous-fire
  for (const u of alive(state)) {
    if (u.dead) continue; // fell earlier in this loop (an Unstable burst)
    if (u.cond.bleeding) {
      const by = u.cond.bleedingBy || null;
      delete u.cond.bleeding;
      delete u.cond.bleedingBy;
      log(state, `${u.name} bleeds (1 damage).`);
      damage(state, u, "strike", by);
    }
  }
  for (const u of alive(state)) {
    if (has(u, "regenerate") && u.wounds < u.maxWounds) {
      const f = roll(state, ATTACK_FACES);
      if (f === "strike" || f === "rend") {
        u.wounds += 1;
        log(state, `${u.name} regenerates a wound.`);
      }
    }
    if (has(u, "wardRegen") && u.ward < u.maxWard) u.ward += 1;
    if (has(u, "healer")) {
      const hurt = friendsOf(state, u).filter((f) => f.wounds < f.maxWounds && rangeBetween(u, f) <= 1).sort((a, b) => a.wounds / a.maxWounds - b.wounds / b.maxWounds)[0];
      if (hurt) {
        hurt.wounds += 1;
        log(state, `${u.name} tends ${hurt.name} (+1 wound).`);
      }
    }
    if (has(u, "raise")) {
      for (const f of friendsOf(state, u)) {
        if (u.souls > 0 && has(f, "thrall") && f.wounds < f.maxWounds && rangeBetween(u, f) <= 2) {
          u.souls -= 1;
          f.wounds += 1;
          log(state, `${u.name} spends a Soul to knit ${f.name} back together.`);
        }
      }
    }
    Object.assign(u.tokens, { steel: 0, guard: 0, brace: 0, frenzy: 0 });
    delete u.cond.noAction;
  }
  for (const p of state.players) {
    if (!p.eliminated && !alive(state).some((u) => u.owner === p.id)) {
      p.eliminated = true;
      log(state, `${p.name}'s warband is broken.`);
    }
  }
  const standing = activePlayers(state);
  if (standing.length <= 1 || state.round >= state.settings.maxRounds) {
    endBattle(state, fighting);
    return;
  }
  const seats = activePlayers(state).map((p) => p.seat).sort((a, b) => a - b);
  state.firstSeat = seats.find((s) => s > state.firstSeat) ?? seats[0];
  startRound(state);
}

/**
 * Close the battle and name the winner: the last warband standing, else the best score still on
 * the field. When every warband falls at once, only those still fighting that round can win
 * (never one that surrendered or broke earlier). An exact tie at the top is a draw.
 */
function endBattle(state, fighting = []) {
  const standing = activePlayers(state);
  state.phase = "over";
  state.pending = null;
  state.attack = null;
  state.beat = null;
  const score = (p) => p.vp * 1000 + alive(state).filter((u) => u.owner === p.id).reduce((a, u) => a + u.cost, 0);
  const pool = standing.length ? standing : fighting.filter((p) => !p.surrendered);
  const ranked = [...pool].sort((a, b) => score(b) - score(a) || a.seat - b.seat);
  const draw = standing.length !== 1 && ranked.length > 1 && score(ranked[0]) === score(ranked[1]);
  state.winner = standing.length === 1 ? standing[0].id : draw ? null : ranked[0]?.id ?? null;
  state.draw = draw;
  log(state, draw ? "The drums fall silent. The battle is a draw." : `The drums fall silent. ${player(state, state.winner)?.name ?? "Nobody"} holds the field.`);
}

/**
 * A player concedes: their warband quits the field (no points to anyone) and the battle
 * ends when one warband is left, or when only computer opponents are still fighting.
 */
export function surrender(state, pid) {
  const p = player(state, pid) || fail("Join the table first.");
  if (state.phase === "muster" || state.phase === "over") fail("There is no battle to surrender.");
  if (p.eliminated) fail("Your warband has already left the field.");
  p.eliminated = true;
  p.surrendered = true;
  p.ready = true;
  const theirs = new Set(state.units.filter((u) => u.owner === pid).map((u) => u.id));
  for (const u of state.units) if (theirs.has(u.id)) Object.assign(u, { dead: true, dying: false });
  // Drop any choice or attack in progress that involves the departing warband.
  if (state.pending?.pid === pid || (state.attack && (theirs.has(state.attack.attacker) || theirs.has(state.attack.target)))) {
    state.pending = null;
    state.attack = null;
  }
  log(state, `${p.name} surrenders and quits the field.`);
  const standing = activePlayers(state);
  if (standing.length <= 1 || standing.every((x) => x.ai)) endBattle(state);
}

/** Advance the game until a player decision is needed. Idempotent when waiting. */
export function run(state) {
  for (let guard = 0; guard < 2000; guard++) {
    if (state.pending || state.beat || state.phase === "over") return;
    if (state.phase === "muster") {
      const fits = (p) => validateArmy(p.faction, p.army, state.settings.budget, p.buys || []).ok;
      // state.hold: a computer-only table waits for a watcher to start it (or someone to sit down).
      if (!state.hold && state.players.length >= 2 && state.players.every((p) => p.ready && fits(p))) startDeploy(state);
      else return;
    } else if (state.phase === "deploy") {
      if (allReady(state)) {
        applyBattlefield(state);
        startRound(state);
      }
      else return;
    } else if (state.phase === "plan") {
      if (allReady(state)) startActivation(state);
      else return;
    } else if (state.phase === "activation") {
      if (!state.queue.length) {
        startEngagement(state);
        continue;
      }
      if (offerPick(state)) return;
      const uid = state.queue.shift();
      state.picked = null;
      const u = unit(state, uid);
      if (!u || u.dead) continue;
      executeManeuver(state, u, state.dials[u.id] || u.dial.find((c) => c.startsWith("1S")) || u.dial[0]);
      if (u.dead) continue;
      beginActions(state, u);
      if (u.cond.staggered) u.cond.staggeredUsed = true;
      const opts = actionOptions(state, u);
      if (opts.length) state.pending = { type: "action", pid: u.owner, uid: u.id, options: opts };
      else finishActivation(state, u);
    } else if (state.phase === "engagement") {
      const uid = state.queue[0];
      if (!uid) {
        endPhase(state);
        continue;
      }
      const u = unit(state, uid);
      if (state.group !== null && u && u.init !== state.group) flushDying(state);
      if (offerPick(state)) return;
      state.queue.shift();
      state.picked = null;
      if (!u || u.dead) continue;
      state.group = u.init;
      const opts = attackOptions(state, u);
      if (opts.length) state.pending = { type: "attack", pid: u.owner, uid: u.id, options: opts };
    }
  }
}

/**
 * The state as one seat may see it.
 * - Private player tokens never leave the server: players appear by public seat id.
 * - Other players' planned dials stay secret.
 * - From deployment on, the fog of war hides enemy units this viewer cannot see,
 *   along with their ids in the queue, plans and prompts, and their names in the log.
 * - Spectators (pid null) see what every seated player can see, or everything
 *   when the host has opened spectating.
 */
export function viewFor(state, pid) {
  const seated = player(state, pid);
  const pub = Object.fromEntries(state.players.map((p) => [p.id, `p${p.seat}`]));
  const v = JSON.parse(JSON.stringify(state));
  delete v.rng;
  // Which units have a dial set: only your own (opponents see just your Ready marker).
  v.planned = Object.keys(state.dials).filter((id) => seated && unit(state, id)?.owner === pid);
  v.dials = {};
  for (const [uid, code] of Object.entries(state.dials)) if (seated && unit(state, uid)?.owner === pid) v.dials[uid] = code;
  v.hidden = 0;
  const battle = state.phase !== "muster" && state.phase !== "over";
  let seen = null;
  if (battle && seated) seen = visibleTo(state, pid); // watchers (pid null) always see every unit
  if (seen) {
    const hiddenUnits = v.units.filter((u) => !u.dead && !seen.has(u.id) && u.owner !== pid);
    const hide = new Set(hiddenUnits.map((u) => u.id));
    const known = (id) => !hide.has(id);
    v.units = v.units.filter((u) => known(u.id));
    v.hidden = hiddenUnits.length;
    v.planned = v.planned.filter(known);
    v.queue = v.queue.filter(known);
    if (v.pending && v.pending.pid !== pid) v.pending = { type: v.pending.type, pid: v.pending.pid, uid: known(v.pending.uid) ? v.pending.uid : null };
    for (const k of ["attack", "lastAttack"]) if (v[k] && (!known(v[k].attacker) || !known(v[k].target))) v[k] = null;
    const nameOf = Object.fromEntries(hiddenUnits.map((u) => [u.id, u.name]));
    for (const entry of v.log) {
      // A line about what an unseen enemy did (its maneuver, actions) says only that it acted.
      const actor = (entry.refs || []).find((id) => nameOf[id] && entry.msg.startsWith(nameOf[id]));
      if (actor) Object.assign(entry, { msg: "An unseen enemy acts.", who: null });
      else for (const id of entry.refs || []) if (nameOf[id]) entry.msg = entry.msg.split(nameOf[id]).join("an unseen enemy");
      entry.refs = (entry.refs || []).filter(known);
    }
  }
  for (const entry of v.log) if (entry.who) entry.who = pub[entry.who] ?? null;
  // Opponents' army lists and terrain purchases stay private until the battle shows them.
  for (const p of v.players) if (p.id !== pid) {
    p.army = [];
    delete p.buys;
    delete p.toPlace;
    delete p.tiePref;
  }
  // Who a Bleeding was inflicted by is a private token: keep it on the server.
  for (const u of v.units) delete u.cond?.bleedingBy;
  // Swap private tokens for public seat ids everywhere they appear.
  for (const p of v.players) p.id = pub[p.id];
  for (const u of v.units) u.owner = pub[u.owner];
  if (v.pending) v.pending.pid = pub[v.pending.pid];
  if (v.winner) v.winner = pub[v.winner];
  // Tokens are private: the battlefield chooser and bought terrain are shown by public seat id.
  if (v.mapChooser) v.mapChooser = pub[v.mapChooser] ?? null;
  for (const o of v.obstacles) if (o.owner) o.owner = pub[o.owner] ?? null;
  v.you = seated ? pub[pid] : null;
  return v;
}
