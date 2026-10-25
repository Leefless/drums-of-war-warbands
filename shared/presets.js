// Prebuilt warbands: named, balanced lists for each army, tuned at 100 points and
// scaled to any other budget by presetList(). Each faction's lists live in
// shared/presets/<faction>.js. Check them with:
//   node scripts/check-presets.mjs [faction]          legality and cost (every budget)
//   node scripts/sim-presets.mjs [games] [faction] [budget]   computer-vs-computer win rates
import { terrainBuyCost, terrainLimit } from "./battlefield.js";
import { FACTIONS, UPGRADES, armyLimits, categoryOf, upgradesFor } from "./factions.js";
import { itemById, itemCost, itemsFor } from "./items.js";
import { presets as calamity } from "./presets/calamity.js";
import { presets as concord } from "./presets/concord.js";
import { presets as greenskin } from "./presets/greenskin.js";
import { presets as holds } from "./presets/holds.js";
import { presets as sylvan } from "./presets/sylvan.js";
import { presets as umbral } from "./presets/umbral.js";

export const PRESET_BUDGET = 100;
export const PRESETS = { holds, sylvan, greenskin, umbral, calamity, concord };

/**
 * A preset's full muster for any DP: units, upgrades, magic items and terrain, keeping its style.
 *   1. Terrain: the preset's preferred pieces (preset.terrain), more in bigger games, within the limit.
 *   2. Items: about 12% of the DP is set aside for magic items.
 *   3. Units: the preset's composition, scaled to what is left (each type grows or shrinks toward its
 *      share, within the copy and unit limits); the champion stays if it fits in 40% of the DP.
 *   4. Items are assigned: the preset's preferred items (preset.items) first, then the best
 *      affordable ones for the units on the list, up to about two per 100 DP.
 *   5. The preset's own upgrades go on, where they fit.
 *   6. Leftover points buy extra units of the same kind, then upgrades.
 */
