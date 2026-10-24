// Canvas renderer for the battlefield: a painted tabletop with miniature-style
// tokens and an animation timeline (moves, attacks, damage, deaths).
// app.js owns game state and calls updateBoard(); a requestAnimationFrame loop
// here redraws continuously so rifts glow and moves play out smoothly.
import { BASE_SIZE, BOARD, corners, maneuverPose, maneuverSegments, parseManeuver, poseAlong, pointInPoly } from "/shared/geometry.js";
import { FACTIONS } from "/shared/factions.js";
import { zoneFor } from "/shared/engine.js";
import { TERRAIN, visionOf } from "/shared/terrain.js";
import { EMBLEMS, ICONS, UNIT_ICON, artImage, artList, path2d } from "/art.js";

// Battlefield side for the battle being drawn (bigger budgets play on bigger boards).
let SIZE = BOARD;

const DISPLAY = '"Cinzel", "Trajan Pro", Georgia, serif';
const PARCHMENT = "#EFE3C6";
const GOLD = "#C9A227";

// ── Small utilities ──────────────────────────────────────────────────────────
function rng(seed) {
  let t = seed >>> 0 || 1;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex, amt) {
  // amt > 0 lightens toward white, amt < 0 darkens toward black
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(amt > 0 ? c + (255 - c) * amt : c * (1 + amt)));
  return `rgb(${ch.join(",")})`;
}

const angDiff = (a, b) => ((b - a + 540) % 360) - 180;
const lerpAngle = (a, b, f) => a + angDiff(a, b) * f;
const ease = (f) => (f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2);
const clamp01 = (f) => Math.max(0, Math.min(1, f));

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPath24(ctx, d, x, y, size, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(size / 24, size / 24);
  ctx.translate(-12, -12);
  ctx.fill(path2d(d), "evenodd");
  ctx.restore();
}

export function playerColor(state, pid) {
  const p = state.players.find((x) => x.id === pid);
  return p?.faction ? FACTIONS[p.faction].color : "#9C8F74";
}

// ── Canvas sizing and hit-testing ────────────────────────────────────────────
export function sizeCanvas(canvas) {
  const box = canvas.parentElement.getBoundingClientRect();
  const side = Math.max(200, Math.floor(Math.min(box.width, box.height) - 24)); // minus .boardwrap padding
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(side * dpr)) {
    canvas.style.width = `${side}px`;
    canvas.style.height = `${side}px`;
    canvas.width = Math.round(side * dpr);
    canvas.height = Math.round(side * dpr);
  }
  return side;
}

export function toBoard(canvas, ev) {
  const r = canvas.getBoundingClientRect();
  return { x: ((ev.clientX - r.left) / r.width) * SIZE, y: ((ev.clientY - r.top) / r.height) * SIZE };
}

export function unitAt(state, pt) {
  return [...state.units].reverse().find((u) => !u.dead && pointInPoly(pt, corners(u, BASE_SIZE[u.base])));
}

// ── Terrain painting (static, cached per battlefield and resolution) ─────────
let terrain = null; // { key, canvas, rifts }

function seedOf(state) {
  let h = 2166136261;
  for (const o of state.obstacles) for (const v of [o.x, o.y, o.r]) h = Math.imul(h ^ Math.round(v * 10), 16777619);
  return h >>> 0;
}

function blob(g, x, y, r, color, alpha) {
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  grd.addColorStop(0, `${color}${alpha}`);
  grd.addColorStop(1, `${color}00`);
  g.fillStyle = grd;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

function paintTerrain(state, px) {
  const c = document.createElement("canvas");
  c.width = c.height = px;
  const g = c.getContext("2d");
  g.setTransform(px / SIZE, 0, 0, px / SIZE, 0, 0);
  const R = rng(seedOf(state));

  // Ground: a painted battlefield map (one per battle, chosen by seed), else the
  // tiling texture, else procedural meadow. Mottling is layered on top either way.
  g.fillStyle = "#566F3A";
  g.fillRect(0, 0, SIZE, SIZE);
  const map = pickArt(state, "ground/", 0);
  const ground = map ? null : artImage("ground.jpg");
  if (map) {
    g.drawImage(map, 0, 0, SIZE, SIZE);
  } else if (ground) {
    const pat = g.createPattern(ground, "repeat");
    pat.setTransform(new DOMMatrix().scale(320 / ground.width));
    g.fillStyle = pat;
    g.fillRect(0, 0, SIZE, SIZE);
  }
  const greens = ["#4A6331", "#5D7840", "#6A8347", "#43592B", "#768A4C", "#52693A"];
  for (let i = 0; i < (map ? 30 : ground ? 90 : 420); i++) blob(g, R() * SIZE, R() * SIZE, 15 + R() * 85, greens[(R() * greens.length) | 0], "55");
  for (let i = 0; i < 9; i++) blob(g, R() * SIZE, R() * SIZE, 40 + R() * 70, "#7B6643", "40");

  // Winding dirt roads (painted maps bring their own character, so one faint track there).
  g.lineCap = "round";
  for (let i = 0; i < (map ? 0 : 2); i++) {
    const vertical = R() < 0.5;
    const a = R() * 600 + 150;
    const b = R() * 600 + 150;
    const p0 = vertical ? [a, -20] : [-20, a];
    const p3 = vertical ? [b, SIZE + 20] : [SIZE + 20, b];
    const c1 = [150 + R() * 600, 150 + R() * 600];
    const c2 = [150 + R() * 600, 150 + R() * 600];
    for (const [w, col] of [[40, "#6E5A3B55"], [28, "#8A7550"], [12, "#9A865E99"]]) {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(...p0);
      g.bezierCurveTo(...c1, ...c2, ...p3);
      g.stroke();
    }
  }

  // Grass tufts, wildflowers, pebbles.
  const tuft = ["#3E5428", "#7D9450", "#8FA35A", "#4F6A33"];
  g.lineWidth = 1;
  for (let i = 0; i < (map ? 600 : 3200); i++) {
    const x = R() * SIZE;
    const y = R() * SIZE;
    const a = -Math.PI / 2 + (R() - 0.5) * 0.9;
    const L = 3 + R() * 4;
    g.strokeStyle = tuft[(R() * tuft.length) | 0];
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L);
    g.stroke();
  }
  const petals = ["#E8E2C8", "#E3C75A", "#B9A0D0"];
  for (let i = 0; i < 170; i++) {
    g.fillStyle = petals[(R() * 3) | 0];
    g.beginPath();
    g.arc(R() * SIZE, R() * SIZE, 1.1, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 220; i++) {
    g.fillStyle = "#8A8577AA";
    g.beginPath();
    g.ellipse(R() * SIZE, R() * SIZE, 1 + R() * 1.6, 0.8 + R(), R() * 3, 0, Math.PI * 2);
    g.fill();
  }

  paintDecor(g, state, R, px);

  const rifts = [];
  for (const [n, o] of state.obstacles.entries()) {
    const sprite = pickArt(state, `terrain/${o.kind}-`, n + 1) || artImage(`terrain/${o.kind}.png`);
    if (sprite) {
      drawSprite(g, sprite, o.x, o.y, o.r * (o.kind === "hill" ? 2.1 : 2.25), R() * Math.PI * 2, px);
      if (o.kind === "rift" || o.kind === "lava") rifts.push({ o, cracks: [], phase: R() * 6 });
    } else if (o.kind === "hill") paintHill(g, o);
    else if (o.kind === "lava") rifts.push(paintLava(g, o, R));
    else if (o.kind === "marsh") paintMarsh(g, o, R);
    else if (o.kind === "block") paintBlock(g, o, R, px);
    else if (o.kind === "ruins") paintRuins(g, o, R);
    else if (o.kind === "thicket") paintThicket(g, o, R);
    else rifts.push(paintRift(g, o, R));
  }

  // Faint range grid, edge vignette, and the table frame.
  g.strokeStyle = "rgba(20, 30, 10, 0.16)";
  g.lineWidth = 1;
  for (let i = 100; i < SIZE; i += 100) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, SIZE);
    g.moveTo(0, i);
    g.lineTo(SIZE, i);
    g.stroke();
  }
  // Warm key light from the upper left, cool falloff to the lower right.
  const light = g.createLinearGradient(0, 0, SIZE, SIZE);
  light.addColorStop(0, "rgba(255, 220, 160, 0.14)");
  light.addColorStop(0.55, "rgba(255, 220, 160, 0)");
  light.addColorStop(1, "rgba(20, 30, 60, 0.18)");
  g.fillStyle = light;
  g.fillRect(0, 0, SIZE, SIZE);
  const v = g.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.35, SIZE / 2, SIZE / 2, SIZE * 0.75);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.42)");
  g.fillStyle = v;
  g.fillRect(0, 0, SIZE, SIZE);
  g.strokeStyle = "#2A1F12";
  g.lineWidth = 6;
  g.strokeRect(3, 3, SIZE - 6, SIZE - 6);
  return { canvas: c, rifts };
}

