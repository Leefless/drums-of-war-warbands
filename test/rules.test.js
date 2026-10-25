// The attack check's reasons, pile in and back away, case by case. Every test that places units by
// hand asserts its premise (range band, contact, arc) before the behaviour, so it cannot pass for
// the wrong reason.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as E from "../shared/engine.js";
import { BASE_SIZE, corners, inArc, polyDistance } from "../shared/geometry.js";

const A = "tokenAAAA1111";
const B = "tokenBBBB2222";

/** Holds (A) against Concord (B) on open ground in the Engagement, units placed by hand. */
function table(mine, theirs) {
  const s = E.createGame({ seed: 3, budget: 300 });
  E.addPlayer(s, A, "Ann");
  E.addPlayer(s, B, "Bo");
  E.setFaction(s, A, "holds");
  E.setFaction(s, B, "concord");
  E.submitArmy(s, A, mine.map((m) => ({ unit: m.unit })));
  E.submitArmy(s, B, theirs.map((m) => ({ unit: m.unit })));
  E.run(s);
  s.obstacles = [];
  const place = (owner, specs) => s.units.filter((u) => u.owner === owner).forEach((u, i) => Object.assign(u, { x: specs[i].x, y: specs[i].y, h: specs[i].h ?? 0 }));
  place(A, mine);
  place(B, theirs);
  s.phase = "engagement";
  return s;
}
const gap = (a, b) => polyDistance(corners(a, BASE_SIZE[a.base]), corners(b, BASE_SIZE[b.base]));
const why = (s, u, t) => E.attackCheck(s, u, t, u.weapons[0]).why;

test("attackCheck names each reason in order: range, contact, stealthy, sight, blocked, arc", () => {
  // Gunners (handcannons, range 2 to 3, front arc) at the south, facing north.
  const s = table([{ unit: "gunners", x: 500, y: 700 }, { unit: "holdPathfinders", x: 100, y: 100 }], [{ unit: "halberdiers", x: 500, y: 580, h: 180 }]);
  const [gun, , foe] = s.units;
  assert.equal(E.rangeBetween(gun, foe), 1);
  assert.equal(why(s, gun, foe), "range", "inside the minimum range");
  Object.assign(foe, { y: 450 });
  assert.equal(E.rangeBetween(gun, foe), 2);
  assert.equal(why(s, gun, foe), null, "a clear shot");
  s.obstacles = [{ id: "r1", kind: "block", x: 500, y: 575, r: 20 }];
  assert.equal(why(s, gun, foe), "sight", "rocks in the way");
  s.obstacles = [];
  Object.assign(foe, { x: 500, y: 900 });
  assert.equal(E.rangeBetween(gun, foe), 2);
  assert.equal(why(s, gun, foe), "arc", "behind the gunners");
  // A blocker and a target behind: blocked is reported before arc.
  const t = table([{ unit: "gunners", x: 500, y: 700 }], [{ unit: "halberdiers", x: 500, y: 950, h: 0 }, { unit: "halberdiers", x: 500, y: 825, h: 0 }]);
  assert.equal(why(t, t.units[0], t.units[1]), "blocked");
  // Concord Crossbows on Holds Pathfinders (Stealthy) at range 3.
  const u = table([{ unit: "holdPathfinders", x: 500, y: 300, h: 180 }], [{ unit: "crossbows", x: 500, y: 600, h: 0 }]);
  const [scout, bows] = u.units;
  assert.equal(E.rangeBetween(bows, scout), 3);
  assert.ok(bows.weapons[0].range[1] >= 3, "premise: the crossbows reach range 3");
  assert.equal(why(u, bows, scout), "stealthy");
});

test("base contact boundary: a gap of 10 is contact, 11 is not", () => {
  const s = table([{ unit: "ironbreakers", x: 500, y: 600 }], [{ unit: "halberdiers", x: 500, y: 530, h: 180 }]);
  const [wall, foe] = s.units;
  assert.ok(Math.abs(gap(wall, foe) - 10) < 1e-6);
  assert.equal(why(s, wall, foe), null);
  Object.assign(foe, { y: 529 });
  assert.ok(Math.abs(gap(wall, foe) - 11) < 1e-6);
  assert.equal(why(s, wall, foe), "contact");
});

