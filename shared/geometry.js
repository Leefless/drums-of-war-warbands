// Board geometry shared by the server (authoritative) and the browser (previews).
// Units are millimetres on a 900 x 900 board (a 3' x 3' table).
// x grows right, y grows down. Heading h is in degrees, 0 = facing north (-y),
// positive = clockwise. A unit is an oriented square base centred on (x, y).

export const BOARD = 900;
export const RANGE_STEP = 100; // one range band
export const SPEED_STEP = 40; // length of a speed-1 straight template
export const BASE_SIZE = { small: 40, medium: 60, large: 80 };

const rad = (d) => (d * Math.PI) / 180;
export const norm = (d) => ((d % 360) + 360) % 360;
export const fwd = (h) => ({ x: Math.sin(rad(h)), y: -Math.cos(rad(h)) });
export const right = (h) => ({ x: Math.cos(rad(h)), y: Math.sin(rad(h)) });

// Template radii by speed. Banks sweep 45 degrees, turns sweep 90.
export const bankRadius = (s) => 80 + 50 * (s - 1);
export const turnRadius = (s) => 35 + 25 * (s - 1);

// ── Maneuver notation ────────────────────────────────────────────────────────
// "2BL:w" = speed 2, bank left, white. Types: X stop, S straight, BL/BR bank,
// TL/TR turn, A wheel-about (straight then face the rear), RF rift (straight
// teleport that ignores everything on the way). Defensive stances (speed 0) hold
// position and pivot in place: D keeps facing, DL/DR turn 90, DBL/DBR turn 45,
// DA faces the rear. Aim (M, ML, MBL, MBR, MR, MA) pivots the same way for ranged units.
export const MANEUVER_TYPES = ["TL", "BL", "S", "BR", "TR", "A", "RF", "X", "D", "DL", "DBL", "DBR", "DR", "DA", "M", "ML", "MBL", "MBR", "MR", "MA"];
export const STANCE_TURN = { D: 0, DL: -90, DBL: -45, DBR: 45, DR: 90, DA: 180 };
export const AIM_TURN = { M: 0, ML: -90, MBL: -45, MBR: 45, MR: 90, MA: 180 };
export const isStance = (man) => Object.hasOwn(STANCE_TURN, man.type);
export const isAim = (man) => Object.hasOwn(AIM_TURN, man.type);
/** Stance or Aim: the unit stays put and only pivots. */
export const isHold = (man) => isStance(man) || isAim(man);

export function parseManeuver(code) {
  const m = /^(\d)(X|S|BL|BR|TL|TR|A|RF|DBL|DBR|DL|DR|DA|D|MBL|MBR|ML|MR|MA|M):([bwr])$/.exec(code);
  if (!m) throw new Error(`bad maneuver ${code}`);
  return { code, speed: Number(m[1]), type: m[2], color: { b: "blue", w: "white", r: "red" }[m[3]] };
}

export function maneuverSegments(man, size) {
  const half = size / 2;
  const s = man.speed;
  switch (man.type) {
    case "X":
    case "D":
    case "DL":
    case "DBL":
    case "DBR":
    case "DR":
    case "DA":
    case "M":
    case "ML":
    case "MBL":
    case "MBR":
    case "MR":
    case "MA":
      return [];
    case "S":
    case "A":
    case "RF":
      return [{ kind: "line", len: size + SPEED_STEP * s }];
    case "BL":
    case "BR":
      return [
        { kind: "line", len: half },
        { kind: "arc", r: bankRadius(s), deg: man.type === "BR" ? 45 : -45 },
        { kind: "line", len: half },
      ];
    case "TL":
    case "TR":
      return [
        { kind: "line", len: half },
        { kind: "arc", r: turnRadius(s), deg: man.type === "TR" ? 90 : -90 },
        { kind: "line", len: half },
      ];
    default:
      throw new Error(`unknown maneuver type ${man.type}`);
  }
}

const segLen = (g) => (g.kind === "line" ? g.len : g.r * rad(Math.abs(g.deg)));

function advance(p, g, d) {
  if (g.kind === "line") {
    const f = fwd(p.h);
    return { x: p.x + f.x * d, y: p.y + f.y * d, h: p.h };
  }
  const phi = (d / g.r) * (180 / Math.PI) * Math.sign(g.deg);
  const side = right(p.h);
  const dir = Math.sign(g.deg); // +1 right, -1 left
  const c = { x: p.x + side.x * g.r * dir, y: p.y + side.y * g.r * dir };
  const h2 = p.h + phi;
  const side2 = right(h2);
  return { x: c.x - side2.x * g.r * dir, y: c.y - side2.y * g.r * dir, h: norm(h2) };
}