// ── Painted art helpers ──────────────────────────────────────────────────────
/** Deterministically pick one loaded variant among files with this prefix. */
function pickArt(state, prefix, salt) {
  const list = artList(prefix);
  if (!list.length) return null;
  const k = (seedOf(state) + salt * 2654435761) >>> 0;
  return artImage(list[k % list.length]);
}

// Painted sprites carry transparent margins; measure the opaque part once so
// the visible piece, not the image square, matches the rules footprint.
const trims = new WeakMap();
function trimOf(img) {
  if (trims.has(img)) return trims.get(img);
  const N = 96;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0, N, N);
  const d = g.getImageData(0, 0, N, N).data;
  let x0 = N, y0 = N, x1 = 0, y1 = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (d[(y * N + x) * 4 + 3] > 40) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  const t = x1 > x0 ? { cx: (x0 + x1 + 1) / 2 / N, cy: (y0 + y1 + 1) / 2 / N, size: Math.max(x1 - x0 + 1, y1 - y0 + 1) / N } : { cx: 0.5, cy: 0.5, size: 1 };
  trims.set(img, t);
  return t;
}

/** Draw a sprite so its opaque part spans `size` board units, with a cast shadow. */
function drawSprite(g, img, x, y, size, rot, px) {
  const t = trimOf(img);
  const full = size / t.size;
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.shadowColor = "rgba(0, 0, 0, 0.5)";
  g.shadowBlur = 14 * (px / SIZE);
  g.shadowOffsetX = 5 * (px / SIZE);
  g.shadowOffsetY = 7 * (px / SIZE);
  g.drawImage(img, -full * t.cx, -full * t.cy, full, full);
  g.restore();
}

/** Small flat ground details, away from obstacles: purely decorative. */
function paintDecor(g, state, R, px) {
  const list = artList("decor/");
  if (!list.length) return;
  for (let i = 0, placed = 0; i < 60 && placed < 14; i++) {
    const x = 60 + R() * (SIZE - 120);
    const y = 60 + R() * (SIZE - 120);
    if (state.obstacles.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + 45)) continue;
    const img = artImage(list[(R() * list.length) | 0]);
    if (!img) continue;
    g.globalAlpha = 0.9;
    drawSprite(g, img, x, y, 22 + R() * 18, R() * Math.PI * 2, px);
    g.globalAlpha = 1;
    placed++;
  }
}

function stoneBlock(g, x, y, w, h, ang, R) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.fillRect(-w / 2 + 2, -h / 2 + 2.5, w, h);
  g.fillStyle = ["#9B9584", "#8A8474", "#A7A190", "#7F796B"][(R() * 4) | 0];
  g.fillRect(-w / 2, -h / 2, w, h);
  g.fillStyle = "rgba(255,255,240,0.2)";
  g.fillRect(-w / 2, -h / 2, w, 1.6);
  g.strokeStyle = "rgba(30,25,15,0.55)";
  g.lineWidth = 0.8;
  g.strokeRect(-w / 2, -h / 2, w, h);
  g.restore();
}