test("units in the way do not block a shot at a target on a hill or a Flying target", () => {
  const s = table([{ unit: "gunners", x: 500, y: 700 }], [{ unit: "halberdiers", x: 500, y: 450, h: 180 }, { unit: "halberdiers", x: 500, y: 575, h: 180 }]);
  const [gun, foe] = s.units;
  assert.equal(why(s, gun, foe), "blocked", "premise: the screen blocks");
  s.obstacles = [{ id: "h1", kind: "hill", x: 500, y: 450, r: 80 }];
  assert.equal(why(s, gun, foe), null, "a target on a hill is seen over the ranks");
  // Concord crossbows at Holds Gyrocopters (Flying) behind a Holds screen.
  const t = table([{ unit: "holdGyrocopters", x: 500, y: 300, h: 180 }, { unit: "ironbreakers", x: 500, y: 425, h: 180 }], [{ unit: "crossbows", x: 500, y: 550, h: 0 }]);
  const [gyro, , bows] = t.units;
  assert.ok(E.rangeBetween(bows, gyro) <= bows.weapons[0].range[1] && E.rangeBetween(bows, gyro) >= bows.weapons[0].range[0], "premise: in range");
  assert.equal(why(t, bows, gyro), null, "Flying units are above the ranks");
});

const engage = (s) => {
  s.phase = "activation";
  s.queue = [];
  E.run(s);
};

test("pile in goes to the nearest enemy in arc and never into one behind", () => {
  // Two halberdier blocks ahead at gaps 30 and 60 (both range 1, both in the front arc).
  const s = table([{ unit: "ironbreakers", x: 500, y: 600 }], [{ unit: "halberdiers", x: 470, y: 510, h: 180 }, { unit: "halberdiers", x: 560, y: 480, h: 180 }]);
  const [wall, near, far] = s.units;
  assert.ok(gap(wall, near) < gap(wall, far) && E.rangeBetween(wall, far) === 1, "premise: two enemies in range 1, one nearer");
  assert.ok(inArc(wall, "front", near, 60) && inArc(wall, "front", far, 60), "premise: both in the front arc");
  engage(s);
  assert.ok(gap(wall, near) <= E.CONTACT, "it closed on the nearer one");
  assert.ok(s.log.some((e) => e.msg === `${wall.name} piles in against ${near.name}.`), "and the nearer one is its target");
  // An enemy right behind (range 1, out of the front arc) is not piled into.
  const t = table([{ unit: "ironbreakers", x: 500, y: 600 }], [{ unit: "halberdiers", x: 500, y: 700, h: 0 }]);
  assert.equal(E.rangeBetween(t.units[0], t.units[1]), 1);
  const before = { x: t.units[0].x, y: t.units[0].y };
  engage(t);
  assert.deepEqual({ x: t.units[0].x, y: t.units[0].y }, before);
});

test("pile in does not push through a friendly base in the gap", () => {
  // A 70-unit gap with Holds Miners (small base) standing in it.
  const s = table([{ unit: "ironbreakers", x: 500, y: 600 }, { unit: "holdMiners", x: 500, y: 535 }], [{ unit: "halberdiers", x: 500, y: 470, h: 180 }]);
  const [wall, , foe] = s.units;
  assert.equal(E.rangeBetween(wall, foe), 1);
  assert.ok(gap(wall, foe) > E.CONTACT, "premise: not in contact");
  engage(s);
  assert.deepEqual({ x: wall.x, y: wall.y }, { x: 500, y: 600 }, "the way is not clear");
});

test("back away keeps the stopped facing and moves away from the blocker", () => {
  // A bank into a friend: the unit ends farther from the friend than where it stopped, facing unchanged.
  const t = table([{ unit: "ironbreakers", x: 500, y: 700 }, { unit: "ironbreakers", x: 560, y: 590 }], [{ unit: "halberdiers", x: 100, y: 100 }]);
  const w = t.units[0];
  const code = w.dial.find((c) => c.startsWith("2BR"));
  const bank = E.planMove(t, w, code);
  assert.ok(bank.bumped.length && bank.backedOff > 0, "premise: the bank bumps the friend and backs away");
  const stopped = bank.path[bank.path.length - 1 - Math.ceil(bank.backedOff / 5)];
  const friend = t.units[1];
  assert.ok(Math.hypot(bank.pose.x - friend.x, bank.pose.y - friend.y) > Math.hypot(stopped.x - friend.x, stopped.y - friend.y), "away from the friend");
  assert.equal(bank.pose.h, stopped.h, "facing unchanged while backing away");
});

test("tie rankings are kept separately for Activation and Engagement", () => {
  const s = table([{ unit: "gunners", x: 450, y: 700 }, { unit: "gunners", x: 550, y: 700 }], [{ unit: "halberdiers", x: 500, y: 470, h: 180 }]);
  const [g1, g2] = s.units;
  s.players.find((p) => p.id === A).tiePref = { activation: { [g2.id]: [g1.id] }, engagement: {} };
  assert.ok(E.attackOptions(s, g1).length && E.attackOptions(s, g2).length, "premise: both gunners can shoot");
  s.queue = [g1.id, g2.id, s.units[2].id];
  s.group = null;
  E.run(s);
  assert.equal(s.pending?.type, "pick", "the Activation ranking does not decide an Engagement tie");
});
