// Prebuilt warbands: named, balanced lists for each army, tuned at 100 points and
// scaled to any other budget by presetList(). Each faction's lists live in
// shared/presets/<faction>.js. Check them with:
//   node scripts/check-presets.mjs [faction]          legality and cost (every budget)
//   node scripts/sim-presets.mjs [games] [faction] [budget]   computer-vs-computer win rates
import { FACTIONS, UPGRADES, armyLimits, categoryOf, upgradesFor } from "./factions.js";
import { presets as calamity } from "./presets/calamity.js";
import { presets as concord } from "./presets/concord.js";
import { presets as greenskin } from "./presets/greenskin.js";
import { presets as holds } from "./presets/holds.js";
import { presets as sylvan } from "./presets/sylvan.js";
import { presets as umbral } from "./presets/umbral.js";

export const PRESET_BUDGET = 100;
export const PRESETS = { holds, sylvan, greenskin, umbral, calamity, concord };

/**
 * A preset's list for any budget, keeping its play style.
 * At 100 points it is the hand-tuned list. Otherwise the list is rebuilt in the same
 * proportions: each unit type aims for its share scaled by budget / 100 (within the copy
 * and unit limits), the champion stays when it fits in 40% of the budget, spare points buy
 * upgrades, and only then do units that share a role with the list join in.
 */
export function presetList(fid, preset, budget) {
  if (budget === PRESET_BUDGET) return preset.list.map((e) => ({ ...e }));
  const f = FACTIONS[fid];
  const def = (id) => f.units.find((u) => u.id === id);
  const scale = budget / PRESET_BUDGET;
  const { units: MAX_UNITS, copies: MAX_COPIES } = armyLimits(budget);
  const baseCount = new Map();
  for (const e of preset.list) baseCount.set(e.unit, (baseCount.get(e.unit) || 0) + 1);
  const list = [];
  const count = new Map();
  let cost = 0;
  const add = (u) => {
    list.push({ unit: u.id, upgrade: null });
    count.set(u.id, (count.get(u.id) || 0) + 1);
    cost += u.cost;
  };
  const regulars = () => list.filter((e) => !def(e.unit).champion).length;
  const fits = (u) => cost + u.cost <= budget && (u.champion ? !list.some((e) => def(e.unit).champion) : (count.get(u.id) || 0) < MAX_COPIES && regulars() < MAX_UNITS);

  const champ = [...baseCount.keys()].map(def).find((u) => u.champion);
  if (champ && champ.cost <= budget * 0.4) add(champ);
  // Grow every unit type toward its scaled share; the type furthest behind goes next.
  const core = [...baseCount.keys()].map(def).filter((u) => !u.champion);
  const fill = (pool, want) => {
    for (;;) {
      const options = pool.filter(fits);
      if (!options.length) return;
      const behind = (u) => (count.get(u.id) || 0) / want(u);
      const next = options.reduce((a, u) => (behind(u) < behind(a) ? u : a));
      if (behind(next) >= 1 && want === coreShare) return;
      add(next);
    }
  };
  const coreShare = (u) => Math.max(1, baseCount.get(u.id) * scale);
  fill(core, coreShare);
  // Spare points: upgrades, champion first, then the priciest units (no relics: one per army).
  const spend = () => {
    for (const e of [...list].sort((a, b) => def(b.unit).champion - def(a.unit).champion || def(b.unit).cost - def(a.unit).cost)) {
      if (e.upgrade) continue;
      const g = upgradesFor(fid, def(e.unit)).filter((x) => !x.relic && x.cost <= budget - cost).sort((a, b) => b.cost - a.cost)[0];
      if (g) {
        e.upgrade = g.id;
        cost += g.cost;
      }
    }
  };
  if (scale > 1) {
    fill(core, () => MAX_COPIES); // past the share, more of the same style first
    // Still short: units of the same kind (role, then category), and only then any unit of the
    // army, each sized to share the points left across the open slots.
    const roles = new Set(core.map((u) => u.role));
    const cats = new Set(core.map(categoryOf));
    for (const inPool of [(u) => roles.has(u.role), (u) => cats.has(categoryOf(u)), () => true]) {
      for (;;) {
        const options = f.units.filter((u) => !u.champion && inPool(u) && fits(u));
        if (!options.length || budget - cost < budget * 0.06) break;
        const aim = (budget - cost) / Math.max(1, MAX_UNITS - regulars());
        add(options.reduce((a, u) => (Math.abs(u.cost - aim) < Math.abs(a.cost - aim) ? u : a)));
      }
    }
  }
  spend();
  // Keep the original order of first appearance so the list reads like the preset.
  const order = [...baseCount.keys()];
  const rank = (id) => (order.includes(id) ? order.indexOf(id) : order.length);
  return list.sort((a, b) => rank(a.unit) - rank(b.unit)).map((e) => ({ unit: e.unit, upgrade: e.upgrade && UPGRADES[e.upgrade] ? e.upgrade : null }));
}