function paintRuins(g, o, R) {
  blob(g, o.x, o.y, o.r * 1.1, "#7A7262", "CC");
  // A broken curtain wall following most of the circle, with gaps.
  const a0 = R() * Math.PI * 2;
  const span = Math.PI * (1.1 + R() * 0.7);
  const wallR = o.r * 0.74;
  for (let a = a0; a < a0 + span;) {
    const bw = 9 + R() * 6;
    const bh = 7 + R() * 3;
    const tilt = a + Math.PI / 2 + (R() - 0.5) * 0.15;
    stoneBlock(g, o.x + Math.cos(a) * wallR, o.y + Math.sin(a) * wallR, bw, bh, tilt, R);
    if (R() < 0.55) stoneBlock(g, o.x + Math.cos(a) * (wallR - bh * 0.95), o.y + Math.sin(a) * (wallR - bh * 0.95), bw * 0.9, bh, tilt, R);
    a += (bw / wallR) * (1.03 + (R() < 0.14 ? 1.6 : 0));
  }
  // Fallen masonry and a pillar stump in the middle.
  for (let i = 0; i < 7; i++) {
    const a = R() * Math.PI * 2;
    const d = R() * o.r * 0.5;
    stoneBlock(g, o.x + Math.cos(a) * d, o.y + Math.sin(a) * d, 5 + R() * 6, 4 + R() * 4, R() * 3, R);
  }
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.beginPath();
  g.arc(o.x + 3, o.y + 3, o.r * 0.16, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#A39D8C";
  g.beginPath();
  g.arc(o.x, o.y, o.r * 0.16, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "rgba(30,25,15,0.6)";
  g.stroke();
}

function paintHill(g, o) {
  // Contour rings, lit from the upper left.
  for (let i = 0; i < 4; i++) {
    const r = o.r * (1 - i * 0.22);
    const grd = g.createRadialGradient(o.x - r * 0.35, o.y - r * 0.35, r * 0.1, o.x, o.y, r);
    grd.addColorStop(0, `rgba(150, 175, 95, ${0.35 + i * 0.1})`);
    grd.addColorStop(1, `rgba(40, 55, 25, ${0.35 + i * 0.05})`);
    g.fillStyle = grd;
    g.beginPath();
    g.arc(o.x + i * 3, o.y + i * 3, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(30, 40, 15, 0.35)";
    g.stroke();
  }
}

function paintLava(g, o, R) {
  const grd = g.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
  grd.addColorStop(0, "#FFD27A");
  grd.addColorStop(0.45, "#F06A1E");
  grd.addColorStop(0.8, "#7A1E0C");
  grd.addColorStop(1, "#1A0E0A");
  g.fillStyle = grd;
  g.beginPath();
  g.arc(o.x, o.y, o.r, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 9; i++) {
    g.fillStyle = "rgba(30, 15, 10, 0.7)";
    g.beginPath();
    g.ellipse(o.x + (R() - 0.5) * o.r, o.y + (R() - 0.5) * o.r, 4 + R() * 9, 3 + R() * 6, R() * 3, 0, Math.PI * 2);
    g.fill();
  }
  return { o, cracks: [], phase: R() * 6 };
}

function paintMarsh(g, o, R) {
  blob(g, o.x, o.y, o.r * 1.1, "#3F4A30", "DD");
  g.fillStyle = "rgba(40, 70, 75, 0.75)";
  g.beginPath();
  g.ellipse(o.x, o.y, o.r * 0.75, o.r * 0.55, R() * 3, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#8A9A55";
  g.lineWidth = 1.2;
  for (let i = 0; i < 40; i++) {
    const a = R() * Math.PI * 2;
    const d = o.r * (0.6 + R() * 0.4);
    const x = o.x + Math.cos(a) * d;
    const y = o.y + Math.sin(a) * d;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (R() - 0.5) * 3, y - 6 - R() * 6);
    g.stroke();
  }
}

function paintBlock(g, o, R, px) {
  g.save();
  g.shadowColor = "rgba(0,0,0,0.55)";
  g.shadowBlur = 12 * (px / SIZE);
  g.shadowOffsetX = 5 * (px / SIZE);
  g.shadowOffsetY = 7 * (px / SIZE);
  g.fillStyle = "#77736A";
  g.beginPath();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const d = o.r * (0.85 + R() * 0.15);
    i ? g.lineTo(o.x + Math.cos(a) * d, o.y + Math.sin(a) * d) : g.moveTo(o.x + Math.cos(a) * d, o.y + Math.sin(a) * d);
  }
  g.closePath();
  g.fill();
  g.restore();
  g.fillStyle = "rgba(255, 250, 235, 0.18)";
  g.beginPath();
  g.arc(o.x - o.r * 0.25, o.y - o.r * 0.25, o.r * 0.45, 0, Math.PI * 2);
  g.fill();
}

function paintThicket(g, o, R) {
  blob(g, o.x, o.y, o.r * 1.1, "#33481F", "DD");
  const trees = [];
  for (let tries = 0; tries < 200 && trees.length < 8 + ((o.r / 6) | 0); tries++) {
    const a = R() * Math.PI * 2;
    const d = Math.sqrt(R()) * o.r * 0.72;
    trees.push({ x: o.x + Math.cos(a) * d, y: o.y + Math.sin(a) * d, s: 9 + R() * 7 });
  }
  trees.sort((p, q) => p.y - q.y);
  const leaf = ["#2F4A22", "#365526", "#2A421D", "#3D5F2A", "#44682E"];
  for (const t of trees) {
    g.fillStyle = "rgba(0,0,0,0.32)";
    g.beginPath();
    g.ellipse(t.x + 5, t.y + 6, t.s, t.s * 0.85, 0, 0, Math.PI * 2);
    g.fill();
    const col = leaf[(R() * leaf.length) | 0];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + R();
      g.fillStyle = col;
      g.beginPath();
      g.arc(t.x + Math.cos(a) * t.s * 0.45, t.y + Math.sin(a) * t.s * 0.45, t.s * 0.62, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "rgba(170,200,115,0.22)";
    g.beginPath();
    g.arc(t.x - t.s * 0.3, t.y - t.s * 0.3, t.s * 0.45, 0, Math.PI * 2);
    g.fill();
  }
}

function paintRift(g, o, R) {
  const grd = g.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r * 1.15);
  grd.addColorStop(0, "#140C0B");
  grd.addColorStop(0.55, "#2E211BDD");
  grd.addColorStop(1, "#3A2A2000");
  g.fillStyle = grd;
  g.beginPath();
  g.arc(o.x, o.y, o.r * 1.15, 0, Math.PI * 2);
  g.fill();
  // Jagged cracks radiating from the seam.
  const cracks = [];
  const branch = (x, y, a, len, depth) => {
    const pts = [{ x, y }];
    let cx = x;
    let cy = y;
    const steps = 4 + ((R() * 3) | 0);
    for (let i = 0; i < steps; i++) {
      a += (R() - 0.5) * 0.9;
      cx += (Math.cos(a) * len) / steps;
      cy += (Math.sin(a) * len) / steps;
      pts.push({ x: cx, y: cy });
      if (depth < 1 && R() < 0.25) branch(cx, cy, a + (R() < 0.5 ? 0.8 : -0.8), len * 0.4, depth + 1);
    }
    cracks.push(pts);
  };
  const n = 4 + ((R() * 3) | 0);
  for (let i = 0; i < n; i++) branch(o.x, o.y, (i / n) * Math.PI * 2 + R() * 0.6, o.r * (0.7 + R() * 0.25), 0);
  g.strokeStyle = "#0B0605";
  g.lineCap = "round";
  for (const pts of cracks) {
    g.lineWidth = 4;
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.stroke();
  }
  return { o, cracks, phase: R() * 6 };
}

function ensureTerrain(state, px) {
  const paths = ["ground.jpg", "terrain/ruins.png", "terrain/thicket.png", "terrain/rift.png", ...artList("ground/"), ...artList("terrain/"), ...artList("decor/")];
  const art = paths.map((p) => (artImage(p) ? 1 : 0)).join("");
  const key = `${seedOf(state)}|${px}|${SIZE}|${art}`;
  if (terrain?.key !== key) terrain = { key, ...paintTerrain(state, px) };
  return terrain;
}

// ── Animation timeline ───────────────────────────────────────────────────────
const anim = { moves: [], effects: [], floaters: [], deaths: [], busyUntil: 0 };
let prevUnits = null;
let prevAttackKey = null;
let current = { canvas: null, state: null, opts: {} };

function polyLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return L;
}

function pointAlong(pts, f) {
  let left = polyLength(pts) * f;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= L || i === pts.length - 1) {
      const t = L ? Math.min(1, left / L) : 1;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dir: (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI, moving: L > 0.01 };
    }
    left -= L;
  }
  return { ...pts[pts.length - 1], dir: 0, moving: false };
}

