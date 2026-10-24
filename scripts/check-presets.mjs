// Check prebuilt warbands:  node scripts/check-presets.mjs [faction] [dp]
// Prints each preset as built at the given DP (default 100) with its items and terrain, and
// checks every preset is legal and uses items and terrain at every DP the host can pick.
import { FACTIONS, validateArmy } from "../shared/factions.js";
import { itemById } from "../shared/items.js";
import { presetBuild } from "../shared/presets.js";

const ALL = Object.keys(FACTIONS);
const only = process.argv[2] && ALL.includes(process.argv[2]) ? process.argv[2] : null;
const showDP = Number(process.argv[only ? 3 : 2]) || 100;
const DPS = [60, 100, 150, 200, 300];
let bad = 0;
for (const fid of only ? [only] : ALL) {
  const { presets } = await import(`../shared/presets/${fid}.js?t=${Date.now()}`);
  console.log(`\n${FACTIONS[fid].name}: ${presets.length} preset(s), shown at ${showDP} DP`);
  if (presets.length < 3 || presets.length > 5) { console.log("  ! needs 3 to 5 presets"); bad++; }
  const ids = new Set();
  for (const p of presets) {
    const problems = [];
    if (!p.id || ids.has(p.id)) problems.push("missing or duplicate id");
    ids.add(p.id);
    if (!p.name || !p.style || !p.blurb) problems.push("needs name, style and blurb");
    for (const id of p.items || []) {
      const it = itemById(fid, id);
      if (!it) problems.push(`unknown preferred item ${id}`);
      else if (!it.units.some((u) => p.list.some((e) => e.unit === u))) problems.push(`preferred item ${id} fits no unit in the list`);
    }
    for (const dp of DPS) {
      const b = presetBuild(fid, p, dp);
      const v = validateArmy(fid, b.list, dp, b.buys);
      if (!v.ok) problems.push(`at ${dp}: ${v.errors.join(" ")}`);
      if (v.cost < dp * 0.9) problems.push(`at ${dp}: spends only ${v.cost}`);
      if (!b.list.some((e) => e.item)) problems.push(`at ${dp}: no magic item`);
      if (!b.buys.length) problems.push(`at ${dp}: no terrain`);
    }
    const b = presetBuild(fid, p, showDP);
    const v = validateArmy(fid, b.list, showDP, b.buys);
    const names = b.list.map((e) => {
      const u = FACTIONS[fid].units.find((x) => x.id === e.unit);
      return `${u ? u.name : e.unit}${u?.champion ? " [C]" : ""}${e.upgrade ? ` +${e.upgrade}` : ""}${e.item ? ` <${itemById(fid, e.item)?.name}>` : ""}`;
    });
    console.log(`  ${String(v.cost).padStart(3)}  ${p.name} (${p.style}): ${names.join(", ")}  | terrain: ${b.buys.join(", ")}`);
    for (const x of problems) console.log(`       ! ${x}`);
    if (problems.length) bad++;
  }
}
if (bad) { console.log(`\n${bad} problem list(s).`); process.exit(1); }
console.log("\nPresets OK.");
