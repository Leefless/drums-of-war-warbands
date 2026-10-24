// Canvas renderer for the battlefield. Pure drawing plus hit-testing; app.js
// owns state and decides what to highlight.
import { BASE_SIZE, BOARD, corners, fwd, maneuverPose, maneuverSegments, parseManeuver, poseAlong, pointInPoly } from "/shared/geometry.js";
import { FACTIONS } from "/shared/factions.js";
import { zoneFor } from "/shared/engine.js";

const SANS = '"Untitled Sans", "Helvetica Neue", Arial, sans-serif';
const MONO = '"GT America Mono", "SF Mono", "Courier New", monospace';
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function sizeCanvas(canvas) {
  const box = canvas.parentElement.getBoundingClientRect();
  const side = Math.max(280, Math.floor(Math.min(box.width, box.height) - 24)); // minus .boardwrap padding
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${side}px`;
  canvas.style.height = `${side}px`;
  canvas.width = side * dpr;
  canvas.height = side * dpr;
  return side;
}

export function toBoard(canvas, ev) {
  const r = canvas.getBoundingClientRect();
  return { x: ((ev.clientX - r.left) / r.width) * BOARD, y: ((ev.clientY - r.top) / r.height) * BOARD };
}

export function unitAt(state, pt) {
  return [...state.units].reverse().find((u) => !u.dead && pointInPoly(pt, corners(u, BASE_SIZE[u.base])));
}

function abbrev(name) {
  const words = name.replace(/[^A-Za-z ]/g, "").split(" ").filter((w) => w.length > 2 || w === name);
  return (words.length > 1 ? words.slice(0, 2).map((w) => w[0]).join("") : name.slice(0, 2)).toUpperCase();
}

function polyPath(ctx, pts) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
}

export function playerColor(state, pid) {
  const p = state.players.find((x) => x.id === pid);
  return p?.faction ? FACTIONS[p.faction].color : css("--ink-3");
}

/**
 * opts: { selected, active, ghost: {uid, code}, attackLine: {from, to}, highlight: Set<uid>, zones: bool }
 */
export function draw(canvas, state, opts = {}) {
  const ctx = canvas.getContext("2d");
  const k = canvas.width / BOARD;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.fillStyle = css("--board");
  ctx.fillRect(0, 0, BOARD, BOARD);

  // Range grid: one hairline per range band.
  ctx.strokeStyle = css("--grid");
  ctx.lineWidth = 1 / k;
  for (let i = 100; i < BOARD; i += 100) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, BOARD);
    ctx.moveTo(0, i);
    ctx.lineTo(BOARD, i);
    ctx.stroke();
  }

  if (opts.zones) {
    for (const p of state.players) {
      const z = zoneFor(p.seat);
      ctx.fillStyle = `${playerColor(state, p.id)}22`;
      ctx.strokeStyle = `${playerColor(state, p.id)}88`;
      ctx.lineWidth = 1.5;
      ctx.fillRect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0);
      ctx.strokeRect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0);
    }
  }

  for (const o of state.obstacles) drawObstacle(ctx, o);

  // Movement trails from this round.
  ctx.setLineDash([6, 6]);
  for (const u of state.units) {
    if (!u.trail || u.trail.length < 2) continue;
    ctx.strokeStyle = `${playerColor(state, u.owner)}99`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    u.trail.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  }
  ctx.setLineDash([]);

  const sel = state.units.find((u) => u.id === opts.selected && !u.dead);
  if (sel) drawReach(ctx, state, sel);

  if (opts.ghost) {
    const u = state.units.find((x) => x.id === opts.ghost.uid);
    if (u) drawGhost(ctx, state, u, opts.ghost.code);
  }

  for (const u of state.units) if (!u.dead) drawUnit(ctx, state, u, opts);

  if (opts.attackLine) {
    const a = state.units.find((u) => u.id === opts.attackLine.from);
    const b = state.units.find((u) => u.id === opts.attackLine.to);
    if (a && b) {
      ctx.strokeStyle = css("--accent");
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
}

function drawObstacle(ctx, o) {
  const color = { ruins: css("--ruins"), thicket: css("--thicket"), rift: css("--rift") }[o.kind];
  ctx.save();
  ctx.beginPath();
  ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
  ctx.fillStyle = `${color}33`;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  if (o.kind === "rift") ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.clip();
  ctx.strokeStyle = `${color}66`;
  ctx.lineWidth = 1;
  if (o.kind === "ruins") {
    for (let d = -o.r * 2; d < o.r * 2; d += 10) {
      ctx.beginPath();
      ctx.moveTo(o.x + d, o.y - o.r);
      ctx.lineTo(o.x + d + o.r, o.y + o.r);
      ctx.stroke();
    }
  } else if (o.kind === "thicket") {
    ctx.fillStyle = `${color}88`;
    for (let i = 0; i < 18; i++) {
      const a = i * 2.4;
      const r = (o.r * ((i * 37) % 100)) / 110;
      ctx.beginPath();
      ctx.arc(o.x + Math.cos(a) * r, o.y + Math.sin(a) * r, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    for (let r = o.r * 0.3; r < o.r; r += o.r * 0.25) {
      ctx.beginPath();
      ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.fillStyle = color;
  ctx.font = `600 11px ${MONO}`;
  ctx.textAlign = "center";
  ctx.fillText(o.kind.toUpperCase(), o.x, o.y + o.r + 13);
}

function drawReach(ctx, state, u) {
  const half = BASE_SIZE[u.base] / 2;
  const maxR = Math.max(...u.weapons.map((w) => w.range[1]));
  ctx.lineWidth = 1;
  for (let r = 1; r <= maxR; r++) {
    ctx.strokeStyle = `${css("--accent")}${r === 1 ? "66" : "33"}`;
    ctx.beginPath();
    ctx.arc(u.x, u.y, half + r * 100, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (u.weapons.some((w) => w.arc === "front")) {
    const len = half + maxR * 100;
    ctx.strokeStyle = `${css("--accent")}88`;
    for (const s of [-1, 1]) {
      const a = (u.h + 45 * s) * (Math.PI / 180);
      ctx.beginPath();
      ctx.moveTo(u.x, u.y);
      ctx.lineTo(u.x + Math.sin(a) * len, u.y - Math.cos(a) * len);
      ctx.stroke();
    }
  }
}

function drawGhost(ctx, state, u, code) {
  const man = parseManeuver(code);
  const size = BASE_SIZE[u.base];
  const segs = maneuverSegments(man, size);
  ctx.strokeStyle = css("--accent");
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const p = poseAlong(u, segs, Math.min(1, t));
    t ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  const end = maneuverPose(u, man, size, 1);
  polyPath(ctx, corners(end, size));
  ctx.fillStyle = `${css("--accent")}22`;
  ctx.fill();
  ctx.stroke();
  const f = fwd(end.h);
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x + f.x * size * 0.5, end.y + f.y * size * 0.5);
  ctx.stroke();
}

function drawUnit(ctx, state, u, opts) {
  const size = BASE_SIZE[u.base];
  const pts = corners(u, size);
  const color = playerColor(state, u.owner);
  polyPath(ctx, pts);
  ctx.fillStyle = css("--base");
  ctx.fill();
  ctx.fillStyle = `${color}40`;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.stroke();

  // Front edge and arc notch.
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  ctx.lineTo(pts[1].x, pts[1].y);
  ctx.stroke();

  const isSel = opts.selected === u.id;
  const isActive = opts.active === u.id;
  const isHi = opts.highlight?.has(u.id);
  if (isSel || isActive || isHi) {
    polyPath(ctx, corners(u, size + 10));
    ctx.lineWidth = isActive ? 3 : 2;
    ctx.strokeStyle = isHi && !isSel ? css("--warn") : css("--accent");
    ctx.setLineDash(isActive ? [] : [5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.fillStyle = css("--ink");
  ctx.font = `600 ${size >= 60 ? 14 : 11}px ${SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(abbrev(u.name), u.x, u.y);
  ctx.textBaseline = "alphabetic";

  // Wound bar under the base (screen aligned).
  const w = size;
  const y = u.y + size / 2 + 12;
  ctx.fillStyle = css("--grid");
  ctx.fillRect(u.x - w / 2, y, w, 4);
  ctx.fillStyle = css("--good");
  ctx.fillRect(u.x - w / 2, y, (w * u.wounds) / u.maxWounds, 4);
  if (u.maxWard) {
    ctx.fillStyle = css("--ward");
    for (let i = 0; i < u.maxWard; i++) {
      ctx.globalAlpha = i < u.ward ? 1 : 0.25;
      ctx.fillRect(u.x - w / 2 + i * 8, y + 6, 6, 3);
    }
    ctx.globalAlpha = 1;
  }
  // Strain pips.
  for (let i = 0; i < u.strain; i++) {
    ctx.fillStyle = css("--crit");
    ctx.beginPath();
    ctx.arc(u.x + w / 2 + 6, u.y - size / 2 + 6 + i * 9, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Initiative badge.
  ctx.fillStyle = css("--ink-2");
  ctx.font = `600 10px ${MONO}`;
  ctx.textAlign = "left";
  ctx.fillText(String(u.init), u.x - w / 2 - 12, u.y - size / 2 + 8);
}
