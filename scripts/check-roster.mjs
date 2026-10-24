// Check one army's roster while authoring:  node scripts/check-roster.mjs holds
// Prints every rule violation plus the computed cost of each unit. Exit code 1 on errors.
import { checkRoster } from "../shared/roster-check.js";

const ALL = ["holds", "sylvan", "greenskin", "umbral", "calamity", "concord"];
const target = process.argv[2];
if (!ALL.includes(target)) {
  console.error(`usage: node scripts/check-roster.mjs <${ALL.join("|")}>`);
  process.exit(2);
}
const load = async (f) => import(`../shared/rosters/${f}.js?t=${Date.now()}`);
const otherIds = new Set();
for (const f of ALL.filter((x) => x !== target)) {
  try {
    const r = await load(f);
    for (const u of [...(r.champions || []), ...(r.units || [])]) otherIds.add(u.id);
  } catch {
    // another author may be mid-edit; skip their file
  }
}
const { errors, rows } = checkRoster(target, await load(target), otherIds);
for (const r of rows) console.log(`${r.champion ? "CHAMPION" : "unit    "} ${String(r.cost).padStart(3)}  ${r.id.padEnd(18)} ${r.name} (${r.role})`);
const champs = rows.filter((r) => r.champion).length;
console.log(`\n${champs} champions, ${rows.length - champs} units.`);
if (errors.length) {
  console.log(`\n${errors.length} problem(s):`);
  for (const e of errors) console.log(`  - ${e}`);
  process.exit(1);
}
console.log("Roster OK.");
