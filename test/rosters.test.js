import assert from "node:assert/strict";
import { test } from "node:test";
import { unitCost } from "../shared/cost.js";
import { DIALS } from "../shared/dials.js";
import { FACTIONS, MAX_COPIES, armyLimits, validateArmy } from "../shared/factions.js";
import { checkRoster, MIN_CHAMPIONS, MIN_UNITS } from "../shared/roster-check.js";
import * as E from "../shared/engine.js";

const IDS = Object.keys(FACTIONS);
const rosterOf = (fid) => ({ champions: FACTIONS[fid].units.filter((u) => u.champion).map((u) => ({ ...u, dial: u.dialKey, cost: undefined })), units: FACTIONS[fid].units.filter((u) => !u.champion).map((u) => ({ ...u, dial: u.dialKey, cost: undefined })) });

test("every army has 25+ distinct units and 10+ champions and passes the roster rules", () => {
  const seen = new Set();
  for (const fid of IDS) {
    const r = rosterOf(fid);
    for (const u of [...r.champions, ...r.units]) {
      delete u.cost;
      delete u.champion;
      delete u.unique;
      delete u.dialKey;
    }
    const { errors, ids } = checkRoster(fid, r, seen);
    assert.deepEqual(errors, [], `${fid} roster problems`);
    assert.ok(r.champions.length >= MIN_CHAMPIONS && r.units.length >= MIN_UNITS);
    for (const id of ids) seen.add(id);
  }
});

test("cost rises with every kind of power", () => {
  const base = { weapons: [{ name: "w", dice: 3, arc: "front", range: [1, 1] }], def: 1, wounds: 5, ward: 0, init: 3, actions: ["steel"], abilities: [] };
  const c0 = unitCost(base, DIALS.holds);
  const bump = [
    { weapons: [{ name: "w", dice: 4, arc: "front", range: [1, 1] }] },
    { weapons: [{ name: "w", dice: 3, arc: "front", range: [1, 3] }] },
    { weapons: [{ name: "w", dice: 3, arc: "full", range: [1, 1] }] },
    { def: 2 }, { wounds: 7 }, { ward: 2 }, { init: 6 },
    { actions: ["steel", "guard"] }, { abilities: ["armored"] },
  ];
  for (const b of bump) assert.ok(unitCost({ ...base, ...b }, DIALS.holds) > c0, JSON.stringify(b));
  assert.ok(unitCost(base, DIALS.holdsGyro) > unitCost(base, DIALS.holdsSlow), "a faster dial costs more");
});

test("army rules: one optional champion, at most 3 copies, champion counts against budget", () => {
  const champs = FACTIONS.holds.units.filter((u) => u.champion);
  const line = FACTIONS.holds.units.find((u) => !u.champion);
  assert.ok(validateArmy("holds", [{ unit: line.id }], 999).ok, "no champion is fine");
  assert.ok(!validateArmy("holds", [{ unit: champs[0].id }, { unit: champs[1].id }], 999).ok, "two champions rejected");
  assert.ok(!validateArmy("holds", Array(MAX_COPIES + 1).fill({ unit: line.id }), 100).ok, "fourth copy rejected at 100 points");
  assert.ok(validateArmy("holds", Array(armyLimits(200).copies).fill({ unit: line.id }), 200).ok, "bigger games allow more copies");
  const v = validateArmy("holds", [{ unit: champs[0].id }, { unit: line.id }], 999);
  assert.equal(v.cost, champs[0].cost + line.cost);
});

function duel(fa, a, fb, b) {
  const s = E.createGame({ seed: 3, budget: 9999 });
  E.addPlayer(s, "a", "A");
  E.addPlayer(s, "b", "B");
  E.setFaction(s, "a", fa);
  E.setFaction(s, "b", fb);
  E.submitArmy(s, "a", a.map((unit) => ({ unit })));
  E.submitArmy(s, "b", b.map((unit) => ({ unit })));
  for (const p of ["a", "b"]) E.ready(s, p);
  E.run(s);
  s.obstacles = [];
  return s;
}

