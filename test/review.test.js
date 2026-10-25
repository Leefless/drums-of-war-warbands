// Regressions from the 2026-10-24 adversarial review: private tokens, fog of war in the log,
// the winner of a mutual wipe, terrain counting toward the DP, preset upgrades and item Aim rows.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as E from "../shared/engine.js";
import { PRESETS, presetBuild } from "../shared/presets.js";

const A = "tokenAAAA1111";
const B = "tokenBBBB2222";

function battle(fa = "umbral", fb = "concord", buys = []) {
  const s = E.createGame({ seed: 11, budget: 100 });
  E.addPlayer(s, A, "Ann");
  E.addPlayer(s, B, "Bo");
  E.setFaction(s, A, fa);
  E.setFaction(s, B, fb);
  const pick = (f) => [{ unit: (f === "umbral" ? "skeletons" : "halberdiers") }];
  E.submitArmy(s, A, pick(fa), buys);
  E.submitArmy(s, B, pick(fb));
  E.run(s);
  return s;
}

test("views never carry a private player token, even after a Poison hit", () => {
  const s = battle();
  assert.equal(s.phase, "deploy");
  const victim = s.units.find((u) => u.owner === B);
  Object.assign(victim.cond, { bleeding: true, bleedingBy: A });
  for (const viewer of [A, B, null]) {
    const json = JSON.stringify(E.viewFor(s, viewer));
    assert.ok(!json.includes(A) && !json.includes(B), `token leaked to ${viewer ?? "a watcher"}`);
  }
  assert.equal(victim.cond.bleedingBy, A, "the server copy keeps the poisoner for scoring");
});

test("fog of war: a log line about what an unseen enemy did says only that it acted", () => {
  const s = battle();
  const foe = s.units.find((u) => u.owner === B);
  E.run(s);
  s.phase = "plan";
  s.log.push({ round: 1, msg: `${foe.name} executes 3S w.`, refs: [foe.id] });
  // Their warbands start at opposite edges, beyond sight of each other.
  const v = E.viewFor(s, A);
  assert.ok(!v.units.some((u) => u.id === foe.id), "the enemy is out of sight");
  assert.equal(v.log.at(-1).msg, "An unseen enemy acts.");
  assert.ok(!v.players.find((p) => p.id === "p1").buys, "opponent terrain purchases stay private");
});

test("a mutual wipe is decided among the warbands still fighting; an exact tie is a draw", () => {
  const three = () => {
    const s = E.createGame({ seed: 3 });
    for (const [id, f] of [[A, "holds"], [B, "sylvan"], ["tokenCCCC3333", "umbral"]]) {
      E.addPlayer(s, id, id);
      E.setFaction(s, id, f);
    }
    s.phase = "engagement";
    s.round = 4;
    s.units = s.players.map((p, i) => ({ id: `u${i}`, owner: p.id, name: `U${i}`, cost: 10, dead: false, dying: false, cond: {}, tokens: {}, abilities: [] }));
    s.queue = [];
    return s;
  };
  // A scored big, then surrendered; B and C wipe each other out in the same round.
  let s = three();
  s.players[0].vp = 500;
  E.surrender(s, A);
  s.players[1].vp = 20;
  for (const u of s.units) u.dying = true;
  E.run(s);
  assert.equal(s.phase, "over");
  assert.equal(s.winner, B, "the surrendered warband cannot win");
  // Level scores: a draw, not the lowest seat.
  s = three();
  E.surrender(s, A);
  for (const u of s.units) u.dying = true;
  E.run(s);
  assert.equal(s.winner, null);
  assert.equal(s.draw, true);
});

test("terrain bought in the muster counts toward the DP when the host lowers it", () => {
  const s = E.createGame({ seed: 5, budget: 100 });
  E.addPlayer(s, A, "Ann");
  E.addPlayer(s, B, "Bo");
  E.setFaction(s, A, "holds");
  E.setFaction(s, B, "holds");
  const list = [{ unit: "ironbreakers" }, { unit: "ironbreakers" }];
  const v = E.submitArmy(s, A, list, ["hill", "hill", "hill"]);
  const spent = s.players[0].spent;
  E.setSettings(s, A, { budget: spent - 1 });
  assert.throws(() => E.ready(s, A), /Over the DP limit/);
  void v;
});

test("a failed Ready in deployment leaves unplaced terrain in hand", () => {
  const s = E.createGame({ seed: 9, budget: 100 });
  E.addPlayer(s, A, "Ann");
  E.addPlayer(s, B, "Bo");
  E.setFaction(s, A, "holds");
  E.setFaction(s, B, "holds");
  E.submitArmy(s, A, [{ unit: "ironbreakers" }, { unit: "gunners" }], ["hill"]);
  E.submitArmy(s, B, [{ unit: "ironbreakers" }]);
  E.run(s);
  const [u1, u2] = s.units.filter((u) => u.owner === A);
  Object.assign(u2, { x: u1.x, y: u1.y }); // stack them so Ready must fail
  assert.throws(() => E.ready(s, A), /overlap/);
  assert.deepEqual(s.players[0].toPlace, ["hill"]);
});

test("prebuilt warbands keep the upgrades they were written with, where they fit", () => {
  const hunt = PRESETS.concord.find((p) => p.id === "concord-witch-hunt");
  const authored = hunt.list.find((e) => e.upgrade);
  const built = presetBuild("concord", hunt, 100).list;
  assert.ok(built.some((e) => e.unit === authored.unit && e.upgrade === authored.upgrade), `${authored.unit}:${authored.upgrade} missing`);
});

test("a magic item that gives a melee unit range brings the Aim row", () => {
  const s = E.createGame({ seed: 2, budget: 100 });
  E.addPlayer(s, A, "Ann");
  E.addPlayer(s, B, "Bo");
  E.setFaction(s, A, "calamity");
  E.setFaction(s, B, "holds");
  E.submitArmy(s, A, [{ unit: "calKoboldCultists", item: "calamity-cinderspear" }, { unit: "calKoboldCultists" }]);
  E.submitArmy(s, B, [{ unit: "ironbreakers" }]);
  E.run(s);
  const [armed, plain] = s.units.filter((u) => u.owner === A);
  assert.ok(armed.weapons.some((w) => w.range[1] >= 2));
  assert.ok(armed.dial.length > plain.dial.length, "the item carrier gains the Aim row");
});

test("a seat whose warband is out of the battle watches with full sight", () => {
  const C = "tokenCCCC3333";
  const s = E.createGame({ seed: 11, budget: 100 });
  for (const [id, f] of [[A, "umbral"], [B, "concord"], [C, "holds"]]) {
    E.addPlayer(s, id, id);
    E.setFaction(s, id, f);
  }
  E.submitArmy(s, A, [{ unit: "skeletons" }]);
  E.submitArmy(s, B, [{ unit: "halberdiers" }]);
  E.submitArmy(s, C, [{ unit: "ironbreakers" }]);
  E.run(s);
  assert.ok(E.viewFor(s, A).hidden > 0, "premise: fog hides enemies from a seat still fighting");
  E.surrender(s, A);
  assert.equal(s.phase, "deploy", "premise: two warbands fight on");
  const v = E.viewFor(s, A);
  assert.equal(v.hidden, 0, "nothing is hidden from a knocked-out seat");
});
