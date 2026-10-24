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
  BASE_SIZE, BOARD, corners, inArc, insideBoard, maneuverPose, parseManeuver, polyCircleOverlap,
  polyDistance, polysOverlap, rangeBand, right, segmentHitsCircle,
} from "./geometry.js";
import { FACTION_TAGS, FACTIONS, UPGRADES, unitDef, validateArmy } from "./factions.js";

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
export const OBSTACLE_KINDS = ["ruins", "thicket", "rift"];

// ── State ────────────────────────────────────────────────────────────────────
export function createGame({ budget = 100, maxRounds = 12, seed = Date.now() } = {}) {
  return {
    phase: "muster",
    round: 0,
    settings: { budget, maxRounds },
    players: [],
    units: [],
    obstacles: [],
    dials: {},
    queue: [],
    group: null,
    pending: null,
    attack: null,
    lastAttack: null,
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
  state.log.push({ round: state.round, msg });
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

export function setSettings(state, pid, { budget, maxRounds }) {
  if (state.phase !== "muster") fail("Settings are locked once deployment begins.");
  if (state.players[0]?.id !== pid) fail("Only the host (first seat) can change settings.");
  if (budget != null) state.settings.budget = Math.max(40, Math.min(300, Number(budget) || 100));
  if (maxRounds != null) state.settings.maxRounds = Math.max(3, Math.min(20, Number(maxRounds) || 12));
  for (const p of state.players) p.ready = false;
}

export function setFaction(state, pid, faction) {
  const p = player(state, pid) || fail("Join the table first.");
  if (state.phase !== "muster") fail("Factions are locked.");
  if (!FACTIONS[faction]) fail("Unknown faction.");
  p.faction = faction;
  p.army = [];
  p.ready = false;
}

export function submitArmy(state, pid, list) {
  const p = player(state, pid) || fail("Join the table first.");
  if (state.phase !== "muster") fail("Muster is over.");
  const v = validateArmy(p.faction, list, state.settings.budget);
  if (!v.ok) fail(v.errors.join(" "));
  p.army = list.map((e) => ({ unit: e.unit, upgrade: e.upgrade || null }));
  p.ready = true;
  log(state, `${p.name} musters ${FACTIONS[p.faction].name} (${v.cost} pts).`);
}

export function unready(state, pid) {
  const p = player(state, pid) || fail("Join the table first.");
  if (state.phase === "muster" || state.phase === "deploy" || state.phase === "plan") p.ready = false;
}

// ── Deployment ───────────────────────────────────────────────────────────────
export function zoneFor(seat) {
  const D = 110;
  const lo = 110;
  const hi = BOARD - 110;
  return [
    { x0: lo, x1: hi, y0: BOARD - D, y1: BOARD, h: 0, edge: "south" },
    { x0: lo, x1: hi, y0: 0, y1: D, h: 180, edge: "north" },
    { x0: 0, x1: D, y0: lo, y1: hi, h: 90, edge: "west" },
    { x0: BOARD - D, x1: BOARD, y0: lo, y1: hi, h: 270, edge: "east" },
  ][seat];
}

function inZone(u, z) {
  return poly(u).every((v) => v.x >= z.x0 && v.x <= z.x1 && v.y >= z.y0 && v.y <= z.y1);
}

function buildUnit(state, p, entry) {
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
    dial: d.dial,
    tags: FACTION_TAGS[p.faction] || [],
    x: 0, y: 0, h: 0,
    strain: 0,
    tokens: { steel: 0, guard: 0, brace: 0, frenzy: 0, charge: 0, mark: null },
    cond: {},
    souls: abilities.includes("phylactery") && abilities.includes("raise") ? 2 : 0,
    dead: false,
    dying: false,
    revealed: null,
    trail: null,
  };
}

function placeObstacles(state) {
  state.obstacles = [];
  let tries = 0;
  while (state.obstacles.length < 6 && tries++ < 500) {
    const r = 35 + Math.floor(rand(state) * 25);
    const o = {
      id: `o${state.obstacles.length + 1}`,
      kind: OBSTACLE_KINDS[state.obstacles.length % 3],
      x: 180 + rand(state) * (BOARD - 360),
      y: 180 + rand(state) * (BOARD - 360),
      r,
    };
    if (state.obstacles.every((q) => Math.hypot(q.x - o.x, q.y - o.y) > q.r + o.r + 90)) state.obstacles.push(o);
  }
}

function startDeploy(state) {
  state.phase = "deploy";
  placeObstacles(state);
  for (const p of state.players) {
    p.ready = false;
    const z = zoneFor(p.seat);
    const units = p.army.map((e) => buildUnit(state, p, e));
    const horizontal = z.edge === "south" || z.edge === "north";
    const span = horizontal ? z.x1 - z.x0 : z.y1 - z.y0;
    units.forEach((u, i) => {
      const along = (horizontal ? z.x0 : z.y0) + (span * (i + 1)) / (units.length + 1);
      const depth = horizontal ? (z.y0 + z.y1) / 2 : (z.x0 + z.x1) / 2;
      Object.assign(u, horizontal ? { x: along, y: depth } : { x: depth, y: along }, { h: z.h });
    });
    state.units.push(...units);
  }
  log(state, "Deployment begins. Arrange your warband inside your edge zone, then press Ready.");
}

export function deployUnit(state, pid, uid, x, y, h) {
  if (state.phase !== "deploy") fail("Not in deployment.");
  const u = unit(state, uid);
  if (!u || u.owner !== pid) fail("That is not your unit.");
  const p = player(state, pid);
  const moved = { ...u, x: Number(x), y: Number(y), h: ((Number(h) % 360) + 360) % 360 };
  if (!inZone(moved, zoneFor(p.seat))) fail("Units must deploy fully inside your zone.");
  if (state.units.some((o) => o.id !== uid && polysOverlap(poly(moved), poly(o)))) fail("Bases cannot overlap.");
  Object.assign(u, { x: moved.x, y: moved.y, h: moved.h });
  p.ready = false;
}

// ── Readiness (muster, deploy, plan) ─────────────────────────────────────────
export function ready(state, pid) {
  const p = player(state, pid) || fail("Join the table first.");
  if (state.phase === "muster") {
    if (!p.army.length) fail("Submit a valid army first.");
  } else if (state.phase === "plan") {
    const mine = alive(state).filter((u) => u.owner === pid);
    if (mine.some((u) => !state.dials[u.id])) fail("Set a maneuver for every unit first.");
  } else if (state.phase !== "deploy") {
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
  }
  log(state, `Round ${state.round}: set your dials.`);
}

// ── Movement ─────────────────────────────────────────────────────────────────
const others = (state, u) => alive(state).filter((o) => o.id !== u.id);

function overlapsAny(state, u, pose) {
  const P = corners(pose, sizeOf(u));
  return others(state, u).filter((o) => polysOverlap(P, poly(o)));
}

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
  const STEP = 0.02;
  let t = 1;
  let pose = maneuverPose(start, man, size, 1);
  let bumped = overlapsAny(state, u, pose);
  if (bumped.length) {
    for (t = 1 - STEP; t > 0; t -= STEP) {
      pose = maneuverPose(start, man, size, t);
      if (!overlapsAny(state, u, pose).length) break;
    }
    if (t <= 0) {
      t = 0;
      pose = start;
    }
  }
  const path = [];
  for (let s = 0; s <= t + 1e-9; s += 0.05) path.push(maneuverPose(start, man, size, Math.min(s, t)));
  path.push(pose);
  return { man, pose, t, bumped, path, fled: !insideBoard(corners(pose, size)) };
}