/** Pose after travelling fraction t (0..1) of a segment list from `start`. */
export function poseAlong(start, segs, t) {
  const total = segs.reduce((a, g) => a + segLen(g), 0);
  let left = total * t;
  let p = { x: start.x, y: start.y, h: start.h };
  for (const g of segs) {
    const L = segLen(g);
    if (left <= L) return advance(p, g, left);
    p = advance(p, g, L);
    left -= L;
  }
  return p;
}

/** Final pose of a maneuver at fraction t, including the wheel-about rotation at t = 1. */
export function maneuverPose(start, man, size, t = 1) {
  const p = poseAlong(start, maneuverSegments(man, size), t);
  if (man.type === "A" && t >= 1) p.h = norm(p.h + 180);
  if (isHold(man) && t >= 1) p.h = norm(p.h + (STANCE_TURN[man.type] ?? AIM_TURN[man.type]));
  return p;
}

// ── Bases ────────────────────────────────────────────────────────────────────
export function corners(p, size) {
  const f = fwd(p.h);
  const r = right(p.h);
  const a = size / 2;
  return [
    { x: p.x + f.x * a - r.x * a, y: p.y + f.y * a - r.y * a }, // front-left
    { x: p.x + f.x * a + r.x * a, y: p.y + f.y * a + r.y * a }, // front-right
    { x: p.x - f.x * a + r.x * a, y: p.y - f.y * a + r.y * a }, // rear-right
    { x: p.x - f.x * a - r.x * a, y: p.y - f.y * a - r.y * a }, // rear-left
  ];
}

function project(poly, ax) {
  let min = Infinity;
  let max = -Infinity;
  for (const v of poly) {
    const d = v.x * ax.x + v.y * ax.y;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return [min, max];
}

/** Separating-axis overlap test for two convex polygons. */
export function polysOverlap(A, B) {
  for (const poly of [A, B]) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const ax = { x: b.y - a.y, y: a.x - b.x };
      const [a0, a1] = project(A, ax);
      const [b0, b1] = project(B, ax);
      if (a1 <= b0 + 1e-9 || b1 <= a0 + 1e-9) return false;
    }
  }
  return true;
}

function pointSegDist(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Closest distance between two convex polygons (0 when they overlap). */
export function polyDistance(A, B) {
  if (polysOverlap(A, B)) return 0;
  let best = Infinity;
  for (const [P, Q] of [[A, B], [B, A]]) {
    for (const v of P) {
      for (let i = 0; i < Q.length; i++) best = Math.min(best, pointSegDist(v, Q[i], Q[(i + 1) % Q.length]));
    }
  }
  return best;
}

export function polyCircleOverlap(poly, c) {
  if (pointInPoly(c, poly)) return true;
  for (let i = 0; i < poly.length; i++) {
    if (pointSegDist(c, poly[i], poly[(i + 1) % poly.length]) < c.r) return true;
  }
  return false;
}

/** True when the segment a-b passes through circle c. */
export function segmentHitsCircle(a, b, c) {
  return pointSegDist(c, a, b) < c.r;
}

export function insideBoard(poly) {
  return poly.every((v) => v.x >= 0 && v.x <= BOARD && v.y >= 0 && v.y <= BOARD);
}

export function rangeBand(dist) {
  if (dist <= RANGE_STEP) return 1;
  return Math.ceil(dist / RANGE_STEP);
}

// ── Firing arcs ──────────────────────────────────────────────────────────────
// front / rear are 90-degree arcs; full is all-round (casters, monsters).
function angleTo(from, h, p) {
  const f = fwd(h);
  const vx = p.x - from.x;
  const vy = p.y - from.y;
  const L = Math.hypot(vx, vy) || 1;
  const cos = (f.x * vx + f.y * vy) / L;
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

export function inArc(attacker, arc, target, targetSize) {
  if (arc === "full") return true;
  const pts = [{ x: target.x, y: target.y }, ...corners(target, targetSize)];
  return pts.some((p) => {
    const a = angleTo(attacker, attacker.h, p);
    return arc === "front" ? a <= 45 : a >= 135;
  });
}