function buildPath(prev, u) {
  const end = { x: u.x, y: u.y };
  if (u.trail && u.trail.length > 1) {
    let best = 0;
    let bd = Infinity;
    u.trail.forEach((p, i) => {
      const d = Math.hypot(p.x - prev.x, p.y - prev.y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return [{ x: prev.x, y: prev.y }, ...u.trail.slice(best + 1), end];
  }
  return [{ x: prev.x, y: prev.y }, end];
}

/** Compare a new server state with the last one and queue the animations it implies. */
function diffState(state) {
  const now = performance.now();
  if (anim.busyUntil > now + 4000) {
    // Fell too far behind the game (rapid-fire updates): skip ahead to the present.
    for (const k of ["moves", "effects", "floaters", "deaths"]) anim[k] = [];
    anim.busyUntil = now;
  }
  let t = Math.max(now, anim.busyUntil);
  const hpOf = (u) => u.wounds + u.ward;
  if (prevUnits) {
    const moved = state.units
      .filter((u) => {
        const p = prevUnits.get(u.id);
        return p && !p.dead && (Math.hypot(p.x - u.x, p.y - u.y) > 0.5 || Math.abs(angDiff(p.h, u.h)) > 0.5);
      })
      .sort((a, b) => a.init - b.init);
    // Several units revealed at once play in initiative order, compressed to about 3s.
    const dur = moved.length > 4 ? Math.max(280, 2800 / moved.length) : 700;
    for (const u of moved) {
      const p = prevUnits.get(u.id);
      anim.moves.push({ uid: u.id, path: buildPath(p, u), h0: p.h, h1: u.h, t0: t, t1: t + dur });
      t += dur * 0.9;
    }
  }

  const A = state.lastAttack;
  const key = A ? JSON.stringify([state.round, A.attacker, A.target, A.atk, A.def]) : null;
  let attackTarget = null;
  if (prevUnits && key && key !== prevAttackKey) {
    const a = state.units.find((u) => u.id === A.attacker);
    const b = state.units.find((u) => u.id === A.target);
    if (a && b) {
      const w = a.weapons[A.weapon];
      const kind = w.arc === "full" ? "magic" : A.range > 1 || w.range[1] > 1 ? "missile" : "melee";
      const color = { calamity: "#FF6A3D", umbral: "#B79CFF", sylvan: "#BFF0D0" }[a.faction] || "#CFE6FF";
      anim.effects.push({ kind, color, from: { x: a.x, y: a.y }, to: { x: b.x, y: b.y }, t0: t, t1: t + 750 });
      const dmg = A.result.strikes + A.result.rends;
      anim.floaters.push({ x: b.x, y: b.y, text: dmg ? `-${dmg}` : "Parried", color: dmg ? "#F08A6E" : PARCHMENT, t0: t + 550, t1: t + 1900 });
      if (dmg) anim.effects.push({ kind: "hit", to: { x: b.x, y: b.y }, size: BASE_SIZE[b.base], t0: t + 550, t1: t + 900 });
      attackTarget = b.id;
      t += 800;
    }
  }
  prevAttackKey = key;

  if (prevUnits) {
    for (const u of state.units) {
      const p = prevUnits.get(u.id);
      if (!p) continue;
      const lost = p.hp - hpOf(u);
      if (lost > 0 && u.id !== attackTarget) anim.floaters.push({ x: u.x, y: u.y, text: `-${lost}`, color: "#F08A6E", t0: t, t1: t + 1300 });
      if (u.dead && !p.dead) anim.deaths.push({ uid: u.id, t0: t + 150, t1: t + 1150 });
    }
  }
  anim.busyUntil = t;
  prevUnits = new Map(state.units.map((u) => [u.id, { x: u.x, y: u.y, h: u.h, dead: u.dead, hp: hpOf(u) }]));
}

/** Where to draw a unit right now, accounting for queued and running moves. */
function displayPose(u, now) {
  const m = anim.moves.find((x) => x.uid === u.id && x.t1 > now);
  if (!m) return { x: u.x, y: u.y, h: u.h };
  if (now < m.t0) return { x: m.path[0].x, y: m.path[0].y, h: m.h0 };
  const f = ease(clamp01((now - m.t0) / (m.t1 - m.t0)));
  const p = pointAlong(m.path, f);
  let h = lerpAngle(m.h0, m.h1, f);
  // Follow the path's tangent when it agrees with the unit's facing (turns), not
  // when it slides sideways (Sidestep).
  if (p.moving && Math.min(Math.abs(angDiff(p.dir, m.h0)), Math.abs(angDiff(p.dir, m.h1))) < 100) h = p.dir;
  if (f > 0.85) h = lerpAngle(h, m.h1, (f - 0.85) / 0.15);
  return { x: p.x, y: p.y, h };
}

// ── Public API ───────────────────────────────────────────────────────────────
/** Forget the last battle's units and animations (unit ids repeat across battles). */
export function resetBoard() {
  prevUnits = null;
  prevAttackKey = null;
  for (const k of ["moves", "effects", "floaters", "deaths"]) anim[k] = [];
  anim.busyUntil = 0;
  current = { canvas: null, state: null, opts: {} };
}
/**
 * opts: { selected, active, ghost: {uid, code}, attackLine: {from, to}, highlight: Set<uid>, zones: bool }
 */
export function updateBoard(canvas, state, opts = {}) {
  SIZE = state.board || BOARD;
  if (state !== current.state) diffState(state);
  current = { canvas, state, opts };
}

let lastFrame = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  if (ts - lastFrame < 30) return; // about 30 fps is plenty for a tabletop
  lastFrame = ts;
  const { canvas, state, opts } = current;
  if (!canvas || !state || !canvas.isConnected) return;
  render(canvas, state, opts, ts);
}
requestAnimationFrame(frame);

function render(canvas, state, opts, now) {
  const ctx = canvas.getContext("2d");
  const k = canvas.width / SIZE;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(ensureTerrain(state, canvas.width).canvas, 0, 0);
  ctx.setTransform(k, 0, 0, k, 0, 0);

  drawRiftGlow(ctx, k, now);
  for (const o of state.obstacles) drawFootprint(ctx, o);
  if (opts.zones) drawZones(ctx, state);
  drawTrails(ctx, state);

  const sel = state.units.find((u) => u.id === opts.selected && !u.dead);
  if (sel) drawReach(ctx, { ...sel, ...displayPose(sel, now) });
  for (const g of opts.ghosts || []) {
    const u = state.units.find((x) => x.id === g.uid);
    if (!u) continue;
    ctx.save();
    ctx.globalAlpha = 0.5;
    drawGhost(ctx, u, g.code);
    ctx.restore();
  }
  if (opts.ghost) {
    const u = state.units.find((x) => x.id === opts.ghost.uid);
    if (u) drawGhost(ctx, u, opts.ghost.code);
  }

  // A unit that died this update keeps drawing until its move and death play out.
  const dyingIds = new Set(anim.deaths.map((d) => d.uid));
  for (const u of state.units) {
    if (u.dead && !dyingIds.has(u.id)) continue;
    const d = anim.deaths.find((x) => x.uid === u.id);
    if (d && now >= d.t0) {
      const f = clamp01((now - d.t0) / (d.t1 - d.t0));
      drawToken(ctx, k, u, u, {}, now, 1 - f, 1 - 0.4 * f);
      drawSmoke(ctx, u, f);
    } else {
      drawToken(ctx, k, u, displayPose(u, now), opts, now, 1, 1);
    }
  }

  if (opts.fog) drawFog(ctx, canvas, state);
  if (opts.marker) drawChargeBanner(ctx, opts.marker, now);
  if (opts.attackLine) drawAttackLine(ctx, state, opts.attackLine, now);
  drawEffects(ctx, k, now);
  drawFloaters(ctx, now);

  // Drop finished animations.
  anim.moves = anim.moves.filter((m) => m.t1 > now);
  anim.effects = anim.effects.filter((e) => e.t1 > now);
  anim.floaters = anim.floaters.filter((e) => e.t1 > now);
  anim.deaths = anim.deaths.filter((e) => e.t1 > now);
}

// ── Layers ───────────────────────────────────────────────────────────────────
function strokePolyline(ctx, pts) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
}

function drawRiftGlow(ctx, k, now) {
  if (!terrain) return;
  ctx.save();
  ctx.lineCap = "round";
  for (const r of terrain.rifts) {
    const pulse = 0.55 + 0.35 * Math.sin(now / 420 + r.phase);
    if (!r.cracks.length) {
      ctx.globalCompositeOperation = "lighter";
      const grd = ctx.createRadialGradient(r.o.x, r.o.y, 0, r.o.x, r.o.y, r.o.r);
      grd.addColorStop(0, `rgba(255, 120, 60, ${0.35 * pulse})`);
      grd.addColorStop(1, "rgba(255, 80, 40, 0)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(r.o.x, r.o.y, r.o.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.shadowColor = "#FF5A2C";
    ctx.shadowBlur = 10 * k;
    ctx.strokeStyle = `rgba(255, 110, 60, ${pulse})`;
    ctx.lineWidth = 2.2;
    for (const pts of r.cracks) strokePolyline(ctx, pts);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(255, 215, 170, ${pulse * 0.8})`;
    ctx.lineWidth = 0.7;
    for (const pts of r.cracks) strokePolyline(ctx, pts);
    // Embers drifting up out of the seam.
    for (let i = 0; i < 7; i++) {
      const cyc = ((now / 1000 + i * 0.37 + r.phase) % 2.2) / 2.2;
      const ang = i * 2.1 + r.phase;
      const x = r.o.x + Math.cos(ang) * r.o.r * 0.4 + Math.sin(now / 600 + i) * 3;
      const y = r.o.y + Math.sin(ang) * r.o.r * 0.3 - cyc * 26;
      ctx.fillStyle = `rgba(255, 170, 90, ${(1 - cyc) * 0.8})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// Fog of war: darkness outside what this player's units can see (vision is
// computed on the server; this is the matching visual).
let fogLayer = null;
function drawFog(ctx, canvas, state) {
  if (!fogLayer || fogLayer.width !== canvas.width) {
    fogLayer = document.createElement("canvas");
    fogLayer.width = fogLayer.height = canvas.width;
  }
  const k = canvas.width / SIZE;
  const g = fogLayer.getContext("2d");
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "source-over";
  g.clearRect(0, 0, fogLayer.width, fogLayer.height);
  g.fillStyle = "rgba(6, 8, 12, 0.62)";
  g.fillRect(0, 0, fogLayer.width, fogLayer.height);
  g.setTransform(k, 0, 0, k, 0, 0);
  g.globalCompositeOperation = "destination-out";
  for (const u of state.units) {
    if (u.dead || u.owner !== state.you) continue;
    const r = BASE_SIZE[u.base] / 2 + visionOf(state, u) * 100;
    const grd = g.createRadialGradient(u.x, u.y, r * 0.75, u.x, u.y, r);
    grd.addColorStop(0, "rgba(0,0,0,1)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.beginPath();
    g.arc(u.x, u.y, r, 0, Math.PI * 2);
    g.fill();
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(fogLayer, 0, 0);
  ctx.restore();
}

/** Terrain under a board point, for tooltips. */
export function terrainAt(state, pt) {
  return state.obstacles.find((o) => Math.hypot(o.x - pt.x, o.y - pt.y) < o.r);
}

function drawFootprint(ctx, o) {
  // The obstacle's rules footprint, so players can judge contact.
  ctx.save();
  ctx.setLineDash([4, 5]);
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
  ctx.beginPath();
  ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = "rgba(240, 230, 200, 0.6)";
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = `600 9px ${DISPLAY}`;
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  const label = (TERRAIN[o.kind]?.name || o.kind).toUpperCase();
  ctx.fillText(label, o.x + 0.8, o.y + o.r + 11.8);
  ctx.fillStyle = "rgba(240, 230, 200, 0.85)";
  ctx.fillText(label, o.x, o.y + o.r + 11);
  ctx.restore();
}

function drawZones(ctx, state) {
  for (const p of state.players) {
    const z = zoneFor(p.seat, SIZE);
    const col = playerColor(state, p.id);
    ctx.fillStyle = `${col}26`;
    ctx.fillRect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0);
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = `${col}CC`;
    ctx.lineWidth = 2;
    ctx.strokeRect(z.x0 + 1, z.y0 + 1, z.x1 - z.x0 - 2, z.y1 - z.y0 - 2);
    ctx.setLineDash([]);
    // Label sits just outside the zone's inner edge, clear of the tokens.
    const cx = (z.x0 + z.x1) / 2;
    const cy = (z.y0 + z.y1) / 2;
    const at = { south: [cx, z.y0 - 8, 0], north: [cx, z.y1 + 18, 0], west: [z.x1 + 18, cy, Math.PI / 2], east: [z.x0 - 8, cy, Math.PI / 2] }[z.edge];
    ctx.save();
    ctx.translate(at[0], at[1]);
    ctx.rotate(at[2]);
    ctx.font = `700 12px ${DISPLAY}`;
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(10, 8, 5, 0.6)";
    ctx.strokeText(`${p.name.toUpperCase()} DEPLOYS`, 0, 0);
    ctx.fillStyle = col;
    ctx.fillText(`${p.name.toUpperCase()} DEPLOYS`, 0, 0);
    ctx.restore();
  }
}

function drawTrails(ctx, state) {
  ctx.save();
  ctx.setLineDash([2, 6]);
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(25, 18, 8, 0.55)";
  ctx.lineWidth = 3;
  for (const u of state.units) if (u.trail && u.trail.length > 1) strokePolyline(ctx, u.trail);
  ctx.restore();
}

function drawReach(ctx, u) {
  const half = BASE_SIZE[u.base] / 2;
  const maxR = Math.max(...u.weapons.map((w) => w.range[1]));
  ctx.save();
  for (let r = 1; r <= maxR; r++) {
    ctx.strokeStyle = `rgba(201, 162, 39, ${0.7 - r * 0.13})`;
    ctx.lineWidth = r === 1 ? 1.6 : 1.1;
    ctx.beginPath();
    ctx.arc(u.x, u.y, half + r * 100, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = `700 10px ${DISPLAY}`;
    ctx.fillStyle = GOLD;
    ctx.textAlign = "center";
    ctx.fillText(String(r), u.x, u.y - half - r * 100 + 12);
  }
  if (u.weapons.some((w) => w.arc === "front")) {
    const len = half + maxR * 100;
    ctx.strokeStyle = "rgba(201, 162, 39, 0.55)";
    ctx.fillStyle = "rgba(201, 162, 39, 0.06)";
    ctx.beginPath();
    ctx.moveTo(u.x, u.y);
    for (let a = -45; a <= 45; a += 5) {
      const r = ((u.h + a) * Math.PI) / 180;
      ctx.lineTo(u.x + Math.sin(r) * len, u.y - Math.cos(r) * len);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** The Charge order's rally banner: a pulsing ring with a war banner the player can drag. */
function drawChargeBanner(ctx, p, now) {
  const pulse = 0.5 + 0.5 * Math.sin(now / 300);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.beginPath();
  ctx.arc(0, 0, 22 + pulse * 6, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(225, 110, 80, ${0.35 + 0.4 * pulse})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 6;
  // Pole.
  ctx.fillStyle = "#2A1F12";
  ctx.fillRect(-2, -26, 4, 34);
  // Pennant.
  ctx.beginPath();
  ctx.moveTo(2, -26);
  ctx.lineTo(24, -19);
  ctx.lineTo(2, -11);
  ctx.closePath();
  ctx.fillStyle = "#B8402E";
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.arc(0, -27, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = "600 10px Cinzel, Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#F7EBCB";
  ctx.fillText("CHARGE", 0, 20);
  ctx.restore();
}

function drawGhost(ctx, u, code) {
  const man = parseManeuver(code);
  const size = BASE_SIZE[u.base];
  const segs = maneuverSegments(man, size);
  ctx.save();
  // The template: a parchment band like a physical maneuver template.
  if (segs.length) {
    ctx.beginPath();
    for (let t = 0; t <= 1.0001; t += 0.04) {
      const p = poseAlong(u, segs, Math.min(1, t));
      t ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
    }
    ctx.lineCap = "butt";
    ctx.strokeStyle = "rgba(239, 227, 198, 0.38)";
    ctx.lineWidth = size * 0.42;
    ctx.stroke();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const end = maneuverPose(u, man, size, 1);
  ctx.translate(end.x, end.y);
  ctx.rotate((end.h * Math.PI) / 180);
  roundRect(ctx, -size / 2, -size / 2, size, size, 5);
  ctx.fillStyle = "rgba(201, 162, 39, 0.18)";
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.moveTo(0, -size / 2 + 4);
  ctx.lineTo(7, -size / 2 + 13);
  ctx.lineTo(-7, -size / 2 + 13);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawToken(ctx, k, u, pose, opts, now, alpha, scale) {
  const size = BASE_SIZE[u.base] * scale;
  const half = size / 2;
  const col = FACTIONS[u.faction].color;
  const isSel = opts.selected === u.id;
  const isActive = opts.active === u.id;
  const isHi = opts.highlight?.has(u.id);
  const icon = ICONS[u.icon || UNIT_ICON[u.type] || "sword"];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(pose.x, pose.y);
  ctx.rotate((pose.h * Math.PI) / 180);

  // Soft cast shadow, then a metal rim in the faction colour.
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 9 * k;
  ctx.shadowOffsetX = 3 * k;
  ctx.shadowOffsetY = 4 * k;
  roundRect(ctx, -half, -half, size, size, 5);
  const rim = ctx.createLinearGradient(-half, -half, half, half);
  rim.addColorStop(0, shade(col, 0.4));
  rim.addColorStop(0.5, col);
  rim.addColorStop(1, shade(col, -0.5));
  ctx.fillStyle = rim;
  ctx.fill();
  ctx.shadowColor = "transparent";

  // Inner field with a faint faction emblem.
  const inset = Math.max(3.5, size * 0.09);
  roundRect(ctx, -half + inset, -half + inset, size - inset * 2, size - inset * 2, 3);
  const field = ctx.createRadialGradient(-half * 0.3, -half * 0.3, 0, 0, 0, half * 1.2);
  field.addColorStop(0, "#332B20");
  field.addColorStop(1, "#14110C");
  ctx.fillStyle = field;
  ctx.fill();
  const portrait = artImage(`units/${u.type}.png`);
  if (portrait) {
    // Painted portrait, clipped to the base but kept upright like the icon.
    ctx.save();
    ctx.clip();
    ctx.rotate((-pose.h * Math.PI) / 180);
    const s2 = (size - inset * 2) * 1.42;
    ctx.drawImage(portrait, -s2 / 2, -s2 / 2, s2, s2);
    ctx.restore();
  } else {
    ctx.fillStyle = shade(col, -0.2);
    ctx.globalAlpha = alpha * 0.22;
    drawPath24(ctx, EMBLEMS[u.faction], 0, 0, size * 0.86);
    ctx.globalAlpha = alpha;
  }

  // Front edge: a bright rule and a gold chevron (the facing of the mini).
  ctx.fillStyle = shade(col, 0.55);
  ctx.fillRect(-half + 3, -half, size - 6, Math.max(2, inset * 0.6));
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.moveTo(0, -half + inset + 1);
  ctx.lineTo(size * 0.12, -half + inset + size * 0.13);
  ctx.lineTo(-size * 0.12, -half + inset + size * 0.13);
  ctx.closePath();
  ctx.fill();
  // Arc guide notches from the corners toward the centre.
  ctx.strokeStyle = `${col}88`;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-half + inset, -half + inset);
  ctx.lineTo(-half * 0.45, -half * 0.45);
  ctx.moveTo(half - inset, -half + inset);
  ctx.lineTo(half * 0.45, -half * 0.45);
  ctx.stroke();

  // Army band: a solid faction-colour border outside the base, edged in black on
  // both sides so it reads against grass, terrain and neighbouring tokens.
  const band = Math.max(3, size * 0.09);
  roundRect(ctx, -half - band / 2, -half - band / 2, size + band, size + band, 5 + band / 2);
  ctx.lineWidth = band + 3;
  ctx.strokeStyle = "rgba(8, 6, 4, 0.85)";
  ctx.stroke();
  ctx.lineWidth = band;
  ctx.strokeStyle = col;
  ctx.stroke();

  // Selection, activation and target rings follow the base.
  if (isSel || isActive || isHi) {
    const pulse = 0.5 + 0.5 * Math.sin(now / 260);
    const target = isHi && !isSel;
    const ring = band + 5;
    roundRect(ctx, -half - ring, -half - ring, size + ring * 2, size + ring * 2, 7 + band);
    ctx.lineWidth = isActive ? 2.5 + pulse : 2;
    ctx.strokeStyle = target ? `rgba(225, 110, 80, ${0.55 + 0.45 * pulse})` : GOLD;
    ctx.shadowColor = target ? "#E16E50" : GOLD;
    ctx.shadowBlur = 8 * k;
    ctx.setLineDash(target ? [6, 4] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
  }
  ctx.restore();

  // Unit icon stays upright for legibility; the base and chevron show facing.
  // A painted portrait replaces it.
  if (portrait) {
    if (alpha >= 1) drawStatus(ctx, u, pose, BASE_SIZE[u.base]);
    return;
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  drawPath24(ctx, icon, pose.x + 0.8, pose.y + 0.8, size * 0.46);
  ctx.fillStyle = PARCHMENT;
  drawPath24(ctx, icon, pose.x, pose.y, size * 0.46);
  ctx.restore();

  if (alpha >= 1) drawStatus(ctx, u, pose, BASE_SIZE[u.base]);
}

function drawStatus(ctx, u, pose, size) {
  const reach = size * 0.72; // clears the base at any rotation
  ctx.save();
  // Wounds: a row of pips under the base.
  const n = u.maxWounds;
  const pw = n > 8 ? Math.max(2.5, 40 / n) : 5;
  const gap = 1.5;
  let x = pose.x - (n * pw + (n - 1) * gap) / 2;
  const y = pose.y + reach + 3;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x - 0.8, y - 0.8, pw + 1.6, 5.6);
    ctx.fillStyle = i < u.wounds ? "#8DBF6A" : "#3A2F24";
    ctx.fillRect(x, y, pw, 4);
    x += pw + gap;
  }
  // Ward: blue diamonds under the wounds.
  for (let i = 0; i < u.maxWard; i++) {
    const dx = pose.x - ((u.maxWard - 1) * 8) / 2 + i * 8;
    ctx.fillStyle = i < u.ward ? "#8FC1F0" : "rgba(30, 40, 55, 0.7)";
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(dx, y + 7);
    ctx.lineTo(dx + 3.2, y + 10.5);
    ctx.lineTo(dx, y + 14);
    ctx.lineTo(dx - 3.2, y + 10.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // Initiative on a small shield, top left.
  const ix = pose.x - reach + 2;
  const iy = pose.y - reach + 2;
  ctx.fillStyle = "#1D1913";
  drawPath24(ctx, ICONS.shield, ix, iy, 15);
  ctx.fillStyle = GOLD;
  ctx.font = `700 9px ${DISPLAY}`;
  ctx.textAlign = "center";
  ctx.fillText(String(u.init), ix, iy + 3);
  // Strain (red) and tokens (coins) stacked on the right.
  let sy = pose.y - reach + 4;
  const sx = pose.x + reach;
  for (let i = 0; i < u.strain; i++, sy += 10) coin(ctx, sx, sy, "#C2412C", "!");
  const t = u.tokens;
  const coins = [["steel", "#B9C3CC", "S"], ["guard", "#7FA3C8", "G"], ["brace", "#A07A4A", "B"], ["frenzy", "#D2643C", "F"], ["charge", "#9B59C9", "C"]];
  for (const [key, c, letter] of coins) for (let i = 0; i < (t[key] || 0); i++, sy += 10) coin(ctx, sx, sy, c, letter);
  if (u.souls) coin(ctx, sx, sy, "#6E5A9A", String(u.souls));
  ctx.restore();
}

function coin(ctx, x, y, color, letter) {
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath();
  ctx.arc(x + 0.8, y + 1, 4.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 4.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 240, 200, 0.6)";
  ctx.lineWidth = 0.7;
  ctx.stroke();
  ctx.fillStyle = "#15110B";
  ctx.font = `700 6.5px ${DISPLAY}`;
  ctx.textAlign = "center";
  ctx.fillText(letter, x, y + 2.3);
}

function drawAttackLine(ctx, state, line, now) {
  const a = state.units.find((u) => u.id === line.from);
  const b = state.units.find((u) => u.id === line.to);
  if (!a || !b) return;
  ctx.save();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([10, 8]);
  ctx.lineDashOffset = -now / 40;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

function drawEffects(ctx, k, now) {
  for (const e of anim.effects) {
    if (now < e.t0) continue;
    const f = clamp01((now - e.t0) / (e.t1 - e.t0));
    ctx.save();
    if (e.kind === "missile" || e.kind === "magic") {
      const g = clamp01(f / 0.75);
      const x = e.from.x + (e.to.x - e.from.x) * g;
      const y = e.from.y + (e.to.y - e.from.y) * g;
      const ang = Math.atan2(e.to.y - e.from.y, e.to.x - e.from.x);
      if (g < 1 && e.kind === "magic") {
        // A glowing bolt with a short tail.
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 14 * k;
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = e.color;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(ang) * 28, y - Math.sin(ang) * 28);
        ctx.lineTo(x, y);
        ctx.stroke();
      } else if (g < 1) {
        // A volley: three staggered shafts.
        ctx.strokeStyle = "#E9DCC0";
        ctx.lineWidth = 1.6;
        for (let i = -1; i <= 1; i++) {
          const ox = Math.cos(ang + Math.PI / 2) * i * 6;
          const oy = Math.sin(ang + Math.PI / 2) * i * 6;
          const gg = clamp01(g - Math.abs(i) * 0.06);
          const gx = e.from.x + (e.to.x - e.from.x) * gg + ox;
          const gy = e.from.y + (e.to.y - e.from.y) * gg + oy;
          ctx.beginPath();
          ctx.moveTo(gx - Math.cos(ang) * 14, gy - Math.sin(ang) * 14);
          ctx.lineTo(gx, gy);
          ctx.stroke();
        }
      } else {
        ctx.globalAlpha = 1 - (f - 0.75) / 0.25;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.to.x, e.to.y, 8 + (f - 0.75) * 120, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (e.kind === "melee") {
      // Three quick slashes across the target.
      ctx.strokeStyle = "#F4EAD2";
      ctx.lineCap = "round";
      ctx.shadowColor = "#F4EAD2";
      ctx.shadowBlur = 6 * k;
      for (let i = 0; i < 3; i++) {
        const s = clamp01((f - i * 0.18) / 0.4);
        if (s <= 0 || s >= 1) continue;
        ctx.globalAlpha = 1 - s;
        ctx.lineWidth = 3 * (1 - s) + 0.5;
        const a0 = -2.4 + i * 0.5;
        ctx.beginPath();
        ctx.arc(e.to.x - 10 + i * 10, e.to.y + 8 - i * 8, 22, a0, a0 + 1.6 * s);
        ctx.stroke();
      }
    } else if (e.kind === "hit") {
      ctx.globalAlpha = (1 - f) * 0.6;
      ctx.fillStyle = "#E0452C";
      ctx.beginPath();
      ctx.arc(e.to.x, e.to.y, e.size * 0.75, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawFloaters(ctx, now) {
  for (const fl of anim.floaters) {
    if (now < fl.t0) continue;
    const f = clamp01((now - fl.t0) / (fl.t1 - fl.t0));
    ctx.save();
    ctx.globalAlpha = f < 0.7 ? 1 : 1 - (f - 0.7) / 0.3;
    ctx.font = `700 ${fl.text.length > 3 ? 15 : 20}px ${DISPLAY}`;
    ctx.textAlign = "center";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(10, 8, 5, 0.85)";
    const y = fl.y - 34 - f * 30;
    ctx.strokeText(fl.text, fl.x, y);
    ctx.fillStyle = fl.color;
    ctx.fillText(fl.text, fl.x, y);
    ctx.restore();
  }
}

function drawSmoke(ctx, u, f) {
  ctx.save();
  for (let i = 0; i < 8; i++) {
    const a = i * 0.785 + u.x;
    const d = 10 + f * 30;
    ctx.globalAlpha = (1 - f) * 0.45;
    ctx.fillStyle = i % 2 ? "#5B544A" : "#7A7266";
    ctx.beginPath();
    ctx.arc(u.x + Math.cos(a) * d, u.y + Math.sin(a) * d - f * 12, 7 + f * 12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