function executeManeuver(state, u, code) {
  const mv = planMove(state, u, code);
  const { man } = mv;
  u.trail = mv.path.map((p) => ({ x: p.x, y: p.y }));
  Object.assign(u, { x: mv.pose.x, y: mv.pose.y, h: mv.pose.h });
  u.revealed = code;
  const bumpNote = mv.bumped.length ? `, bumping ${mv.bumped.map((b) => b.name).join(", ")}` : "";
  log(state, `${u.name} executes ${code.replace(":", " ")}${bumpNote}.`);
  if (mv.fled) {
    log(state, `${u.name} leaves the field and is lost.`);
    kill(state, u, "fled");
    return mv;
  }
  if (mv.bumped.length) u.cond.noAction = true;
  if (mv.bumped.length && has(u, "ram")) {
    for (const b of mv.bumped) if (b.owner !== u.owner) {
      log(state, `${u.name} rams ${b.name}!`);
      damage(state, b, "strike", u.owner);
    }
  }
  u.lastSpeed = man.speed;
  const ignorePath = has(u, "ethereal") || man.type === "RF";
  const touched = obstaclesOnPath(state, u, ignorePath ? [mv.pose] : mv.path);
  if (!ignoresObstacles(u)) for (const o of touched) obstacleEffect(state, u, o);
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
  if (!insideBoard(corners(pose, size))) return null;
  if (overlapsAny(state, u, pose).length) return null;
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
      const targets = enemiesOf(state, u).filter((e) => rangeBetween(u, e) <= 3).map((e) => e.id);
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
  u.act = { slots, taken: [], link: null };
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
    if (u.act.taken.includes(x.a)) continue;
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
      Object.assign(u, pose);
      u.trail = [...(u.trail || [from]), { x: u.x, y: u.y }];
      if (!ignoresObstacles(u)) for (const o of obstaclesOnPath(state, u, [pose])) obstacleEffect(state, u, o);
      break;
    }
    default:
      fail("Unknown action.");
  }
  log(state, `${who} takes ${a[0].toUpperCase()}${a.slice(1)}.`);
}

