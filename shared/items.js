// Magic items: one per unit, each item at most once per army, and every item names the units
// that may carry it. An item is a set of changes to a unit's profile, so its price is simply
// what the unit costs with the item minus what it costs without (shared/cost.js), with the
// champion premium applied on champions. The same blade costs more on a monster than a goblin.
//
// Item schema (shared/items/<faction>.js):
//   { id, name, kind, text, flavor, units: [unit ids], effect: {
//       init, def, wounds, ward,          // + to the profile (init capped at 6)
//       dice, range,                       // + attack dice / + max range on every weapon (range capped at 4)
//       arc: "full",                       // the unit's first weapon fires all-round
//       abilities: [ABILITIES keys], actions: [ACTIONS keys] } }
// Check with: node scripts/check-items.mjs [faction]
import { ABILITIES, ACTIONS, CHAMPION_PREMIUM, FACTIONS } from "./factions.js";
import { unitCost } from "./cost.js";
import { items as calamity } from "./items/calamity.js";
import { items as concord } from "./items/concord.js";
import { items as greenskin } from "./items/greenskin.js";
import { items as holds } from "./items/holds.js";
import { items as sylvan } from "./items/sylvan.js";
import { items as umbral } from "./items/umbral.js";

export const ITEMS = { holds, sylvan, greenskin, umbral, calamity, concord };
export const ITEM_KINDS = ["Weapon", "Armour", "Talisman", "Banner", "Arcane", "Mount", "Relic"];

// Items are priced by the cost model, then scaled: battle simulations showed the model's
// marginal prices undervalue gear (an army that spent its points on items beat the same
// style spending them on units 63% of the time), so every item costs ITEM_PRICE_K times its
// modelled value, at least ITEM_MIN_PRICE (check with node scripts/sim-items.mjs). The Greenskin horde gets more from extra bodies
// than from gear, so its items stay at the plain modelled price.
export const ITEM_PRICE_K = 1.5;
export const ITEM_PRICE_FACTION = { greenskin: 1.0 };
export const ITEM_MIN_PRICE = 3;

export const itemById = (fid, id) => (ITEMS[fid] || []).find((x) => x.id === id) || null;

/** A unit profile with an item's changes applied. Pure: returns a new object. */
export function applyItem(u, item) {
  if (!item) return u;
  const e = item.effect || {};
  const weapons = u.weapons.map((w, i) => ({
    ...w,
    dice: w.dice + (e.dice || 0),
    range: [w.range[0], Math.min(4, w.range[1] + (e.range || 0))],
    arc: e.arc && i === 0 ? e.arc : w.arc,
  }));
  return {
    ...u,
    init: Math.min(6, u.init + (e.init || 0)),
    def: u.def + (e.def || 0),
    wounds: u.wounds + (e.wounds || 0),
    ward: u.ward + (e.ward || 0),
    weapons,
    abilities: [...new Set([...u.abilities, ...(e.abilities || [])])],
    actions: [...u.actions, ...(e.actions || []).filter((a) => !u.actions.some((x) => x.replace(/^r:/, "").split(">")[0] === a))],
  };
}

/** Points an item costs on one unit: the cost model's price difference (champion premium included), at least ITEM_MIN_PRICE. */
export function itemCost(fid, itemOrId, unitId) {
  const item = typeof itemOrId === "string" ? itemById(fid, itemOrId) : itemOrId;
  const u = FACTIONS[fid]?.units.find((x) => x.id === unitId);
  if (!item || !u) return null;
  const k = u.champion ? CHAMPION_PREMIUM : 1;
  const delta = (unitCost(applyItem(u, item), u.dial) - unitCost(u, u.dial)) * k * (ITEM_PRICE_FACTION[fid] ?? ITEM_PRICE_K);
  return Math.max(ITEM_MIN_PRICE, Math.round(delta));
}

/** Items a unit may carry. */
export const itemsFor = (fid, unitId) => (ITEMS[fid] || []).filter((x) => x.units.includes(unitId));

/** Problems with one army's item list (used by the check script and the tests). */
export function checkItems(fid) {
  const list = ITEMS[fid] || [];
  const errors = [];
  const f = FACTIONS[fid];
  if (list.length < 20 || list.length > 50) errors.push(`${fid}: ${list.length} items (needs 20 to 50)`);
  const ids = new Set();
  const names = new Set();
  for (const it of list) {
    const tag = `${fid}/${it.id}`;
    if (!it.id || ids.has(it.id)) errors.push(`${tag}: missing or duplicate id`);
    if (!it.name || names.has(it.name)) errors.push(`${tag}: missing or duplicate name`);
    ids.add(it.id);
    names.add(it.name);
    if (!ITEM_KINDS.includes(it.kind)) errors.push(`${tag}: kind must be one of ${ITEM_KINDS.join(", ")}`);
    if (!it.text || !it.flavor) errors.push(`${tag}: needs text and flavor`);
    if (/[\u2013\u2014]/.test(`${it.name} ${it.text} ${it.flavor}`)) errors.push(`${tag}: uses an em or en dash`);
    if (!Array.isArray(it.units) || !it.units.length) errors.push(`${tag}: needs units`);
    const e = it.effect || {};
    const known = new Set(["init", "def", "wounds", "ward", "dice", "range", "arc", "abilities", "actions"]);
    for (const k of Object.keys(e)) if (!known.has(k)) errors.push(`${tag}: unknown effect ${k}`);
    for (const k of ["init", "def", "wounds", "ward", "dice", "range"]) if (e[k] != null && !(Number.isInteger(e[k]) && e[k] >= 1 && e[k] <= 3)) errors.push(`${tag}: ${k} must be 1 to 3`);
    if (e.arc != null && e.arc !== "full") errors.push(`${tag}: arc may only be "full"`);
    for (const a of e.abilities || []) if (!ABILITIES[a]) errors.push(`${tag}: unknown ability ${a}`);
    for (const a of e.actions || []) if (!ACTIONS[a]) errors.push(`${tag}: unknown action ${a}`);
    for (const uid of it.units || []) {
      const u = f.units.find((x) => x.id === uid);
      if (!u) { errors.push(`${tag}: unknown unit ${uid}`); continue; }
      const raw = Math.round(unitCost(applyItem(u, it), u.dial) - unitCost(u, u.dial));
      if (raw < 1) errors.push(`${tag}: does nothing measurable on ${uid} (already has it?)`);
      const c = itemCost(fid, it, uid);
      if (c > 30) errors.push(`${tag}: costs ${c} on ${uid} (too strong, keep items at 30 points or less)`);
    }
  }
  return errors;
}
