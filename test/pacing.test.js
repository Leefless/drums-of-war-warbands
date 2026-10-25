// Turn and combat clarity: the pause after each attack, the attack's step record, log metadata
// for the screens, and pacing settings.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as E from "../shared/engine.js";

const A = "tokenAAAA1111";
const B = "tokenBBBB2222";

/** Two archer-heavy lines facing each other at range 2, ready for the engagement phase. */
function closeQuarters(settings = {}) {
  const s = E.createGame({ seed: 4, budget: 100, ...settings });
  E.addPlayer(s, A, "Ann");
  E.addPlayer(s, B, "Bo");
  E.setFaction(s, A, "holds");
  E.setFaction(s, B, "holds");
  E.submitArmy(s, A, [{ unit: "gunners" }]);
  E.submitArmy(s, B, [{ unit: "gunners" }]);
  E.run(s);
  const [a, b] = s.units;
  Object.assign(a, { x: 450, y: 560, h: 0 });
  Object.assign(b, { x: 450, y: 340, h: 180 });
  s.obstacles = [];
  E.ready(s, A);
  E.ready(s, B);
  E.run(s);
  for (const u of s.units) E.setDial(s, u.owner, u.id, u.dial.find((c) => c.startsWith("0")) || u.dial[0]);
  E.ready(s, A);
  E.ready(s, B);
  E.run(s);
  // Pass every action until someone is asked to attack.
  for (let i = 0; i < 20 && s.pending?.type === "action"; i++) {
    E.pass(s, s.pending.pid);
    E.run(s);
  }
  return s;
}

/** Declare the first legal attack and pass through every dice choice until it resolves. */
function fightOnce(s) {
  assert.equal(s.pending?.type, "attack", "someone should be able to attack");
  const o = s.pending.options[0];
  E.declareAttack(s, s.pending.pid, { target: o.target, weapon: o.weapon });
  for (let i = 0; i < 10 && s.attack; i++) E.pass(s, s.pending.pid);
}

test("with pauses on, the battle holds after an attack until the beat is cleared", () => {
  const s = closeQuarters({ pauseAttacks: true });
  fightOnce(s);
  assert.ok(s.beat, "a beat follows the attack");
  assert.equal(s.beat.n, s.lastAttack.n);
  const before = JSON.stringify([s.phase, s.queue, s.pending]);
  E.run(s);
  assert.equal(JSON.stringify([s.phase, s.queue, s.pending]), before, "run() waits while the beat is up");
  E.clearBeat(s);
  E.run(s);
  assert.ok(!s.beat);
});

test("without pauses, the battle carries straight on", () => {
  const s = closeQuarters();
  fightOnce(s);
  assert.equal(s.beat, null);
});

test("an attack records every roll and modifier in order", () => {
  const s = closeQuarters();
  fightOnce(s);
  const steps = s.lastAttack.steps;
  assert.deepEqual(steps[0], { side: "atk", op: "roll", faces: steps[0].faces });
  assert.ok(steps.some((x) => x.side === "def" && x.op === "roll"), "the defence roll is recorded");
  assert.equal(typeof s.lastAttack.armored, "boolean");
  assert.ok(s.lastAttack.n >= 1);
});

test("log lines carry phase and the acting army by public seat, never a private token", () => {
  const s = closeQuarters();
  fightOnce(s);
  for (const viewer of [A, B, null]) {
    const v = E.viewFor(s, viewer);
    assert.ok(!JSON.stringify(v).includes(A) && !JSON.stringify(v).includes(B), "no token in the view");
    const attackLine = v.log.find((e) => / attacks /.test(e.msg));
    assert.ok(attackLine, "the attack is in the log");
    assert.match(attackLine.who, /^p[0-3]$/);
    assert.equal(attackLine.phase, "engagement");
    for (const id of attackLine.refs) assert.ok(v.units.some((u) => u.id === id), "refs only name units the viewer can see");
  }
});

