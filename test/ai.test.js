import assert from "node:assert/strict";
import { test } from "node:test";
import { aiStep, randomArmy } from "../shared/ai.js";
import { FACTIONS, validateArmy } from "../shared/factions.js";
import * as E from "../shared/engine.js";

test("the computer musters legal armies for every faction and budget", () => {
  for (const fid of Object.keys(FACTIONS)) for (const budget of [60, 100, 200]) {
    const list = randomArmy(fid, budget);
    assert.ok(validateArmy(fid, list, budget).ok, `${fid} at ${budget}`);
  }
});

test("computer opponents play full battles against each other in every pairing", () => {
  const ids = Object.keys(FACTIONS);
  for (const fa of ids) for (const fb of ids) {
    const s = E.createGame({ seed: ids.indexOf(fa) * 7 + ids.indexOf(fb) + 1, budget: 100 });
    E.addPlayer(s, "ai1", "One");
    E.addPlayer(s, "ai2", "Two");
    E.setFaction(s, "ai1", fa);
    E.setFaction(s, "ai2", fb);
    let steps = 0;
    while (s.phase !== "over" && steps++ < 20000) {
      const acted = aiStep(s, "ai1") || aiStep(s, "ai2");
      E.run(s);
      assert.ok(acted || s.phase === "over", `${fa} vs ${fb} stalled in ${s.phase}`);
    }
    assert.equal(s.phase, "over", `${fa} vs ${fb} did not finish`);
  }
});