export function act(state, pid, { a, params = {} }) {
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

function obstructed(state, a, t) {
  return state.obstacles.some((o) => segmentHitsCircle(a, t, o));
}

/** Every legal (target, weapon) pair for a unit. */
export function attackOptions(state, u) {
  if (u.dead) return [];
  const out = [];
  for (let wi = 0; wi < u.weapons.length; wi++) {
    const w = u.weapons[wi];
    for (const t of enemiesOf(state, u)) {
      const r = rangeBetween(u, t);
      if (r < w.range[0] || r > w.range[1]) continue;
      if (has(t, "stealthy") && r >= 3) continue;
      if (!inArc(u, w.arc, t, sizeOf(t))) continue;
      out.push({ target: t.id, weapon: wi, range: r });
    }
  }
  return out;
}

export function attackDice(state, u, t, w, r) {
  let n = w.dice - (u.cond.broken || 0);
  if (r === 1 && !w.noRangeBonus) n += 1;
  if (has(u, "bane") && tagged(t)) n += 1;
  if (has(u, "brutal") && r === 1) n += 1;
  if (has(u, "charge") && r === 1 && u.lastSpeed >= 3) n += 1;
  if (has(u, "berserk") && u.wounds < u.maxWounds) n += 1;
  if (has(u, "swarm")) {
    const buddy = friendsOf(state, u).some((f) => has(f, "swarm") && rangeBetween(f, t) <= 2 && inArc(f, "front", t, sizeOf(t)));
    if (buddy) n += 1;
  }
  return Math.max(1, n);
}

export function defenseDice(state, u, t, w, r) {
  let n = t.def;
  if (r >= 3 && !w.noRangeBonus && !has(u, "sniper")) n += 1;
  if (obstructed(state, u, t)) n += 1;
  if (has(t, "elusive") && r >= 2) n += 1;
  if (has(t, "shieldwall") && friendsOf(state, t).some((f) => has(f, "shieldwall") && rangeBetween(f, t) <= 1)) n += 1;
  if (friendsOf(state, t).some((f) => has(f, "guardian") && rangeBetween(f, t) <= 1)) n += 1;
  if (has(u, "pierce")) n -= 1;
  return Math.max(0, n);
}

export function declareAttack(state, pid, { target, weapon }) {
  const pend = state.pending;
  if (!pend || pend.type !== "attack" || pend.pid !== pid) fail("It is not your attack.");
  const u = unit(state, pend.uid);
  const opt = pend.options.find((o) => o.target === target && o.weapon === weapon) || fail("Not a legal target.");
  const t = unit(state, target);
  const w = u.weapons[weapon];
  const n = attackDice(state, u, t, w, opt.range);
  state.attack = {
    attacker: u.id, target: t.id, weapon, range: opt.range,
    obstructed: obstructed(state, u, t),
    atk: Array.from({ length: n }, () => roll(state, ATTACK_FACES)),
    def: [], rerolled: [], used: [], brace: false, defDice: defenseDice(state, u, t, w, opt.range),
  };
  log(state, `${u.name} attacks ${t.name} with ${w.name} at range ${opt.range}: ${state.attack.atk.join(", ")}.`);
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
  log(state, `${unit(state, A.target).name} defends: ${A.def.join(", ") || "no dice"}.`);
  state.pending = null;
  offerDefenseMods(state);
}

export function modify(state, pid, { op, dice = [] }) {
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
      log(state, `${t.name} is poisoned (Bleeding).`);
    }
    if (has(u, "blast")) {
      for (const e of enemiesOf(state, u)) if (e.id !== t.id && rangeBetween(e, t) <= 1) {
        log(state, `The blast catches ${e.name}.`);
        damage(state, e, "strike", u.owner);
      }
    }
  }
  state.lastAttack = { ...A, result: { strikes, rends } };
  state.attack = null;
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
  flushDying(state);
  for (const u of alive(state)) {
    if (u.cond.bleeding) {
      delete u.cond.bleeding;
      log(state, `${u.name} bleeds (1 damage).`);
      damage(state, u, "strike", null);
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
    state.phase = "over";
    const score = (p) => p.vp * 1000 + alive(state).filter((u) => u.owner === p.id).reduce((a, u) => a + u.cost, 0);
    const ranked = [...state.players].sort((a, b) => score(b) - score(a));
    state.winner = standing.length === 1 ? standing[0].id : ranked[0]?.id ?? null;
    log(state, `The drums fall silent. ${player(state, state.winner)?.name ?? "Nobody"} holds the field.`);
    return;
  }
  const seats = activePlayers(state).map((p) => p.seat).sort((a, b) => a - b);
  state.firstSeat = seats.find((s) => s > state.firstSeat) ?? seats[0];
  startRound(state);
}

