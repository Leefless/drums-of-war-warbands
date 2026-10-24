// Check prebuilt warbands:  node scripts/check-presets.mjs [faction]
// Prints each list with its cost and any rule problems. Exit code 1 on errors.
import { FACTIONS, validateArmy } from "../shared/factions.js";

const ALL = Object.keys(FACTIONS);
const only = process.argv[2];
if (only && !ALL.includes(only)) {
  console.error(`usage: node scripts/check-presets.mjs [${ALL.join("|")}]`);
  process.exit(2);
}
let bad = 0;
for (const fid of only ? [only] : ALL) {
  const { presets } = await import(`../shared/presets/${fid}.js?t=${Date.now()}`);
  console.log(`\n${FACTIONS[fid].name}: ${presets.length} preset(s)`);
  if (presets.length < 3 || presets.length > 5) { console.log("  ! needs 3 to 5 presets"); bad++; }
  const ids = new Set();
  for (const p of presets) {
    const problems = [];
    if (!p.id || ids.has(p.id)) problems.push("missing or duplicate id");
    ids.add(p.id);
    if (!p.name || !p.style || !p.blurb) problems.push("needs name, style and blurb");
    const v = validateArmy(fid, p.list, 100);
    problems.push(...v.errors);
    if (v.cost < 94) problems.push(`spends only ${v.cost}; aim for 94 to 100`);
    const names = p.list.map((e) => {
      const u = FACTIONS[fid].units.find((x) => x.id === e.unit);
      return `${u ? u.name : e.unit}${u?.champion ? " [C]" : ""}${e.upgrade ? ` +${e.upgrade}` : ""}`;
    });
    console.log(`  ${String(v.cost).padStart(3)}  ${p.name} (${p.style}): ${names.join(", ")}`);
    for (const x of problems) console.log(`       ! ${x}`);
    if (problems.length) bad++;
  }
}
if (bad) { console.log(`\n${bad} problem list(s).`); process.exit(1); }
console.log("\nPresets OK.");
