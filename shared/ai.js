// Computer opponent. It plays through the same commands a person does, and it
// only reasons about enemies its own side can see (fog of war applies to it too).
//
//   aiStep(state, pid) makes at most one decision for that seat and returns true
//   if it did something; the server calls it on a timer so moves stay watchable.
import * as E from "./engine.js";
import { FACTIONS, armyLimits, upgradesFor, validateArmy } from "./factions.js";
import { isAim, isStance, parseManeuver } from "./geometry.js";
import { visibleTo } from "./terrain.js";

export const AI_NAMES = {
  holds: "Thane Brokk (AI)", sylvan: "Lady Ithil (AI)", greenskin: "Warboss Grub (AI)",
  umbral: "The Pale Hand (AI)", calamity: "Vorr the Hungering (AI)", concord: "Marshal Hale (AI)",
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const nearest = (p, xs) => xs.reduce((best, x) => (!best || dist(p, x) < dist(p, best) ? x : best), null);
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];

/** A random legal army for the budget, with a champion about half the time. */
export function randomArmy(fid, budget) {
  const us = FACTIONS[fid].units;
  const champs = us.filter((u) => u.champion && u.cost <= budget * 0.4);
  const regs = us.filter((u) => !u.champion);
  for (let attempt = 0; attempt < 50; attempt++) {
    const list = [];
    let cost = 0;
    const copies = {};
    if (champs.length && Math.random() < 0.5) {
      const c = pick(champs);
      list.push({ unit: c.id, upgrade: null });
      cost += c.cost;
    }
    const lim = armyLimits(budget);
    for (let g = 0; g < 400 && list.filter((e) => !us.find((u) => u.id === e.unit).champion).length < lim.units; g++) {
      const ok = regs.filter((u) => u.cost <= budget - cost && (copies[u.id] || 0) < lim.copies);
      if (!ok.length) break;
      const u = pick(ok);
      list.push({ unit: u.id, upgrade: null });
      cost += u.cost;
      copies[u.id] = (copies[u.id] || 0) + 1;
    }
    // Spend leftovers on a cheap upgrade where one fits.
    for (const e of list) {
      const u = us.find((x) => x.id === e.unit);
      const g = upgradesFor(fid, u).filter((x) => !x.relic && x.cost <= budget - cost)[0];
      if (g) {
        e.upgrade = g.id;
        cost += g.cost;
      }
    }
    if (list.length && validateArmy(fid, list, budget).ok) return list;
  }
  return [{ unit: regs.reduce((a, b) => (a.cost <= b.cost ? a : b)).id, upgrade: null }];
}

/** The distance this unit wants to be from its target: ranged units hold off, brawlers close in. */
function preferredRange(u) {
  const reach = Math.max(...u.weapons.map((w) => w.range[1]));
  const melee = u.weapons.some((w) => w.range[1] === 1 && w.dice >= Math.max(...u.weapons.map((x) => x.dice)));
  return melee || reach <= 1 ? 40 : Math.min(reach, 3) * 100 - 60;
}

