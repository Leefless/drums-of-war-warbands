// Privacy and fog of war across a whole battle: at every step, every seat's view, a watcher's view
// and a stranger's view are checked for private tokens, unseen enemies and other players' secrets.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as E from "../shared/engine.js";

const SEATS = [
  ["secretTokenAnnaaaa1", "holds", [{ unit: "ironbreakers" }, { unit: "ironbreakers" }, { unit: "gunners" }], ["hill"]],
  ["secretTokenBorisbb2", "concord", [{ unit: "halberdiers" }, { unit: "halberdiers" }, { unit: "crossbows" }], ["thicket"]],
  ["secretTokenCarlacc3", "umbral", [{ unit: "skeletons" }, { unit: "skeletons" }, { unit: "ghouls" }], []],
];
const TOKENS = SEATS.map((x) => x[0]);

function rng(seed) {
  let t = seed >>> 0;
  return () => ((t = (t + 0x6d2b79f5) >>> 0), ((Math.imul(t ^ (t >>> 15), t | 1) >>> 0) % 1e6) / 1e6);
}

/** One random legal decision for whoever the game is waiting on. */
function step(s, rnd) {
  const any = (xs) => xs[Math.floor(rnd() * xs.length)];
  if (s.phase === "deploy" || s.phase === "plan") {
    for (const p of s.players.filter((x) => !x.ready && !x.eliminated)) {
      if (s.phase === "plan") for (const u of s.units.filter((x) => x.owner === p.id && !x.dead)) E.setDial(s, p.id, u.id, any(u.dial.filter((c) => !c.endsWith(":r") || !E.strained(u))));
      E.ready(s, p.id);
    }
    return;
  }
  const p = s.pending;
  if (!p) return;
  if (p.type === "pick") E.takeTurn(s, p.pid, any(p.options));
  else if (p.type === "attack") E.declareAttack(s, p.pid, { target: p.options[0].target, weapon: p.options[0].weapon });
  else if (p.type === "action" && p.options.some((o) => o.a === "steel" || o.a === "guard")) E.act(s, p.pid, { a: p.options.find((o) => o.a === "steel" || o.a === "guard").a, params: {} });
  else if ((p.type === "attackMods" || p.type === "defenseMods") && rnd() < 0.5) E.modify(s, p.pid, { op: p.options[0].op, dice: [] });
  else E.pass(s, p.pid);
}

function checkViews(s, seen) {
  const pub = Object.fromEntries(s.players.map((p) => [p.id, `p${p.seat}`]));
  for (const viewer of [...TOKENS, null, "strangerToken99"]) {
    const v = E.viewFor(s, viewer);
    const json = JSON.stringify(v);
    for (const t of TOKENS) assert.ok(!json.includes(t), `a private token reached ${viewer ?? "a watcher"}'s view in ${s.phase}`);
    const me = s.players.find((p) => p.id === viewer);
    const battle = s.phase !== "muster" && s.phase !== "over";
    if (!me || !battle || me.eliminated) {
      if (battle) assert.equal(v.units.length, s.units.length, "watchers and out-of-battle seats see every unit");
      continue;
    }
    assert.equal(v.you, pub[viewer]);
    const hidden = s.units.filter((u) => !u.dead && u.owner !== viewer && !E.seesUnit(s, viewer, u.id));
    if (hidden.length) seen.hidden = true;
    assert.equal(v.hidden, hidden.length, "the hidden count matches");
    const visibleNames = v.units.map((u) => u.name);
    for (const h of hidden) {
      assert.ok(!json.includes(`"${h.id}"`), `unseen ${h.id} appears in ${viewer}'s view (${s.phase})`);
      if (!visibleNames.some((n) => n.includes(h.name))) {
        for (const e of v.log) assert.ok(!e.msg.includes(h.name), `unseen ${h.name} named in the log: ${e.msg}`);
      }
    }
    for (const p of v.players) {
      if (p.id === pub[viewer]) continue;
      assert.deepEqual(p.army, [], "opponents' army lists stay private");
      assert.ok(!("buys" in p) && !("toPlace" in p) && !("tiePref" in p), "opponents' purchases and tie rankings stay private");
    }
    for (const id of v.planned) assert.equal(s.units.find((u) => u.id === id)?.owner, viewer, "only my own planned dials are listed");
    if (v.pending && v.pending.pid !== pub[viewer]) assert.deepEqual(Object.keys(v.pending).sort(), ["pid", "type", "uid"], "others' choices show only their shape");
  }
}

test("privacy and fog hold for every viewer at every step of three-player battles", () => {
  const seen = { pick: false, attack: false, hidden: false, winner: false, terrain: false };
  for (let g = 0; g < 4; g++) {
    const s = E.createGame({ seed: 100 + g, budget: 100 });
    for (const [id, f] of SEATS) {
      E.addPlayer(s, id, id.slice(-4));
      E.setFaction(s, id, f);
    }
    for (const [id, , list, buys] of SEATS) E.submitArmy(s, id, list, buys);
    const rnd = rng(7 + g);
    for (let i = 0; i < 3000 && s.phase !== "over"; i++) {
      E.run(s);
      if (s.pending?.type === "pick") seen.pick = true;
      if (s.attack) seen.attack = true;
      if (s.obstacles.some((o) => o.owner)) seen.terrain = true;
      checkViews(s, seen);
      step(s, rnd);
    }
    E.run(s);
    if (s.winner) seen.winner = true;
    checkViews(s, seen);
  }
  for (const [k, ok] of Object.entries(seen)) assert.ok(ok, `the battles never exercised: ${k}`);
});