test("computer speed and pauses are host settings that do not unready anyone", () => {
  const s = E.createGame();
  E.addPlayer(s, A, "Ann");
  E.addPlayer(s, B, "Bo");
  E.setFaction(s, A, "holds");
  E.setFaction(s, B, "holds");
  E.submitArmy(s, B, [{ unit: "gunners" }]);
  E.setSettings(s, A, { aiSpeed: "slow", pauseAttacks: true });
  assert.equal(s.settings.aiSpeed, "slow");
  assert.equal(s.settings.pauseAttacks, true);
  assert.equal(s.players[1].ready, true, "pacing changes keep others ready");
  E.setSettings(s, A, { aiSpeed: "warp" });
  assert.equal(s.settings.aiSpeed, "slow", "unknown speeds are ignored");
  E.setSettings(s, A, { budget: 150 });
  assert.equal(s.players[1].ready, false, "a DP change still unreadies");
});

test("a person with tied units chooses which goes first; a computer opponent is never asked", () => {
  const start = (aiOwner) => {
    const s = E.createGame({ seed: 8, budget: 100 });
    E.addPlayer(s, A, "Ann");
    E.addPlayer(s, B, "Bo");
    if (aiOwner) s.players[0].ai = true;
    E.setFaction(s, A, "holds");
    E.setFaction(s, B, "sylvan");
    E.submitArmy(s, A, [{ unit: "ironbreakers" }, { unit: "ironbreakers" }]); // two units at one initiative
    E.submitArmy(s, B, [{ unit: "wardens" }]);
    E.run(s);
    E.ready(s, A);
    E.ready(s, B);
    E.run(s);
    for (const u of s.units) E.setDial(s, u.owner, u.id, u.dial.find((c) => c.startsWith("1S")) || u.dial[0]);
    E.ready(s, A);
    E.ready(s, B);
    E.run(s);
    // Pass anything before Ann's tied pair comes up.
    for (let i = 0; i < 10 && s.pending && s.pending.type !== "pick" && s.pending.pid !== A; i++) E.pass(s, s.pending.pid), E.run(s);
    return s;
  };
  const s = start(false);
  assert.equal(s.pending?.type, "pick");
  assert.equal(s.pending.pid, A);
  const [first, second] = s.pending.options;
  E.takeTurn(s, A, second);
  E.run(s);
  assert.ok(s.units.find((u) => u.id === second).revealed, "the chosen unit moved first");
  assert.ok(!s.units.find((u) => u.id === first).revealed, "the other waits its turn");
  assert.throws(() => E.takeTurn(s, B, first), /not choosing/);
  const ai = start(true);
  assert.notEqual(ai.pending?.type, "pick");
});

test("a tie choice stands for the rest of the battle: the chosen unit goes first without asking", () => {
  const s = E.createGame({ seed: 8, budget: 100 });
  E.addPlayer(s, A, "Ann");
  E.addPlayer(s, B, "Bo");
  E.setFaction(s, A, "holds");
  E.setFaction(s, B, "sylvan");
  E.submitArmy(s, A, [{ unit: "ironbreakers" }, { unit: "ironbreakers" }]);
  E.submitArmy(s, B, [{ unit: "wardens" }]);
  E.run(s);
  E.ready(s, A);
  E.ready(s, B);
  E.run(s);
  const planAll = () => {
    for (const u of s.units.filter((x) => !x.dead)) E.setDial(s, u.owner, u.id, u.dial.find((c) => c.startsWith("0")) || u.dial[0]);
    E.ready(s, A);
    E.ready(s, B);
    E.run(s);
  };
  // Pass every choice except a pick, which is answered with `choose`.
  const playUntil = (stop, choose) => {
    for (let i = 0; i < 200 && !stop(); i++) {
      if (s.pending?.type === "pick") E.takeTurn(s, s.pending.pid, choose(s.pending.options));
      else if (s.pending) E.pass(s, s.pending.pid);
      E.run(s);
    }
  };
  planAll();
  playUntil(() => s.pending?.type === "pick", () => null);
  assert.equal(s.pending?.type, "pick");
  const chosen = s.pending.options[1];
  const other = s.pending.options[0];
  E.takeTurn(s, A, chosen);
  E.run(s);
  // Finish round 1 (any Engagement tie is answered the same way), then start round 2.
  playUntil(() => s.phase === "plan" && s.round === 2, (opts) => opts[0]);
  planAll();
  let asked = false;
  playUntil(() => s.phase !== "activation" || !!s.units.find((u) => u.id === other).revealed, () => ((asked = true), chosen));
  assert.equal(asked, false, "Ann is not asked again");
  assert.ok(s.units.find((u) => u.id === chosen).revealed, "the remembered unit moved first");
  assert.ok(!JSON.stringify(E.viewFor(s, B)).includes("tiePref"), "the chosen order stays private");
});

