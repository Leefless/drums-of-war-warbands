import assert from "node:assert/strict";
import { test } from "node:test";
import { FACTIONS, validateArmy } from "../shared/factions.js";
import { PRESET_BUDGET, PRESETS, presetBuild } from "../shared/presets.js";

test("every army has 3 to 5 legal prebuilt warbands that spend the budget", () => {
  const ids = new Set();
  for (const fid of Object.keys(FACTIONS)) {
    const list = PRESETS[fid];
    assert.ok(list.length >= 3 && list.length <= 5, `${fid} has ${list.length} presets`);
    for (const p of list) {
      assert.ok(p.id && !ids.has(p.id), `duplicate or missing id ${p.id}`);
      ids.add(p.id);
      assert.ok(p.name && p.style && p.blurb, `${p.id} needs name, style and blurb`);
      assert.doesNotMatch(`${p.name} ${p.style} ${p.blurb}`, /[–—]/, `${p.id} uses a dash`);
      const v = validateArmy(fid, p.list, PRESET_BUDGET);
      assert.ok(v.ok, `${p.id}: ${v.errors.join(" ")}`);
      assert.ok(v.cost >= PRESET_BUDGET - 6, `${p.id} spends only ${v.cost}`);
      // Built for every DP the host can pick, each with magic items and terrain.
      for (const b of [60, 100, 150, 200, 300]) {
        const build = presetBuild(fid, p, b);
        const sv = validateArmy(fid, build.list, b, build.buys);
        assert.ok(sv.ok, `${p.id} at ${b}: ${sv.errors.join(" ")}`);
        assert.ok(sv.cost <= b && sv.cost >= b * 0.9, `${p.id} at ${b} spends ${sv.cost}`);
        assert.ok(build.list.some((e) => e.item), `${p.id} at ${b} has a magic item`);
        assert.ok(build.buys.length >= 1, `${p.id} at ${b} brings terrain`);
      }
    }
  }
});
