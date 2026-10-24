// Roster validation: schema, army identity, and distinctness. Used by the test
// suite and by `node scripts/check-roster.mjs <faction>` while authoring.
import { ABILITY_VALUE, ACTION_VALUE, costBreakdown } from "./cost.js";
import { DIALS, FACTION_DIALS } from "./dials.js";
import { parseManeuver } from "./geometry.js";
import { ICONS } from "../public/art.js";

export const MIN_UNITS = 25;
export const MIN_CHAMPIONS = 10;

// Mechanics that define one army and may not appear in another.
export const FACTION_ONLY = { brace: "holds", channel: "calamity", thrall: "umbral", master: "umbral", raise: "umbral" };
const RELIC_ONLY = ["stoneRune", "phylactery", "riftEye"];
const LEADERSHIP = ["inspire", "warcry", "master"];
const DASH = /[\u2013\u2014]/;

function weaponSig(ws) {
  return ws.map((w) => `${w.dice}${w.arc}${w.range.join("-")}${w.noRangeBonus ? "n" : ""}`).sort().join("|");
}

const FIELDS = ["base", "init", "def", "wounds", "ward", "weapons", "actions", "abilities", "dial"];
export function signature(u) {
  return {
    base: u.base, init: u.init, def: u.def, wounds: u.wounds, ward: u.ward, weapons: weaponSig(u.weapons),
    actions: [...u.actions].sort().join(","), abilities: [...u.abilities].sort().join(","), dial: u.dial,
  };
}

/** Number of profile fields in which two units differ. */
export function difference(a, b) {
  const sa = signature(a);
  const sb = signature(b);
  return FIELDS.filter((f) => sa[f] !== sb[f]).length;
}

function checkUnit(fid, u, champion, errs) {
  const where = `${fid}/${u.id ?? "?"}`;
  const err = (m) => errs.push(`${where}: ${m}`);
  if (!/^[a-z][a-zA-Z0-9]*$/.test(u.id || "")) err("id must be camelCase letters and digits");
  for (const k of ["name", "role", "flavor"]) if (typeof u[k] !== "string" || !u[k].trim()) err(`missing ${k}`);
  if (u.flavor && (u.flavor.length < 20 || u.flavor.length > 220)) err("flavor should be 20 to 220 characters");
  for (const s of [u.name, u.role, u.flavor, ...(u.weapons || []).map((w) => w.name)]) if (s && DASH.test(s)) err("no em or en dashes");
  if ("cost" in u) err("do not set cost; it is computed");
  if (!ICONS[u.icon] || u.icon === "blank") err(`unknown icon ${u.icon}`);
  if (!["small", "medium", "large"].includes(u.base)) err("base must be small, medium or large");
  const int = (k, lo, hi) => { if (!Number.isInteger(u[k]) || u[k] < lo || u[k] > hi) err(`${k} must be an integer ${lo} to ${hi}`); };
  int("init", 1, 6);
  int("def", 0, 4);
  int("wounds", 1, 14);
  int("ward", 0, 4);
  if (!Array.isArray(u.weapons) || u.weapons.length < 1 || u.weapons.length > 3) err("1 to 3 weapons");
  for (const w of u.weapons || []) {
    if (!w.name) err("weapon needs a name");
    if (!Number.isInteger(w.dice) || w.dice < 1 || w.dice > 6) err(`${w.name}: dice 1 to 6`);
    if (!["front", "rear", "full"].includes(w.arc)) err(`${w.name}: arc front, rear or full`);
    const [lo, hi] = w.range || [];
    if (!(Number.isInteger(lo) && Number.isInteger(hi) && lo >= 1 && hi >= lo && hi <= 4)) err(`${w.name}: range [lo, hi] within 1 to 4`);
  }
  if (!Array.isArray(u.actions)) err("actions must be an array");
  for (const entry of u.actions || []) {
    for (const part of entry.split(">")) {
      const a = part.replace(/^r:/, "");
      if (!(a in ACTION_VALUE)) err(`unknown action ${a}`);
      if (FACTION_ONLY[a] && FACTION_ONLY[a] !== fid) err(`${a} belongs to ${FACTION_ONLY[a]}`);
    }
    if (entry.split(">").length > 2) err(`${entry}: at most one link`);
  }
  const bases = (u.actions || []).map((e) => e.split(">")[0].replace(/^r:/, ""));
  if (new Set(bases).size !== bases.length) err("an action appears twice on the bar");
  for (const ab of u.abilities || []) {
    if (!(ab in ABILITY_VALUE) || RELIC_ONLY.includes(ab)) err(`unknown ability ${ab}`);
    if (FACTION_ONLY[ab] && FACTION_ONLY[ab] !== fid) err(`${ab} belongs to ${FACTION_ONLY[ab]}`);
  }
  if (new Set(u.abilities).size !== (u.abilities || []).length) err("duplicate ability");
  const thrall = (u.abilities || []).includes("thrall");
  if (thrall && u.actions?.length) err("thralls have no actions");
  if (!thrall && !u.actions?.length) err("non-thrall units need at least one action");
  if (!FACTION_DIALS[fid].includes(u.dial)) err(`dial must be one of ${FACTION_DIALS[fid].join(", ")}`);
  else for (const c of DIALS[u.dial]) parseManeuver(c);
  if (champion) {
    const leads = (u.abilities || []).some((a) => LEADERSHIP.includes(a)) || bases.includes("command");
    if (!leads) err("champions need leadership: inspire, warcry, master, or the command action");
    if (thrall) err("champions cannot be thralls");
  }
}

/** Validate one faction's roster. Returns { errors, rows } where rows carry computed costs. */
export function checkRoster(fid, roster, otherIds = new Set()) {
  const errors = [];
  const { champions = [], units = [] } = roster;
  if (champions.length < MIN_CHAMPIONS) errors.push(`${fid}: ${champions.length} champions, need at least ${MIN_CHAMPIONS}`);
  if (units.length < MIN_UNITS) errors.push(`${fid}: ${units.length} units, need at least ${MIN_UNITS}`);
  const all = [...champions.map((u) => ({ u, champion: true })), ...units.map((u) => ({ u, champion: false }))];
  const ids = new Set();
  const names = new Set();
  for (const { u, champion } of all) {
    checkUnit(fid, u, champion, errors);
    if (ids.has(u.id) || otherIds.has(u.id)) errors.push(`${fid}/${u.id}: duplicate id`);
    if (names.has(u.name)) errors.push(`${fid}/${u.id}: duplicate name ${u.name}`);
    ids.add(u.id);
    names.add(u.name);
  }
  // Distinctness: every pair must differ in at least 3 profile fields.
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const d = difference(all[i].u, all[j].u);
      if (d < 3) errors.push(`${fid}: ${all[i].u.id} and ${all[j].u.id} differ in only ${d} field(s); make them distinct`);
    }
  }
  const rows = all.map(({ u, champion }) => {
    const ok = FACTION_DIALS[fid].includes(u.dial) && Array.isArray(u.weapons) && u.weapons.length;
    return { id: u.id, name: u.name, role: u.role, champion, cost: ok ? costBreakdown(u, DIALS[u.dial]).total : NaN };
  });
  for (const r of rows) if (!(r.cost >= 4 && r.cost <= 60)) errors.push(`${fid}/${r.id}: cost ${r.cost} outside 4 to 60; rebalance the profile`);
  return { errors, rows, ids };
}
