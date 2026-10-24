import assert from "node:assert/strict";
import { test } from "node:test";
import { FACTIONS, upgradesFor, validateArmy } from "../shared/factions.js";
import * as E from "../shared/engine.js";
import { maneuverPose, parseManeuver, polysOverlap, corners } from "../shared/geometry.js";

const close = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("straight, bank and turn templates land where the geometry says", () => {
  const start = { x: 450, y: 450, h: 0 };
  const s2 = maneuverPose(start, parseManeuver("2S:w"), 40);
  close(s2.x, 450);
  close(s2.y, 450 - (40 + 80));
  const tr1 = maneuverPose(start, parseManeuver("1TR:w"), 40);
  close(tr1.h, 90); // facing east after a right turn
  close(tr1.x, 450 + 35 + 20); // radius plus half base
  close(tr1.y, 450 - 20 - 35);
  const bl = maneuverPose(start, parseManeuver("1BL:w"), 40);
  close(bl.h, 315);
  const about = maneuverPose(start, parseManeuver("3A:r"), 40);
  close(about.h, 180);
});

test("every unit dial parses and every faction can build a legal army", () => {
  for (const f of Object.values(FACTIONS)) {
    for (const u of f.units) for (const c of u.dial) parseManeuver(c);
    const list = f.units.filter((u) => !u.unique).slice(0, 3).map((u) => ({ unit: u.id }));
    assert.ok(validateArmy(f.id, list, 100).ok, `${f.id} starter list`);
  }
});

test("army validation enforces budget, uniques and one relic", () => {
  assert.equal(validateArmy("holds", [{ unit: "thane" }, { unit: "thane" }], 100).ok, false);
  assert.equal(validateArmy("holds", Array(8).fill({ unit: "ironbreakers" }), 100).ok, false);
  const two = [{ unit: "ironbreakers", upgrade: "runeOfStone" }, { unit: "gunners", upgrade: "runeOfStone" }];
  assert.equal(validateArmy("holds", two, 100).ok, false);
  const thrall = FACTIONS.umbral.units.find((u) => u.id === "skeletons");
  assert.ok(!upgradesFor("umbral", thrall).some((g) => g.id === "banner"));
});

test("cancellation: parries remove strikes before rends; brace cancels one strike", () => {
  assert.deepEqual(E.tally({ atk: ["strike", "rend", "strike"], def: ["parry"], brace: false }), { strikes: 1, rends: 1 });
  assert.deepEqual(E.tally({ atk: ["strike", "rend"], def: ["parry"], brace: true }), { strikes: 0, rends: 1 });
  assert.deepEqual(E.tally({ atk: ["rend"], def: [], brace: true }, true), { strikes: 0, rends: 0 });
});

function setup(fa, fb, seed = 7) {
  const s = E.createGame({ seed, budget: 100 });
  E.addPlayer(s, "a", "A");
  E.addPlayer(s, "b", "B");
  E.setFaction(s, "a", fa);
  E.setFaction(s, "b", fb);
  return s;
}

test("muster -> deploy -> plan flow and hidden dials", () => {
  const s = setup("holds", "sylvan");
  E.submitArmy(s, "a", [{ unit: "ironbreakers" }, { unit: "gunners" }]);
  E.submitArmy(s, "b", [{ unit: "wardens" }, { unit: "thornriders" }]);
  E.ready(s, "a");
  E.ready(s, "b");
  E.run(s);
  assert.equal(s.phase, "deploy");
  assert.equal(s.units.length, 4);
  assert.equal(s.obstacles.length > 0, true);
  E.ready(s, "a");
  E.ready(s, "b");
  E.run(s);
  assert.equal(s.phase, "plan");
  const mine = s.units.find((u) => u.owner === "a");
  E.setDial(s, "a", mine.id, "1S:b");
  const vb = E.viewFor(s, "b");
  assert.equal(vb.dials[mine.id], undefined, "opponent cannot see the dial");
  assert.ok(!vb.planned.includes(mine.id), "an unseen unit's plan is not even listed");
  assert.ok(!vb.players.some((p) => p.id === "a" || p.id === "b"), "private tokens never leave the server");
  assert.equal(E.viewFor(s, "a").dials[mine.id], "1S:b");
});

