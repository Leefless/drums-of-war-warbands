// Check magic items:  node scripts/check-items.mjs [faction]
// Lists every item with its price on each unit that may carry it, plus any rule problems.
import { FACTIONS } from "../shared/factions.js";
import { ITEMS, checkItems, itemCost } from "../shared/items.js";

const only = process.argv[2];
let bad = 0;
for (const fid of only ? [only] : Object.keys(FACTIONS)) {
  const list = ITEMS[fid];
  console.log(`\n${FACTIONS[fid].name}: ${list.length} items`);
  for (const it of list) {
    const prices = it.units.map((u) => `${u} ${itemCost(fid, it, u) ?? "?"}`).join(", ");
    console.log(`  ${it.kind.padEnd(9)} ${it.name}: ${it.text}\n            on: ${prices}`);
  }
  const errors = checkItems(fid);
  for (const e of errors) console.log(`  ! ${e}`);
  bad += errors.length;
}
if (bad) { console.log(`\n${bad} problem(s).`); process.exit(1); }
console.log("\nItems OK.");
