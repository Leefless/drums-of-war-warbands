// Line of sight through units and melee base contact (playtest 2026-10-25): another unit's base
// between attacker and target blocks the attack, and melee weapons only reach bases in contact.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as E from "../shared/engine.js";

const A = "tokenAAAA1111";
const B = "tokenBBBB2222";

/** A table in the Engagement with the given units placed by hand on open ground. */
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
  const place = (units, specs) => units.forEach((u, i) => Object.assign(u, { x: specs[i].x, y: specs[i].y, h: specs[i].h ?? 0 }));
  place(s.units.filter((u) => u.owner === A), mine);
  place(s.units.filter((u) => u.owner === B), theirs);
  s.phase = "engagement";
  return s;
}
const check = (s, i, j) => E.attackCheck(s, s.units[i], s.units[j], s.units[i].weapons[0]);

test("melee weapons need base contact; range 1 alone is not enough", () => {
  // Medium bases are 60 wide: centres 110 apart leave a 50 gap (range 1, not touching).
  let s = table([{ unit: "ironbreakers", x: 500, y: 600 }], [{ unit: "halberdiers", x: 500, y: 490, h: 180 }]);
  assert.deepEqual([check(s, 0, 1).ok, check(s, 0, 1).why, check(s, 0, 1).range], [false, "contact", 1]);
  s = table([{ unit: "ironbreakers", x: 500, y: 600 }], [{ unit: "halberdiers", x: 500, y: 538, h: 180 }]);
  assert.equal(check(s, 0, 1).ok, true, "a 2-unit gap is contact");
});

test("a weapon reaching past range 1 still strikes anywhere in the range 1 band", () => {
  // Lizard Skirmishers (blowpipes, range 1 to 2) 60 units short of an Ironbreaker: no contact needed.
  const s = table([{ unit: "ironbreakers", x: 500, y: 490, h: 180 }], [{ unit: "conLizardSkirmishers", x: 500, y: 600, h: 0 }]);
  const [wall, lizards] = s.units;
  const c = E.attackCheck(s, lizards, wall, lizards.weapons[0]);
  assert.deepEqual([c.ok, c.range], [true, 1]);
  // The Ironbreakers' hammers, at the same distance, cannot reach back.
  assert.equal(E.attackCheck(s, wall, lizards, wall.weapons[0]).why, "contact");
});

test("an enemy base between attacker and target blocks the shot; your own units never do", () => {
  // Gunners (range 2 to 3) fire north at a target 250 away with a unit squarely between.
  const s = table(
    [{ unit: "gunners", x: 500, y: 700 }, { unit: "ironbreakers", x: 300, y: 700 }],
    [{ unit: "halberdiers", x: 500, y: 450, h: 180 }, { unit: "halberdiers", x: 500, y: 575, h: 180 }],
  );
  const [gun, wall, foe, screen] = s.units;
  assert.equal(E.attackCheck(s, gun, foe, gun.weapons[0]).why, "blocked", "an enemy in the way blocks");
  Object.assign(screen, { x: 620 }); // the screen steps aside
  assert.equal(E.attackCheck(s, gun, foe, gun.weapons[0]).ok, true, "a clear line fires");
  Object.assign(wall, { x: 500, y: 575 }); // a friendly shield wall in front of the guns
  assert.equal(E.attackCheck(s, gun, foe, gun.weapons[0]).ok, true, "friends never block your shots");
  Object.assign(wall, { x: 300, y: 700 });
  Object.assign(screen, { x: 548 }); // only just clipping the line: past the corner
  assert.equal(E.attackCheck(s, gun, foe, gun.weapons[0]).ok, true, "a shot past a corner gets through");
  Object.assign(screen, { x: 500 });
  s.obstacles = [{ id: "h1", kind: "hill", x: 500, y: 700, r: 80 }];
  assert.equal(E.attackCheck(s, gun, foe, gun.weapons[0]).ok, true, "high ground fires over the ranks");
});

test("a move blocked by a friend or rocks backs away at half speed, facing unchanged; an enemy bump stays in contact", () => {
  // Ironbreakers 3-straight north (base 60 + 120 = 180 long) with a blocker 140 ahead.
  const run = (blocker) => {
    const s = table([{ unit: "ironbreakers", x: 500, y: 700 }, ...(blocker === "friend" ? [{ unit: "ironbreakers", x: 500, y: 560 }] : [])],
      blocker === "enemy" ? [{ unit: "halberdiers", x: 500, y: 560, h: 180 }] : [{ unit: "halberdiers", x: 100, y: 100 }]);
    if (blocker === "rocks") s.obstacles = [{ id: "r1", kind: "block", x: 500, y: 545, r: 30 }];
    const u = s.units[0];
    const code = "3S:w";
    const mv = E.planMove(s, u, code);
    return { mv, u, s };
  };
  for (const blocker of ["friend", "rocks"]) {
    const { mv } = run(blocker);
    assert.ok(mv.backedOff > 0, `${blocker}: it backs away`);
    assert.equal(mv.pose.h, 0, `${blocker}: facing unchanged`);
    const stopped = mv.path.at(-2);
    assert.ok(mv.pose.y > stopped.y, `${blocker}: away from the blocker (south)`);
    assert.ok(Math.abs(mv.pose.y - stopped.y - mv.backedOff) < 0.01);
  }
  const { mv, s, u } = run("enemy");
  assert.equal(mv.backedOff, 0, "an enemy bump does not back away");
  const moved = { ...u, x: mv.pose.x, y: mv.pose.y, h: mv.pose.h };
  assert.equal(E.attackCheck(s, moved, s.units[1], u.weapons[0]).ok, true, "it ends in contact and can fight");
});

test("hills no longer stretch melee to range 2", () => {
  const s = table([{ unit: "ironbreakers", x: 500, y: 600 }], [{ unit: "halberdiers", x: 500, y: 420, h: 180 }]);
  s.obstacles = [{ id: "h1", kind: "hill", x: 500, y: 600, r: 80 }];
  assert.equal(check(s, 0, 1).why, "range");
});