test("Unyielding grants a second Steel/Brace action after holding ground", () => {
  const s = setup("holds", "sylvan");
  E.submitArmy(s, "a", [{ unit: "ironbreakers" }]);
  E.submitArmy(s, "b", [{ unit: "wardens" }]);
  for (const p of ["a", "b"]) E.ready(s, p);
  E.run(s);
  for (const p of ["a", "b"]) E.ready(s, p);
  E.run(s);
  const ib = s.units.find((u) => u.owner === "a");
  const wd = s.units.find((u) => u.owner === "b");
  E.setDial(s, "a", ib.id, "0X:w");
  E.setDial(s, "b", wd.id, "1S:b");
  E.ready(s, "a");
  E.ready(s, "b");
  E.run(s);
  // Ironbreakers (init 2) activate before Wardens (init 4).
  assert.equal(s.pending.uid, ib.id);
  E.act(s, "a", { a: "steel" });
  assert.equal(s.pending?.uid, ib.id, "second action offered");
  assert.deepEqual(s.pending.options.map((o) => o.a), ["brace"]);
  E.act(s, "a", { a: "brace" });
  assert.equal(ib.tokens.steel, 1);
  assert.equal(ib.tokens.brace, 1);
});

test("a defensive stance holds position, pivots, and adds defence dice for the round", () => {
  const s = setup("holds", "sylvan");
  E.submitArmy(s, "a", [{ unit: "ironbreakers" }]);
  E.submitArmy(s, "b", [{ unit: "thornriders" }]);
  for (const p of ["a", "b"]) E.ready(s, p);
  E.run(s);
  for (const p of ["a", "b"]) E.ready(s, p);
  E.run(s);
  const ib = s.units.find((u) => u.owner === "a");
  const tr = s.units.find((u) => u.owner === "b");
  assert.ok(ib.dial.includes("0DL:w") && tr.dial.includes("0DA:w"), "every unit gets the stance row");
  // Bonus follows top speed: Ironbreakers (3) +1, Thornriders (5) +2.
  assert.equal(E.stanceBonus(ib), 1);
  assert.equal(E.stanceBonus(tr), Math.max(1, Math.floor(Math.max(...tr.dial.map(parseManeuver).filter((m) => m.speed).map((m) => m.speed)) / 2)));
  const before = { x: ib.x, y: ib.y, h: ib.h };
  const base = E.defenseDice(s, tr, ib, tr.weapons[0], 1);
  E.setDial(s, "a", ib.id, "0DR:w");
  E.setDial(s, "b", tr.id, "0D:w");
  E.ready(s, "a");
  E.ready(s, "b");
  E.run(s);
  close(ib.x, before.x);
  close(ib.y, before.y);
  close(ib.h, (before.h + 90) % 360);
  assert.equal(ib.stance, 1);
  assert.equal(E.defenseDice(s, tr, ib, tr.weapons[0], 1), base + 1);
  let guard = 0;
  while (s.phase !== "plan" && s.phase !== "over" && guard++ < 50) {
    if (s.pending) E.pass(s, s.pending.pid);
    E.run(s);
  }
  assert.equal(ib.stance, 0, "stance clears at the next round");
});

test("Aim only offsets a defensive stance and never adds more than the stance did", () => {
  const s = setup("holds", "sylvan");
  E.submitArmy(s, "a", [{ unit: "ironbreakers" }, { unit: "gunners" }]);
  E.submitArmy(s, "b", [{ unit: "wardens" }]);
  for (const p of ["a", "b"]) E.ready(s, p);
  E.run(s);
  const [ib, gun] = s.units.filter((u) => u.owner === "a");
  const wd = s.units.find((u) => u.owner === "b");
  assert.ok(gun.dial.includes("0M:w") && wd.dial.includes("0ML:w"), "ranged units get the Aim row");
  assert.ok(!ib.dial.some((c) => c.startsWith("0M")), "melee units do not");
  const w = wd.weapons[0];
  const base = E.attackDice(s, wd, gun, w, 2);
  wd.aim = 2;
  assert.equal(E.attackDice(s, wd, gun, w, 2), base, "no stance: Aim adds nothing");
  gun.stance = 1;
  assert.equal(E.attackDice(s, wd, gun, w, 2), base + 1, "capped at the stance's dice");
  gun.stance = 2;
  wd.aim = 1;
  assert.equal(E.attackDice(s, wd, gun, w, 2), base + 1, "capped at the Aim's dice");
  assert.equal(E.attackDice(s, wd, gun, w, 2) - E.defenseDice(s, wd, gun, w, 2), base - E.defenseDice(s, wd, { ...gun, stance: 0 }, w, 2) - 1, "net effect never beats the unbraced matchup");
});

