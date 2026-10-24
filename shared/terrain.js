// Terrain and vision. Every terrain piece is a circle on the board. Each kind has
// an upside and a downside; this module holds the rules data (shared with the
// browser for tooltips) and the line-of-sight and fog-of-war geometry.
import { BASE_SIZE, BOARD, corners, polyCircleOverlap, polyDistance, rangeBand, segmentHitsCircle } from "./geometry.js";

export const TERRAIN = {
  hill: {
    name: "Hill",
    up: "High ground: +1 maximum range, sees one band farther and over forests and ruins, +1 defence die against attackers below.",
    down: "Climbing onto it costs 1 strain. A unit on a hill cannot hide.",
  },
  thicket: {
    name: "Forest",
    up: "Cover: +1 defence die inside. Blocks line of sight. Units inside can only be spotted from range 1.",
    down: "Entering costs 1 strain (Sylvan units ignore this). Attacks made from inside roll 1 fewer die.",
  },
  ruins: {
    name: "Ruins",
    up: "Cover: +1 defence die inside. Blocks line of sight.",
    down: "Rubble: crossing it rolls an attack die for damage and the unit loses its actions.",
  },
  lava: {
    name: "Lava",
    up: "Heat haze: attacks across it give the defender +1 die. Calamity units gain a charge here and are not burned.",
    down: "Burns (1 damage) and stops movement shortly after entering.",
  },
  marsh: {
    name: "Marsh",
    up: "Mist: attacks across it give the defender +1 die.",
    down: "Stops movement shortly after entering, and units standing in it roll 1 fewer defence die.",
  },
  rift: {
    name: "Rift",
    up: "Calamity units gain a charge when they touch it.",
    down: "Others roll an attack die: Omen gives strain, Strike or Rend deals damage.",
  },
  block: {
    name: "Rocks",
    up: "Blocks line of sight completely: hide behind it.",
    down: "Impassable: units bump against it.",
  },
};

// Board layout: what a battlefield is built from, and how large each piece is.
export const LAYOUT = ["hill", "hill", "thicket", "thicket", "ruins", "lava", "marsh", "rift", "block", "block"];
export const RADIUS = { hill: [70, 95], thicket: [45, 65], ruins: [40, 55], lava: [38, 52], marsh: [45, 60], rift: [35, 48], block: [22, 32] };
export const SLOW_DEPTH = 40; // how far a unit gets into lava or marsh before it stops

export const BLOCKS_LOS = new Set(["block", "thicket", "ruins"]);
export const HAZE = new Set(["lava", "marsh"]);
export const COVER = new Set(["thicket", "ruins"]);
export const VISION = 3; // range bands a unit can see
export const CONCEALED_RANGE = 1; // stealthy or forest-hidden units are only seen this close

const size = (u) => BASE_SIZE[u.base];
/** True when the unit's centre stands inside the piece. */
export const inside = (u, o) => Math.hypot(u.x - o.x, u.y - o.y) < o.r;
export const terrainAt = (state, u) => state.obstacles.filter((o) => inside(u, o));
export const onKind = (state, u, kind) => state.obstacles.some((o) => o.kind === kind && inside(u, o));
export const touches = (u, o, pose = u) => polyCircleOverlap(corners(pose, size(u)), o);

/**
 * Line of sight between two units, centre to centre. Rocks always block.
 * Forests and ruins block unless either unit stands in that very piece, or
 * either unit is on a hill (high ground sees over them).
 */
export function lineOfSight(state, a, b) {
  const high = onKind(state, a, "hill") || onKind(state, b, "hill");
  for (const o of state.obstacles) {
    if (!BLOCKS_LOS.has(o.kind)) continue;
    if (inside(a, o) || inside(b, o)) continue;
    if (o.kind !== "block" && high) continue;
    if (segmentHitsCircle(a, b, o)) return false;
  }
  return true;
}

/** Lava or marsh between two units (not under either) gives the defender +1 die. */
export function hazeBetween(state, a, b) {
  return state.obstacles.some((o) => HAZE.has(o.kind) && !inside(a, o) && !inside(b, o) && segmentHitsCircle(a, b, o));
}

export function concealed(state, u) {
  if (onKind(state, u, "hill")) return false;
  return u.abilities.includes("stealthy") || onKind(state, u, "thicket");
}

/** How many range bands this unit can see. */
export const visionOf = (state, u) => VISION + (onKind(state, u, "hill") ? 1 : 0);

/**
 * Ids of every unit player `pid` can see: all their own, plus each enemy that
 * one of their units has line of sight to within vision range (range 1 if the
 * enemy is concealed), plus any enemy that attacked this round (firing reveals).
 */
export function visibleTo(state, pid) {
  const live = state.units.filter((u) => !u.dead);
  const mine = live.filter((u) => u.owner === pid);
  const seen = new Set(mine.map((u) => u.id));
  for (const e of live) {
    if (e.owner === pid) continue;
    if (e.firedRound === state.round) {
      seen.add(e.id);
      continue;
    }
    const limit = concealed(state, e) ? CONCEALED_RANGE : null;
    for (const f of mine) {
      const band = rangeBand(polyDistance(corners(f, size(f)), corners(e, size(e))));
      if (band <= (limit ?? visionOf(state, f)) && lineOfSight(state, f, e)) {
        seen.add(e.id);
        break;
      }
    }
  }
  return seen;
}

/** Terrain placement for a new battle (deterministic from the game's RNG). */
export function layTerrain(rand) {
  const pieces = [];
  for (const kind of LAYOUT) {
    const [lo, hi] = RADIUS[kind];
    for (let tries = 0; tries < 300; tries++) {
      const r = lo + Math.floor(rand() * (hi - lo + 1));
      // Whole piece stays clear of every deployment zone (150 deep on each edge).
      const edge = 160 + r;
      const span = BOARD - 2 * edge;
      const o = { id: `o${pieces.length + 1}`, kind, r, x: edge + rand() * span, y: edge + rand() * span };
      if (pieces.every((q) => Math.hypot(q.x - o.x, q.y - o.y) > q.r + o.r + 30)) {
        pieces.push(o);
        break;
      }
    }
  }
  return pieces;
}
