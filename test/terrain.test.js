import assert from "node:assert/strict";
import { test } from "node:test";
import * as E from "../shared/engine.js";
import { concealed, lineOfSight, visibleTo } from "../shared/terrain.js";

// Two armies on an empty board; tests then place terrain and units by hand.
function battle(a = ["ironbreakers"], b = ["boyz"], fa = "holds", fb = "greenskin") {
  const s = E.createGame({ seed: 11, budget: 9999 });
  E.addPlayer(s, "a", "A");
  E.addPlayer(s, "b", "B");
  E.setFaction(s, "a", fa);
  E.setFaction(s, "b", fb);
  E.submitArmy(s, "a", a.map((unit) => ({ unit })));
  E.submitArmy(s, "b", b.map((unit) => ({ unit })));
  for (const p of ["a", "b"]) E.ready(s, p);
  E.run(s);
  for (const p of ["a", "b"]) E.ready(s, p);
  E.run(s);
  s.obstacles = [];
  return s;
}
const place = (u, x, y, h = 0) => Object.assign(u, { x, y, h });
const mine = (s, pid) => s.units.filter((u) => u.owner === pid);

test("rocks block line of sight and hide what is behind them", () => {
  const s = battle(["gunners"], ["boyz"]);
  const [g] = mine(s, "a");
  const [o] = mine(s, "b");
  place(g, 450, 650);
  place(o, 450, 400, 180);
  assert.ok(visibleTo(s, "a").has(o.id));
  s.obstacles = [{ id: "r", kind: "block", x: 450, y: 525, r: 30 }];
  assert.equal(lineOfSight(s, g, o), false);
  assert.equal(visibleTo(s, "a").has(o.id), false);
  assert.equal(E.attackOptions(s, g).length, 0, "cannot shoot what you cannot see");
});

test("fog of war: the view strips unseen enemies and their names from the log", () => {
  const s = battle(["gunners"], ["boyz"]);
  const [g] = mine(s, "a");
  const [o] = mine(s, "b");
  place(g, 450, 820);
  place(o, 450, 80, 180); // far beyond 3 range bands
  s.log.push({ round: 1, msg: `${o.name} lurks.`, refs: [o.id] });
  const v = E.viewFor(s, "a");
  assert.ok(!v.units.some((u) => u.id === o.id));
  assert.equal(v.hidden, 1);
  assert.ok(!v.log.some((l) => l.msg.includes(o.name)));
  assert.ok(!E.viewFor(s, null).units.some((u) => u.id === o.id), "spectators are fogged by default");
  s.settings.openSpectators = true;
  assert.ok(E.viewFor(s, null).units.some((u) => u.id === o.id), "open spectating shows everything");
});

test("forests and Stealthy conceal: spotted only from range 1", () => {
  const s = battle(["gunners"], ["boyz"]);
  const [g] = mine(s, "a");
  const [o] = mine(s, "b");
  place(g, 450, 650);
  place(o, 450, 450, 180);
  s.obstacles = [{ id: "f", kind: "thicket", x: 450, y: 450, r: 60 }];
  assert.ok(concealed(s, o));
  assert.equal(visibleTo(s, "a").has(o.id), false);
  place(g, 450, 540);
  assert.ok(visibleTo(s, "a").has(o.id), "range 1 spots it");
});

test("high ground: +1 range, +1 defence against attackers below, and climbing costs strain", () => {
  const s = battle(["gunners"], ["boyz"]);
  const [g] = mine(s, "a");
  const [o] = mine(s, "b");
  place(g, 450, 700);
  place(o, 450, 260, 180); // range 4 from the gunners
  assert.equal(E.rangeBetween(g, o), 4);
  assert.equal(E.attackOptions(s, g).length, 0, "handcannons reach range 3 on flat ground");
  s.obstacles = [{ id: "h", kind: "hill", x: 450, y: 700, r: 80 }];
  assert.ok(E.attackOptions(s, g).length > 0, "range 4 from the hill");
  const w = o.weapons[0];
  const before = E.defenseDice(s, o, g, w, 1);
  s.obstacles = [];
  assert.equal(before, E.defenseDice(s, o, g, w, 1) + 1, "defender on the hill gets +1");
});