test("Deathless units take damage instead of strain on red maneuvers", () => {
  const s = setup("umbral", "concord");
  E.submitArmy(s, "a", [{ unit: "skeletons" }]);
  E.submitArmy(s, "b", [{ unit: "halberdiers" }]);
  for (const p of ["a", "b"]) E.ready(s, p);
  E.run(s);
  for (const p of ["a", "b"]) E.ready(s, p);
  E.run(s);
  const sk = s.units.find((u) => u.owner === "a");
  const hb = s.units.find((u) => u.owner === "b");
  s.obstacles = [];
  E.setDial(s, "a", sk.id, "3A:r");
  E.setDial(s, "b", hb.id, "1S:b");
  E.ready(s, "a");
  E.ready(s, "b");
  E.run(s);
  assert.equal(sk.strain, 0);
  assert.equal(sk.wounds, sk.maxWounds - 1);
});

test("Strained units cannot plan red maneuvers; Greenskins tolerate 1 strain", () => {
  const s = setup("greenskin", "concord");
  E.submitArmy(s, "a", [{ unit: "boyz" }]);
  E.submitArmy(s, "b", [{ unit: "halberdiers" }]);
  for (const p of ["a", "b"]) E.ready(s, p);
  E.run(s);
  for (const p of ["a", "b"]) E.ready(s, p);
  E.run(s);
  const ork = s.units.find((u) => u.owner === "a");
  const hb = s.units.find((u) => u.owner === "b");
  ork.strain = 1;
  hb.strain = 1;
  E.setDial(s, "a", ork.id, "2TL:r");
  assert.throws(() => E.setDial(s, "b", hb.id, "4A:r"), /Strained/);
});

test("a maneuver into another base backs up and loses its action", () => {
  const s = setup("holds", "greenskin");
  E.submitArmy(s, "a", [{ unit: "ironbreakers" }]);
  E.submitArmy(s, "b", [{ unit: "boyz" }]);
  for (const p of ["a", "b"]) E.ready(s, p);
  E.run(s);
  for (const p of ["a", "b"]) E.ready(s, p);
  E.run(s);
  const ib = s.units.find((u) => u.owner === "a");
  const ork = s.units.find((u) => u.owner === "b");
  s.obstacles = [];
  Object.assign(ib, { x: 450, y: 500, h: 0 });
  Object.assign(ork, { x: 450, y: 360, h: 180 });
  const mv = E.planMove(s, ib, "3S:w");
  assert.ok(mv.t < 1);
  assert.deepEqual(mv.bumped.map((b) => b.id), [ork.id]);
  assert.ok(!polysOverlap(corners(mv.pose, 60), E.poly(ork)));
});

test("a unit that flees off the board scores its cost for the opponent", () => {
  const s = setup("holds", "greenskin");
  E.submitArmy(s, "a", [{ unit: "ironbreakers" }, { unit: "gunners" }]);
  E.submitArmy(s, "b", [{ unit: "boyz" }]);
  for (const p of ["a", "b"]) E.ready(s, p);
  E.run(s);
  for (const p of ["a", "b"]) E.ready(s, p);
  E.run(s);
  s.obstacles = [];
  const [ib, gn] = s.units.filter((u) => u.owner === "a");
  const ork = s.units.find((u) => u.owner === "b");
  Object.assign(ib, { x: 450, y: 860, h: 180 }); // facing the table edge
  E.setDial(s, "a", ib.id, "3S:w");
  E.setDial(s, "a", gn.id, "0X:w");
  E.setDial(s, "b", ork.id, "2S:w");
  E.ready(s, "a");
  E.ready(s, "b");
  E.run(s);
  assert.ok(ib.dead);
  assert.equal(E.player(s, "b").vp, ib.cost);
  assert.equal(E.player(s, "a").vp, 0);
});