function planDials(state, pid) {
  const seen = visibleTo(state, pid);
  const foes = state.units.filter((x) => !x.dead && x.owner !== pid && seen.has(x.id));
  for (const u of state.units.filter((x) => !x.dead && x.owner === pid)) {
    const target = nearest(u, foes) || { x: state.board / 2, y: state.board / 2 };
    const want = foes.length ? preferredRange(u) : 0;
    let best = null;
    let bestScore = -Infinity;
    for (const code of u.dial) {
      const m = parseManeuver(code);
      if (m.color === "red" && E.strained(u)) continue;
      const mv = E.planMove(state, u, code);
      if (mv.fled) continue;
      let score = -Math.abs(dist(mv.pose, target) - want);
      if (m.color === "red") score -= 12;
      if (m.color === "blue" && u.strain > 0) score += 15;
      if (mv.bumped.length || mv.blockedBy) score -= 40;
      if (mv.slowedBy?.kind === "lava" && u.faction !== "calamity") score -= 30;
      // A defensive stance only pays when an enemy is close enough to attack this round, and a
      // brawler only braces once it is in contact; until then it keeps closing.
      if (isAim(m)) continue; // the computer cannot see enemy dials, so it does not gamble on Aim
      if (isStance(m)) {
        const near = Math.min(Infinity, ...foes.map((f) => dist(f, u)));
        score += near <= 300 && (want > 40 || near <= 110) ? 6 : -30;
      }
      // Face the target at the end of the move so front arcs can fire.
      const ang = (Math.atan2(target.x - mv.pose.x, -(target.y - mv.pose.y)) * 180) / Math.PI;
      const off = Math.abs(((ang - mv.pose.h + 540) % 360) - 180);
      if (u.weapons.some((w) => w.arc === "front")) score -= off / 6;
      score += Math.random() * 4; // a little unpredictability
      if (score > bestScore) {
        bestScore = score;
        best = code;
      }
    }
    E.setDial(state, pid, u.id, best || u.dial.find((c) => !c.endsWith(":r")) || u.dial[0]);
  }
  E.ready(state, pid);
}

const ACTION_PREF = ["steel", "mark", "brace", "guard", "channel", "mend", "rally"];

function chooseAction(state, p) {
  const u = E.unit(state, p.uid);
  const hurt = u.wounds <= Math.ceil(u.maxWounds / 3);
  const usable = p.options.filter((o) => !o.red && !(o.taint && hurt));
  // Command first when it can steel up a thrall or a big hitter.
  const cmd = usable.find((o) => o.a === "command");
  if (cmd) {
    for (const want of ["steel", "guard", "mark"]) {
      for (const t of cmd.targets) {
        const sub = t.subs.find((x) => x.a === want);
        if (sub && !(want === "steel" && E.unit(state, t.id).tokens.steel)) {
          const subParams = sub.targets ? { target: sub.targets[0] } : sub.dirs ? { dir: sub.dirs[0] } : {};
          return E.act(state, p.pid, { a: "command", params: { target: t.id, sub: want, subParams } });
        }
      }
    }
  }
  for (const a of ACTION_PREF) {
    const o = usable.find((x) => x.a === a);
    if (!o) continue;
    if (a === "steel" && u.tokens.steel) continue;
    if (a === "guard" && u.tokens.guard) continue;
    const params = {};
    if (o.targets) params.target = a === "mark" ? nearest(u, o.targets.map((id) => E.unit(state, id))).id : o.targets[0];
    return E.act(state, p.pid, { a, params });
  }
  return E.pass(state, p.pid);
}

function chooseAttack(state, p) {
  const u = E.unit(state, p.uid);
  let best = null;
  let bestScore = -Infinity;
  for (const o of p.options) {
    const t = E.unit(state, o.target);
    const dice = E.attackDice(state, u, t, u.weapons[o.weapon], o.range);
    const left = t.wounds + t.ward;
    const score = dice * 10 - left * 2 + (left <= Math.ceil(dice / 2) ? 25 : 0) + t.cost / 4;
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  }
  E.declareAttack(state, p.pid, { target: best.target, weapon: best.weapon });
}

/** Make one decision for this seat if it has one to make. Returns true when it acted. */
export function aiStep(state, pid) {
  const me = E.player(state, pid);
  if (!me || me.eliminated) return false;
  if (state.phase === "muster") {
    if (me.ready) return false;
    if (!me.faction) E.setFaction(state, pid, pick(Object.keys(FACTIONS)));
    E.submitArmy(state, pid, randomArmy(me.faction, state.settings.budget));
    E.ready(state, pid);
    return true;
  }
  if (state.phase === "deploy" && !me.ready) {
    E.ready(state, pid);
    return true;
  }
  if (state.phase === "plan" && !me.ready) {
    planDials(state, pid);
    return true;
  }
  const p = state.pending;
  if (!p || p.pid !== pid) return false;
  if (p.type === "action") chooseAction(state, p);
  else if (p.type === "attack") chooseAttack(state, p);
  else E.modify(state, pid, { op: p.options[0].op, dice: [] });
  return true;
}