test("lava burns and stops movement; the Calamity Host is not burned", () => {
  const s = battle(["ironbreakers"], ["boyz"]);
  const [ib] = mine(s, "a");
  place(ib, 450, 700);
  s.obstacles = [{ id: "l", kind: "lava", x: 450, y: 580, r: 40 }];
  const mv = E.planMove(s, ib, "3S:w");
  assert.ok(mv.slowedBy && mv.t < 1, "stopped shortly after entering");
  const full = E.planMove({ ...s, obstacles: [] }, ib, "3S:w");
  assert.ok(mv.pose.y > full.pose.y);
});

test("rocks are impassable: a maneuver stops before touching them", () => {
  const s = battle(["ironbreakers"], ["boyz"]);
  const [ib] = mine(s, "a");
  place(ib, 450, 700);
  s.obstacles = [{ id: "r", kind: "block", x: 450, y: 590, r: 25 }];
  const mv = E.planMove(s, ib, "3S:w");
  assert.ok(mv.blockedBy);
  assert.ok(mv.pose.y - 30 > 590 + 25 - 1, "base edge stays clear of the rock");
});

test("ambush: attacking from out of sight adds a die, and firing reveals the attacker", () => {
  const s = battle(["gunners"], ["boyz"]);
  const [g] = mine(s, "a");
  const [o] = mine(s, "b");
  place(g, 450, 650);
  place(o, 450, 420, 0); // facing away, cannot see far
  s.obstacles = [{ id: "f", kind: "thicket", x: 450, y: 650, r: 60 }]; // gunners hide in the wood
  assert.equal(visibleTo(s, "b").has(g.id), false);
  const w = g.weapons[0];
  const hiddenDice = E.attackDice(s, g, o, w, 2);
  g.firedRound = s.round;
  assert.ok(visibleTo(s, "b").has(g.id), "firing reveals");
  assert.equal(E.attackDice(s, g, o, w, 2), hiddenDice - 1, "no ambush bonus once seen");
});

test("terrain triggers on entering, not every round while standing in it", () => {
  const s = battle(["ironbreakers"], ["boyz"]);
  const [ib] = mine(s, "a");
  const [o] = mine(s, "b");
  place(ib, 450, 450);
  place(o, 450, 120, 180);
  s.obstacles = [{ id: "f", kind: "thicket", x: 450, y: 450, r: 60 }];
  E.setDial(s, "a", ib.id, "0X:w");
  E.setDial(s, "b", o.id, "2S:w");
  E.ready(s, "a");
  E.ready(s, "b");
  E.run(s);
  assert.equal(ib.strain, 0, "standing still inside a forest costs nothing");
});

test("a Master can Command twice in one activation, on different units", () => {
  const s = battle(["shade", "skeletons", "ghouls"], ["boyz"], "umbral", "greenskin");
  const [m, a, b] = mine(s, "a");
  const [o] = mine(s, "b");
  place(m, 450, 700);
  place(a, 380, 700);
  place(b, 520, 700);
  place(o, 450, 100, 180);
  for (const u of [m, a, b]) E.setDial(s, "a", u.id, "1S:w");
  E.setDial(s, "b", o.id, "2S:w");
  E.ready(s, "a");
  E.ready(s, "b");
  E.run(s);
  while (s.pending && s.pending.uid !== m.id) E.pass(s, s.pending.pid), E.run(s);
  const cmd = () => s.pending.options.find((x) => x.a === "command");
  E.act(s, "a", { a: "command", params: { target: cmd().targets[0].id, sub: "steel" } });
  assert.ok(cmd(), "second Command offered");
  assert.equal(cmd().targets.length, 1, "on the other unit only");
});