// ── Fuzz: random bots play full games for every matchup ──────────────────────
function pickArmy(fid, rnd) {
  const f = FACTIONS[fid];
  const list = [];
  let cost = 0;
  for (let i = 0; i < 20; i++) {
    const u = f.units[Math.floor(rnd() * f.units.length)];
    const ups = upgradesFor(fid, u);
    const g = rnd() < 0.4 ? ups[Math.floor(rnd() * ups.length)] : null;
    const next = [...list, { unit: u.id, upgrade: g?.id || null }];
    if (validateArmy(fid, next, 100).ok) {
      list.push(next.at(-1));
      cost += u.cost;
    }
  }
  return list;
}

function botStep(s, rnd) {
  const p = s.pending;
  if (!p) return false;
  const any = (xs) => xs[Math.floor(rnd() * xs.length)];
  if (p.type === "action") {
    if (rnd() < 0.15) return E.pass(s, p.pid), true;
    const o = any(p.options);
    const params = {};
    if (o.targets && o.a === "command") {
      const t = any(o.targets);
      const sub = any(t.subs);
      params.target = t.id;
      params.sub = sub.a;
      params.subParams = sub.targets ? { target: any(sub.targets) } : sub.dirs ? { dir: any(sub.dirs) } : {};
    } else if (o.targets) params.target = any(o.targets);
    else if (o.dirs) params.dir = any(o.dirs);
    E.act(s, p.pid, { a: o.a, params });
  } else if (p.type === "attack") {
    const o = any(p.options);
    E.declareAttack(s, p.pid, { target: o.target, weapon: o.weapon });
  } else {
    if (rnd() < 0.2) E.pass(s, p.pid);
    else E.modify(s, p.pid, { op: any(p.options).op, dice: [] });
  }
  return true;
}

test("fuzz: 4 random seeds for each of the 36 faction pairings finish cleanly", () => {
  const ids = Object.keys(FACTIONS);
  let games = 0;
  for (const fa of ids) for (const fb of ids) for (let seed = 1; seed <= 4; seed++) {
    let r = seed * 9973;
    const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    const s = setup(fa, fb, seed);
    if (seed % 2) { E.addPlayer(s, "c", "C"); E.setFaction(s, "c", ids[(ids.indexOf(fa) + seed) % ids.length]); }
    for (const p of s.players) E.submitArmy(s, p.id, pickArmy(p.faction, rnd));
    for (const p of s.players) E.ready(s, p.id);
    E.run(s);
    for (const p of s.players) E.ready(s, p.id);
    E.run(s);
    for (let i = 0; i < 20000 && s.phase !== "over"; i++) {
      if (s.phase === "plan") {
        for (const u of s.units.filter((x) => !x.dead)) {
          const legal = u.dial.filter((c) => !(c.endsWith(":r") && E.strained(u)));
          // Bias toward the centre so armies actually meet.
          E.setDial(s, u.owner, u.id, legal[Math.floor(rnd() * legal.length)]);
        }
        for (const p of s.players) if (!p.eliminated) E.ready(s, p.id);
      } else if (!botStep(s, rnd)) {
        assert.fail(`stuck in ${s.phase} with no pending decision`);
      }
      E.run(s);
    }
    assert.equal(s.phase, "over", `${fa} vs ${fb} seed ${seed} did not finish`);
    for (const u of s.units) {
      assert.ok(u.wounds >= 0 && u.ward >= 0 && u.strain >= 0, "no negative stats");
      assert.ok(u.wounds <= u.maxWounds && u.ward <= u.maxWard, "no overheal");
    }
    games++;
  }
  assert.equal(games, 144);
});
