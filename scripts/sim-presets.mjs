// Balance check for prebuilt warbands: computer plays computer with fixed lists.
//   node scripts/sim-presets.mjs [games-per-pairing] [faction]
// With a faction, that faction's presets play every other preset; without, a full round robin.
// Prints each preset's win rate. Draws count half. The computer is a rough player, so read
// the numbers as "is anything far out of line", not as precise strengths.
import { aiStep } from "../shared/ai.js";
import { FACTIONS } from "../shared/factions.js";
import * as E from "../shared/engine.js";
import { PRESETS } from "../shared/presets.js";

const games = Number(process.argv[2]) || 2;
const focus = process.argv[3];
const all = Object.entries(PRESETS).flatMap(([fid, ps]) => ps.map((p) => ({ fid, ...p })));
const score = new Map(all.map((p) => [p.id, { p, w: 0, n: 0 }]));

function battle(a, b, seed) {
  const s = E.createGame({ seed, budget: 100 });
  E.addPlayer(s, "a", "A");
  E.addPlayer(s, "b", "B");
  E.setFaction(s, "a", a.fid);
  E.setFaction(s, "b", b.fid);
  E.submitArmy(s, "a", a.list);
  E.submitArmy(s, "b", b.list);
  E.run(s);
  let steps = 0;
  while (s.phase !== "over" && steps++ < 30000) {
    aiStep(s, "a") || aiStep(s, "b");
    E.run(s);
  }
  return s.winner === "a" ? 1 : s.winner === "b" ? 0 : 0.5;
}

let seed = 1;
for (const a of all) for (const b of all) {
  if (a.id === b.id || (focus && a.fid !== focus && b.fid !== focus)) continue;
  for (let g = 0; g < games; g++) {
    const r = battle(a, b, seed++);
    score.get(a.id).w += r; score.get(a.id).n++;
    score.get(b.id).w += 1 - r; score.get(b.id).n++;
  }
}
const rows = [...score.values()].filter((x) => x.n).sort((x, y) => y.w / y.n - x.w / x.n);
for (const { p, w, n } of rows) console.log(`${((100 * w) / n).toFixed(0).padStart(4)}%  ${FACTIONS[p.fid].name.padEnd(24)} ${p.name} (${p.style})  [${n} games]`);
const byFaction = {};
for (const { p, w, n } of rows) { const f = (byFaction[p.fid] ||= { w: 0, n: 0 }); f.w += w; f.n += n; }
console.log("\nBy army:");
for (const [fid, { w, n }] of Object.entries(byFaction)) console.log(`${((100 * w) / n).toFixed(0).padStart(4)}%  ${FACTIONS[fid].name}`);