test("tie picks: remembered order applies only among ranked units; a new unit in the tie asks again", () => {
  const s = E.createGame({ seed: 8, budget: 100 });
  E.addPlayer(s, A, "Ann");
  E.addPlayer(s, B, "Bo");
  E.setFaction(s, A, "holds");
  E.setFaction(s, B, "sylvan");
  E.submitArmy(s, A, [{ unit: "ironbreakers" }, { unit: "ironbreakers" }, { unit: "ironbreakers" }]);
  E.submitArmy(s, B, [{ unit: "wardens" }]);
  E.run(s);
  const [x, y, z] = s.units.filter((u) => u.owner === A).map((u) => u.id);
  s.phase = "activation";
  const ask = (queue) => {
    s.pending = null;
    s.picked = null;
    s.queue = [...queue];
    E.run(s);
    return s.pending?.type === "pick" ? s.pending.options : null;
  };
  // x and y tie: Ann is asked and picks y.
  s.units.find((u) => u.id === z).dead = true;
  assert.deepEqual(ask([x, y])?.sort(), [x, y].sort());
  E.takeTurn(s, A, y);
  assert.deepEqual(s.players[0].tiePref.activation, { [y]: [x] }, "y was chosen over x");
  assert.equal(ask([x, y]), null, "the same tie does not ask again");
  assert.ok(!!s.units.find((u) => u.id === y).revealed && !s.units.find((u) => u.id === x).revealed, "the ranked unit goes first");
  // z joins the tie: it was never ranked, so Ann is asked again.
  s.units.find((u) => u.id === z).dead = false;
  for (const u of s.units) u.revealed = null;
  assert.ok(ask([x, y, z]), "a never-ranked unit makes the tie ask once more");
  assert.throws(() => E.takeTurn(s, B, z), /not choosing/, "only the owner may pick, while the pick is open");
  assert.throws(() => E.takeTurn(s, A, "nope"), /cannot go/);
  E.takeTurn(s, A, z);
  assert.deepEqual(s.players[0].tiePref.activation[z].sort(), [x, y].sort(), "z was chosen over both");
  // Next time all three tie, z goes, then y goes ahead of x, with no questions.
  for (const u of s.units) u.revealed = null;
  assert.equal(ask([x, y, z]), null);
  assert.ok(s.units.find((u) => u.id === z).revealed, "z first");
});

test("a fresh three-way tie asks twice: the first pick does not decide the order of the other two", () => {
  const s = E.createGame({ seed: 8, budget: 100 });
  E.addPlayer(s, A, "Ann");
  E.addPlayer(s, B, "Bo");
  E.setFaction(s, A, "holds");
  E.setFaction(s, B, "sylvan");
  E.submitArmy(s, A, [{ unit: "ironbreakers" }, { unit: "ironbreakers" }, { unit: "ironbreakers" }]);
  E.submitArmy(s, B, [{ unit: "wardens" }]);
  E.run(s);
  const ids = s.units.filter((u) => u.owner === A).map((u) => u.id);
  s.phase = "activation";
  s.queue = [...ids];
  E.run(s);
  assert.equal(s.pending?.type, "pick", "first question");
  E.takeTurn(s, A, ids[2]);
  E.run(s);
  while (s.pending?.type === "action") E.pass(s, A), E.run(s);
  assert.equal(s.pending?.type, "pick", "the remaining two are asked about too");
  assert.deepEqual(s.pending.options.sort(), [ids[0], ids[1]].sort());
});
