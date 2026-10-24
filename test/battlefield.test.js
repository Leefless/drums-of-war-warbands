import assert from "node:assert/strict";
import { test } from "node:test";
import { HUNT_RING, MAPS, TERRAIN_SHOP, hunterOf, mapEffect, matchupDice, preyOf, terrainLimit } from "../shared/battlefield.js";
import { FACTIONS, validateArmy } from "../shared/factions.js";
import { ITEMS, applyItem, checkItems, itemCost, itemsFor } from "../shared/items.js";
import { unitCost } from "../shared/cost.js";
import * as E from "../shared/engine.js";

function game(fa, fb, listA, listB, opts = {}) {
  const s = E.createGame({ seed: 11, budget: opts.budget ?? 100 });
  E.addPlayer(s, "a", "A");
  E.addPlayer(s, "b", "B");
  E.setFaction(s, "a", fa);
  E.setFaction(s, "b", fb);
  E.submitArmy(s, "a", listA, opts.buysA ?? []);
  E.submitArmy(s, "b", listB, opts.buysB ?? []);
  E.run(s);
  return s;
}

test("every army has 20 to 50 legal magic items, each priced by the cost model", () => {
  for (const fid of Object.keys(FACTIONS)) {
    assert.deepEqual(checkItems(fid), [], `${fid} items`);
    for (const it of ITEMS[fid]) for (const uid of it.units) {
      const u = FACTIONS[fid].units.find((x) => x.id === uid);
      const delta = unitCost(applyItem(u, it), u.dial) - unitCost(u, u.dial);
      assert.ok(itemCost(fid, it, uid) >= Math.round(delta * (u.champion ? 1.15 : 1)) - 1, `${it.id} on ${uid} priced at least its value`);
    }
  }
});

test("items: one per unit, once per army, only on named units, and the unit gets the item's profile", () => {
  const it = ITEMS.holds.find((x) => x.units.some((id) => !FACTIONS.holds.units.find((u) => u.id === id).champion) && x.effect.dice);
  const uid = it.units.find((id) => !FACTIONS.holds.units.find((u) => u.id === id).champion);
  const other = FACTIONS.holds.units.find((u) => !u.champion && !it.units.includes(u.id));
  const base = validateArmy("holds", [{ unit: uid }], 100).cost;
  assert.equal(validateArmy("holds", [{ unit: uid, item: it.id }], 100).cost, base + itemCost("holds", it, uid));
  assert.ok(!validateArmy("holds", [{ unit: other.id, item: it.id }], 100).ok, "not on a unit it does not name");
  assert.ok(!validateArmy("holds", [{ unit: uid, item: it.id }, { unit: uid, item: it.id }], 999).ok, "once per army");
  const s = game("holds", "sylvan", [{ unit: uid, item: it.id }], [{ unit: "wardens" }]);
  const u = s.units.find((x) => x.owner === "a");
  const def = FACTIONS.holds.units.find((x) => x.id === uid);
  assert.equal(u.item, it.id);
  assert.equal(u.weapons[0].dice, def.weapons[0].dice + it.effect.dice);
  assert.ok(itemsFor("holds", uid).some((x) => x.id === it.id));
});

test("terrain shop: bought pieces cost points, are limited, and are placed outside every zone", () => {
  const list = [{ unit: "ironbreakers" }];
  assert.equal(validateArmy("holds", list, 100, ["hill"]).cost, validateArmy("holds", list, 100).cost + TERRAIN_SHOP.hill);
  assert.ok(!validateArmy("holds", list, 100, Array(terrainLimit(100) + 1).fill("block")).ok);
  const s = game("holds", "sylvan", list, [{ unit: "wardens" }], { buysA: ["hill", "block"] });
  assert.equal(s.phase, "deploy");
  const a = E.player(s, "a");
  assert.deepEqual(a.toPlace.sort(), ["block", "hill"]);
  assert.throws(() => E.placeTerrain(s, "a", { kind: "hill", x: 450, y: 880 }), /outside every deployment zone/);
  // Find a legal open spot and place the hill there.
  let placed = false;
  for (let x = 200; x <= 700 && !placed; x += 10) for (let y = 200; y <= 700 && !placed; y += 10) {
    try { E.placeTerrain(s, "a", { kind: "hill", x, y }); placed = true; } catch { /* try the next spot */ }
  }
  assert.ok(placed, "found a spot for the hill");
  const hill = s.obstacles.find((o) => o.owner === "a" && o.kind === "hill");
  E.pickUpTerrain(s, "a", hill.id);
  assert.ok(a.toPlace.includes("hill"));
  E.ready(s, "a"); // readying places whatever is left
  assert.equal(a.toPlace.length, 0);
  assert.equal(s.obstacles.filter((o) => o.owner === "a").length, 2);
});

test("battlefield: the player with the most points left chooses it, once, and armies get their effects", () => {
  const s = game("holds", "concord", [{ unit: "ironbreakers" }], [{ unit: "halberdiers" }, { unit: "crossbows" }]);
  assert.equal(s.mapChooser, "a", "the cheaper army chooses");
  assert.throws(() => E.chooseMap(s, "b", "moor"), /most points in reserve/);
  const before = s.units.find((u) => u.owner === "b").init;
  E.chooseMap(s, "a", "meadow");
  assert.throws(() => E.chooseMap(s, "a", "scar"), /already chosen/);
  for (const p of ["a", "b"]) E.ready(s, p);
  E.run(s);
  assert.equal(s.phase, "plan");
  assert.equal(s.units.find((u) => u.owner === "b").init, Math.min(6, before + 1), "Concord is Swift on Greenmeadow");
  // Every army is helped by exactly one battlefield and hindered by exactly one.
  for (const fid of Object.keys(FACTIONS)) {
    const effects = Object.keys(MAPS).map((m) => mapEffect(m, fid)).filter(Boolean);
    const sign = (e) => (e.init || 0) + (e.melee || 0) + (e.ranged || 0);
    assert.equal(effects.filter((e) => sign(e) > 0).length, 1, `${fid} has one good battlefield`);
    assert.equal(effects.filter((e) => sign(e) < 0).length, 1, `${fid} has one bad battlefield`);
  }
});

test("matchups form a ring: each army hunts one and is hunted by one", () => {
  for (const f of HUNT_RING) {
    assert.equal(hunterOf(preyOf(f)), f);
    assert.equal(matchupDice(f, preyOf(f)), 1);
    assert.equal(matchupDice(preyOf(f), f), 0, "the prey has no penalty, only the hunter an edge");
    assert.equal(matchupDice(f, f), 0);
  }
  assert.equal(new Set(HUNT_RING.map(preyOf)).size, 6, "nobody is everyone's prey");
});

test("the battlefield chooser and bought terrain never reveal a player's private token", () => {
  const s = game("holds", "sylvan", [{ unit: "ironbreakers" }], [{ unit: "wardens" }], { buysA: ["hill"] });
  E.ready(s, "a"); // auto-places the hill
  for (const viewer of ["a", "b", null]) {
    const v = JSON.stringify(E.viewFor(s, viewer));
    assert.ok(!/"mapChooser":"a"|"owner":"a"|"owner":"b"/.test(v), `no raw ids for viewer ${viewer}`);
  }
  assert.equal(E.viewFor(s, "b").mapChooser, "p1", "B spent less, so B chooses, shown by seat id");
});