test("new abilities: Stealthy, Armored, Guardian, Sniper, Charge, Berserk", () => {
  const find = (ab) => {
    for (const fid of IDS) {
      const u = FACTIONS[fid].units.find((x) => x.abilities.includes(ab) && !x.champion);
      if (u) return { fid, u };
    }
    throw new Error(`no unit with ${ab}`);
  };
  const basic = FACTIONS.concord.units.find((u) => u.id === "halberdiers");

  // Stealthy: no attacks from range 3+.
  const st = find("stealthy");
  let s = duel(st.fid, [st.u.id], "concord", ["crossbows"]);
  let [t, x] = [s.units[0], s.units[1]];
  Object.assign(t, { x: 450, y: 200, h: 0 });
  Object.assign(x, { x: 450, y: 480, h: 0 });
  assert.equal(E.rangeBetween(t, x), 3);
  assert.equal(E.attackOptions(s, x).length, 0);
  t.abilities = t.abilities.filter((a) => a !== "stealthy");
  assert.ok(E.attackOptions(s, x).length > 0);

  // Armored: 2+ damage loses one, a single hit does not.
  const arm = { abilities: ["armored"] };
  assert.deepEqual(E.finalDamage({ atk: ["strike", "strike"], def: [], brace: false }, arm).strikes, 1);
  assert.deepEqual(E.finalDamage({ atk: ["strike"], def: [], brace: false }, arm).strikes, 1);

  // Guardian: a friend at range 1 adds a defence die; Sniper ignores the range 3 bonus.
  const gd = find("guardian");
  s = duel(gd.fid, [gd.u.id, basic && gd.fid === "concord" ? "halberdiers" : FACTIONS[gd.fid].units.find((u) => !u.champion && !u.abilities.includes("guardian")).id], "concord", ["crossbows"]);
  const [g, mate, shooter] = s.units;
  Object.assign(g, { x: 400, y: 300, h: 0 });
  Object.assign(mate, { x: 480, y: 300, h: 0 });
  Object.assign(shooter, { x: 480, y: 420, h: 0 });
  const w = shooter.weapons[0];
  const withG = E.defenseDice(s, shooter, mate, w, 2);
  g.abilities = g.abilities.filter((a) => a !== "guardian");
  assert.equal(withG, E.defenseDice(s, shooter, mate, w, 2) + 1);
  shooter.abilities = [];
  const plain = E.defenseDice(s, shooter, mate, w, 3);
  shooter.abilities = ["sniper"];
  assert.equal(E.defenseDice(s, shooter, mate, w, 3), plain - 1);

  // Charge (+1 at range 1 after speed 3+) and Berserk (+1 while wounded).
  const ch = find("charge");
  s = duel(ch.fid, [ch.u.id], "concord", ["halberdiers"]);
  const [c, foe] = s.units;
  const cw = c.weapons[0];
  const calm = E.attackDice(s, c, foe, cw, 1);
  c.lastSpeed = 3;
  assert.equal(E.attackDice(s, c, foe, cw, 1), calm + 1);
  c.abilities = ["berserk"];
  c.lastSpeed = 0;
  c.wounds = c.maxWounds - 1;
  assert.equal(E.attackDice(s, c, foe, cw, 1), calm + 1);
});

test("fuzz: every one of the 247 units plays a full battle without breaking", () => {
  let played = 0;
  for (const fid of IDS) {
    const regs = FACTIONS[fid].units.filter((u) => !u.champion).map((u) => u.id);
    const champs = FACTIONS[fid].units.filter((u) => u.champion).map((u) => u.id);
    for (let i = 0; i * 6 < Math.max(regs.length, champs.length * 6); i++) {
      const mine = [...regs.slice(i * 6, i * 6 + 6)];
      if (champs[i]) mine.push(champs[i]);
      if (!mine.length) continue;
      const other = IDS[(IDS.indexOf(fid) + 1 + i) % IDS.length];
      const theirs = FACTIONS[other].units.filter((u) => !u.champion).slice(i, i + 5).map((u) => u.id);
      const s = duel(fid, mine, other, theirs);
      let r = (i + 7) * 7919;
      const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
      for (const p of s.players) E.ready(s, p.id);
      E.run(s);
      for (let step = 0; step < 30000 && s.phase !== "over"; step++) {
        if (s.phase === "plan") {
          for (const u of s.units.filter((x) => !x.dead)) {
            const legal = u.dial.filter((c) => !(c.endsWith(":r") && E.strained(u)));
            E.setDial(s, u.owner, u.id, legal[Math.floor(rnd() * legal.length)]);
          }
          for (const p of s.players) if (!p.eliminated) E.ready(s, p.id);
        } else {
          const p = s.pending;
          assert.ok(p, `${fid} stuck in ${s.phase}`);
          const any = (xs) => xs[Math.floor(rnd() * xs.length)];
          if (p.type === "action") {
            const o = any(p.options);
            const params = {};
            if (o.a === "command") {
              const t = any(o.targets);
              const sub = any(t.subs);
              Object.assign(params, { target: t.id, sub: sub.a, subParams: sub.targets ? { target: any(sub.targets) } : sub.dirs ? { dir: any(sub.dirs) } : {} });
            } else if (o.targets) params.target = any(o.targets);
            else if (o.dirs) params.dir = any(o.dirs);
            rnd() < 0.2 ? E.pass(s, p.pid) : E.act(s, p.pid, { a: o.a, params });
          } else if (p.type === "attack") {
            const o = any(p.options);
            E.declareAttack(s, p.pid, { target: o.target, weapon: o.weapon });
          } else {
            rnd() < 0.3 ? E.pass(s, p.pid) : E.modify(s, p.pid, { op: any(p.options).op, dice: [] });
          }
        }
        E.run(s);
      }
      assert.equal(s.phase, "over", `${fid} battle ${i} did not finish`);
      for (const u of s.units) assert.ok(u.wounds >= 0 && u.wounds <= u.maxWounds && u.ward >= 0 && u.ward <= u.maxWard, `${u.type} stats out of bounds`);
      played += mine.length;
    }
  }
  assert.equal(played, Object.values(FACTIONS).reduce((a, f) => a + f.units.length, 0)); // every unit in every roster
});