/** Advance the game until a player decision is needed. Idempotent when waiting. */
export function run(state) {
  for (let guard = 0; guard < 2000; guard++) {
    if (state.pending || state.phase === "over") return;
    if (state.phase === "muster") {
      if (state.players.length >= 2 && state.players.every((p) => p.ready)) startDeploy(state);
      else return;
    } else if (state.phase === "deploy") {
      if (allReady(state)) startRound(state);
      else return;
    } else if (state.phase === "plan") {
      if (allReady(state)) startActivation(state);
      else return;
    } else if (state.phase === "activation") {
      const uid = state.queue.shift();
      if (!uid) {
        startEngagement(state);
        continue;
      }
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
      state.queue.shift();
      if (!u || u.dead) continue;
      state.group = u.init;
      const opts = attackOptions(state, u);
      if (opts.length) state.pending = { type: "attack", pid: u.owner, uid: u.id, options: opts };
    }
  }
}

/** The state as one seat may see it: other players' planned dials stay secret. */
export function viewFor(state, pid) {
  const v = JSON.parse(JSON.stringify(state));
  delete v.rng;
  v.planned = Object.keys(state.dials);
  v.dials = {};
  for (const [uid, code] of Object.entries(state.dials)) if (unit(state, uid)?.owner === pid) v.dials[uid] = code;
  v.you = pid;
  return v;
}