export function presetBuild(fid, preset, budget) {
  const f = FACTIONS[fid];
  const def = (id) => f.units.find((u) => u.id === id);
  const { units: MAX_UNITS, copies: MAX_COPIES } = armyLimits(budget);
  const scaleDP = budget / PRESET_BUDGET;

  // 1. Terrain.
  const prefTerrain = preset.terrain?.length ? preset.terrain : defaultTerrain(fid, preset);
  const nTerrain = Math.min(terrainLimit(budget), Math.max(1, Math.round(prefTerrain.length * Math.max(1, scaleDP * 0.75))));
  const buys = Array.from({ length: nTerrain }, (_, i) => prefTerrain[i % prefTerrain.length]);
  let cost = terrainBuyCost(buys);

  // 2. Reserve for items: about 12% of the DP, more if needed to afford the preset's first-choice
  //    item (usually its signature relic), but never more than a quarter of the DP.
  const first = (preset.items || []).map((id) => itemById(fid, id)).find(Boolean);
  const firstCost = first ? Math.min(...first.units.filter((u) => preset.list.some((e) => e.unit === u)).map((u) => itemCost(fid, first, u))) : 0;
  // preset.gear (default 1) scales how much goes on items; it is tuned per preset for balance.
  const gear = preset.gear ?? 1;
  const itemReserve = Math.max(4, Math.round(budget * 0.12 * gear), Math.min(Number.isFinite(firstCost) ? firstCost : 0, Math.round(budget * 0.25 * gear)));

  // 3. Units from the preset's composition.
  const baseCount = new Map();
  for (const e of preset.list) baseCount.set(e.unit, (baseCount.get(e.unit) || 0) + 1);
  const baseUnitCost = preset.list.reduce((a, e) => a + (def(e.unit)?.cost || 0), 0);
  const unitBudget = budget - cost - itemReserve;
  const scale = unitBudget / Math.max(1, baseUnitCost);
  const list = [];
  const count = new Map();
  const add = (u) => {
    list.push({ unit: u.id, upgrade: null, item: null });
    count.set(u.id, (count.get(u.id) || 0) + 1);
    cost += u.cost;
  };
  const regulars = () => list.filter((e) => !def(e.unit).champion).length;
  const fits = (u, cap = budget) => cost + u.cost <= cap && (u.champion ? !list.some((e) => def(e.unit).champion) : (count.get(u.id) || 0) < MAX_COPIES && regulars() < MAX_UNITS);
  const champ = [...baseCount.keys()].map(def).find((u) => u.champion);
  if (champ && champ.cost <= budget * 0.4) add(champ);
  const core = [...baseCount.keys()].map(def).filter((u) => !u.champion);
  const share = (u) => Math.max(1, baseCount.get(u.id) * scale);
  // Grow every type toward its share (the type furthest behind goes next), within the unit budget.
  for (;;) {
    const options = core.filter((u) => fits(u, budget - itemReserve) && (count.get(u.id) || 0) < Math.round(share(u)));
    if (!options.length) break;
    add(options.reduce((a, u) => ((count.get(u.id) || 0) / share(u) < (count.get(a.id) || 0) / share(a) ? u : a)));
  }
  if (!list.some((e) => !def(e.unit).champion) && core.length) add(core.reduce((a, u) => (u.cost < a.cost ? u : a))); // never an empty line

  // 4. Items: preferred first, then the best affordable, up to about two per 100 DP.
  const used = new Set();
  const maxItems = Math.max(1, Math.round(2 * scaleDP * gear));
  const carriers = () => [...list].sort((a, b) => def(b.unit).champion - def(a.unit).champion || def(b.unit).cost - def(a.unit).cost);
  const give = (it) => {
    const e = carriers().find((x) => !x.item && it.units.includes(x.unit) && cost + itemCost(fid, it, x.unit) <= budget);
    if (!e) return false;
    e.item = it.id;
    used.add(it.id);
    cost += itemCost(fid, it, e.unit);
    return true;
  };
  for (const id of preset.items || []) {
    if (list.filter((e) => e.item).length >= maxItems) break;
    const it = itemById(fid, id);
    if (it && !used.has(id)) give(it);
  }
  while (list.filter((e) => e.item).length < maxItems) {
    // The priciest item that still fits: the strongest gear for the points.
    let best = null;
    for (const e of list) {
      if (e.item) continue;
      for (const it of itemsFor(fid, e.unit)) {
        if (used.has(it.id)) continue;
        const c = itemCost(fid, it, e.unit);
        if (cost + c <= budget && (!best || c > best.c)) best = { e, it, c };
      }
    }
    if (!best) break;
    best.e.item = best.it.id;
    used.add(best.it.id);
    cost += best.c;
  }

  // 5. The preset's own upgrades (unit:upgrade in its list), one per authored entry, where they fit.
  for (const pe of preset.list) {
    const g = pe.upgrade && UPGRADES[pe.upgrade];
    if (!g || cost + g.cost > budget) continue;
    if (g.relic && list.some((e) => UPGRADES[e.upgrade]?.relic)) continue;
    const e = list.find((x) => x.unit === pe.unit && !x.upgrade && upgradesFor(fid, def(x.unit)).some((u) => u.id === g.id));
    if (!e) continue;
    e.upgrade = g.id;
    cost += g.cost;
  }

  // 6. Leftovers: more of the same kind of unit while there is room, then upgrades.
  const roles = new Set(core.map((u) => u.role));
  const cats = new Set(core.map(categoryOf));
  for (const inPool of [(u) => baseCount.has(u.id), (u) => roles.has(u.role), (u) => cats.has(categoryOf(u))]) {
    for (;;) {
      const options = f.units.filter((u) => !u.champion && inPool(u) && fits(u));
      if (!options.length || budget - cost < budget * 0.08) break;
      const aim = (budget - cost) / Math.max(1, Math.min(4, MAX_UNITS - regulars()));
      add(options.reduce((a, u) => (Math.abs(u.cost - aim) < Math.abs(a.cost - aim) ? u : a)));
    }
  }
  for (const e of carriers()) {
    if (e.upgrade) continue;
    const g = upgradesFor(fid, def(e.unit)).filter((x) => !x.relic && x.cost <= budget - cost).sort((x, y) => y.cost - x.cost)[0];
    if (g) {
      e.upgrade = g.id;
      cost += g.cost;
    }
  }
  const order = [...baseCount.keys()];
  const rank = (id) => (order.includes(id) ? order.indexOf(id) : order.length);
  return {
    list: list.sort((a, b) => rank(a.unit) - rank(b.unit)).map((e) => ({ unit: e.unit, upgrade: e.upgrade && UPGRADES[e.upgrade] ? e.upgrade : null, item: e.item })),
    buys,
  };
}

/** Terrain a preset brings when it names none: hills for shooting lists, forests for everyone else. */
function defaultTerrain(fid, preset) {
  const f = FACTIONS[fid];
  const ranged = preset.list.filter((e) => Math.max(...(f.units.find((u) => u.id === e.unit)?.weapons || []).map((w) => w.range[1])) >= 3).length;
  return ranged * 2 >= preset.list.length ? ["hill"] : ["thicket"];
}

/** Units, upgrades and items of a preset at a given DP (see presetBuild). */
export const presetList = (fid, preset, budget) => presetBuild(fid, preset, budget).list;
/** Terrain a preset buys at a given DP (see presetBuild). */
export const presetBuys = (fid, preset, budget) => presetBuild(fid, preset, budget).buys;
