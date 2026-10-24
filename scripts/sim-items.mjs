// Are magic items priced fairly?  node scripts/sim-items.mjs [games-per-preset]
// Same style, same points: each preset scaled to 130 with units and upgrades (A) fights the
// 100 point preset plus about 30 points of items (B). Near 50% means items are priced right;
// tune ITEM_PRICE_K / ITEM_PRICE_FACTION in shared/items.js if not.
import { aiStep } from "../shared/ai.js";
import { validateArmy } from "../shared/factions.js";
import * as E from "../shared/engine.js";
import { ITEMS, itemCost } from "../shared/items.js";
import { PRESETS, presetList } from "../shared/presets.js";
const BUDGET = 130, games = Number(process.argv[2] || 4);
function withItems(fid, list) {
  const out = list.map((e) => ({ ...e }));
  const used = new Set();
  let cost = validateArmy(fid, out, BUDGET).cost;
  for (;;) {
    let best = null;
    for (const e of out) {
      if (e.item) continue;
      for (const it of ITEMS[fid]) {
        if (used.has(it.id) || !it.units.includes(e.unit)) continue;
        const c = itemCost(fid, it, e.unit);
        if (cost + c <= BUDGET && (!best || c > best.c)) best = { e, it, c };
      }
    }
    if (!best) break;
    best.e.item = best.it.id; used.add(best.it.id); cost += best.c;
  }
  return { list: out, cost };
}
let w = 0, n = 0, seed = 1; const per = {};
for (const [fid, ps] of Object.entries(PRESETS)) for (const p of ps) {
  const A = presetList(fid, p, BUDGET), B = withItems(fid, p.list);
  const ca = validateArmy(fid, A, BUDGET).cost;
  for (let g = 0; g < games; g++) {
    const bFirst = g % 2 === 0;
    const s = E.createGame({ seed: seed++, budget: BUDGET });
    E.addPlayer(s, "x", "X"); E.addPlayer(s, "y", "Y"); E.setFaction(s, "x", fid); E.setFaction(s, "y", fid);
    E.submitArmy(s, "x", bFirst ? B.list : A); E.submitArmy(s, "y", bFirst ? A : B.list); E.run(s);
    let k = 0; while (s.phase !== "over" && k++ < 60000) { aiStep(s, "x") || aiStep(s, "y"); E.run(s); }
    const xWin = s.winner === "x" ? 1 : s.winner === "y" ? 0 : 0.5;
    const r = bFirst ? xWin : 1 - xWin; w += r; n++;
    (per[fid] ||= { w: 0, n: 0, ca: 0, cb: 0 }); per[fid].w += r; per[fid].n++; per[fid].ca += ca; per[fid].cb += B.cost;
  }
}
for (const [f, x] of Object.entries(per)) console.log(f.padEnd(10), `items side wins ${((100 * x.w) / x.n).toFixed(0)}%  (pts ${Math.round(x.cb / x.n)} vs ${Math.round(x.ca / x.n)})`);
console.log(`ALL: items side wins ${((100 * w) / n).toFixed(0)}% of ${n}`);
