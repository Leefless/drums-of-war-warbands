// Army data for Drums of War: Warbands. Pure data: the engine reads it, the
// browser renders it. Every faction differs in three places:
//   1. its maneuver dial (speed range, which turns are easy or straining),
//   2. its action economy (how many actions, and on what terms),
//   3. its unit abilities.
//
// Action notation: "steel" white action, "r:sidestep" red action (gains strain),
// "steel>r:sidestep" linked: after Steel you may immediately take a red Sidestep.
// Dial notation: see shared/geometry.js parseManeuver ("2BL:w").

import { unitCost } from "./cost.js";
import { DIALS } from "./dials.js";
import * as calamity from "./rosters/calamity.js";
import * as concord from "./rosters/concord.js";
import * as greenskin from "./rosters/greenskin.js";
import * as holds from "./rosters/holds.js";
import * as sylvan from "./rosters/sylvan.js";
import * as umbral from "./rosters/umbral.js";

const ROSTERS = { holds, sylvan, greenskin, umbral, calamity, concord };

export const FACTIONS = {
  holds: {
    id: "holds",
    name: "The Iron Holds",
    kin: "Dwarves, with Giant Kin sellswords",
    color: "#8FA9BC",
    tagline: "Slow, armoured, and never moved from ground they mean to keep.",
    economy: "Unyielding: a unit that executes a stop or a 1-straight may take a second action (Steel or Brace only). Brace tokens cancel a Strike after the defence roll.",
    dialNote: "Mostly slow: top speed 3 with a white Stop and red hard turns. Ram riders and gyrocopters reach speed 4; artillery barely moves.",
    rules: ["unyielding"],
  },

  sylvan: {
    id: "sylvan",
    name: "The Sylvan Courts",
    kin: "Wood Elves and High Elves",
    color: "#5FAE8C",
    tagline: "Fast, fragile, and never where you aimed.",
    economy: "Fleetfoot: most Sylvan actions link into a red Sidestep or Surge, so a unit can move, act, and move again. Wildwood: Forests never hinder Sylvan units.",
    dialNote: "Fast and supple: speeds 1 to 4 (cavalry and flyers reach 5), gentle banks are blue, turns are white. Treants are slow.",
    rules: ["wildwood"],
  },

  greenskin: {
    id: "greenskin",
    name: "The Greenskin Warhorde",
    kin: "Orks, Goblins, and Trolls",
    color: "#A8B84A",
    tagline: "Cheap, loud, fast, and there are always more of them.",
    economy: "Mob Rule: a Greenskin is only Strained at 2 strain, so it can chain red maneuvers. No Guard action. Momentum: any maneuver of speed 4 or more grants a Frenzy token (reroll up to 2 attack dice).",
    dialNote: "Built to charge: no Stop, fast straights are blue, hard turns are mostly red. Goblins turn freely; contraptions hit speed 5.",
    rules: ["mob", "momentum"],
  },

  umbral: {
    id: "umbral",
    name: "The Umbral Covenant",
    kin: "Umbralis masters and their risen dead",
    color: "#9A86C9",
    tagline: "The dead do not tire. Their masters pull every string.",
    economy: "Puppet Strings: Thralls have no actions of their own. Masters take 2 actions each activation and spend them to Command thralls. Deathless: undead never gain strain; anything that would strain them deals 1 damage instead.",
    dialNote: "Relentless: mostly speeds 1 to 3 with white turns and no blue moves (the dead cannot rest). Swift spirits and death knights reach 4.",
    rules: ["deathless"],
  },

  calamity: {
    id: "calamity",
    name: "The Calamity Host",
    kin: "Demons of Calamity, Calamity Mages, and the Mutant-touched",
    color: "#D0644B",
    tagline: "Raw power that bites the hand that wields it.",
    economy: "Overreach: every unit may take a second action, but then rolls a Taint die (Strike: 1 damage, Rend: 1 damage and a critical). Channel banks Calamity charges (max 2) that turn any die into a Rend. Rift maneuvers teleport straight ahead, ignoring everything in the way.",
    dialNote: "Plain and white at low speed, plus Rift jumps that teleport straight ahead (mostly red, speed 2 to 5).",
    rules: ["overreach"],
  },

  concord: {
    id: "concord",
    name: "The Dawnward Concord",
    kin: "Humans, Halflings, and Lumanari, led by the Witch Hunters",
    color: "#D8C27A",
    tagline: "Combined arms and discipline. Nobody fights alone.",
    economy: "Discipline: a Concord unit rolls +1 defence die while another friendly unit is at range 1. Rally: Concord units may Rally (remove 1 strain) even while Strained. Commanders and Banners let one unit spend its action to give another a free action.",
    dialNote: "Balanced: speeds 1 to 4 with blue gentle moves and red hard turns at speed 3. Knights reach 5; war engines are slow.",
    rules: ["rally", "discipline"],
  },
};

// Attach each army's roster: champions first, then units. Dials resolve from
// their library key and every cost is computed from the profile.
export const MAX_UNITS = 12; // not counting the champion
export const MAX_COPIES = 3;
export const CHAMPION_PREMIUM = 1.15;
for (const [fid, roster] of Object.entries(ROSTERS)) {
  // Champions carry a 15% premium over their computed cost: a unique, optional slot of
  // concentrated power (simulated champion armies otherwise won about 60% of games).
  const build = (u, champion) => ({ ...u, champion, unique: champion, dialKey: u.dial, dial: DIALS[u.dial], cost: Math.round(unitCost(u, DIALS[u.dial]) * (champion ? CHAMPION_PREMIUM : 1)) });
  FACTIONS[fid].units = [...roster.champions.map((u) => build(u, true)), ...roster.units.map((u) => build(u, false))];
}

// Tags drive Bane and Deathless. Every Umbral unit is undead, every Calamity unit is Calamity-touched.
export const FACTION_TAGS = { umbral: ["undead"], calamity: ["calamity"] };

// ── Upgrades (one per unit) ──────────────────────────────────────────────────
export const UPGRADES = {
  veteran: { id: "veteran", name: "Veteran", cost: 3, text: "+1 initiative (max 6).", mod: { init: 1 } },
  hardened: { id: "hardened", name: "Hardened", cost: 3, text: "+1 wound.", mod: { wounds: 1 } },
  warded: { id: "warded", name: "Warded Standard", cost: 4, text: "+1 ward.", mod: { ward: 1 } },
  banner: { id: "banner", name: "Battle Banner", cost: 4, text: "Gain the Command action.", addAction: "command", notThrall: true },
  keen: { id: "keen", name: "Keen Eyes", cost: 2, text: "Gain the Mark action.", addAction: "mark", notThrall: true },
  // Faction relics: at most one relic per army.
  runeOfStone: { id: "runeOfStone", name: "Rune of Stone", cost: 3, faction: "holds", relic: true, text: "Brace may cancel a Rend instead of a Strike.", ability: "stoneRune" },
  cloakOfLeaves: { id: "cloakOfLeaves", name: "Cloak of Leaves", cost: 3, faction: "sylvan", relic: true, text: "Gain Elusive (+1 defence die at range 2 or more).", ability: "elusive" },
  krumpChoppa: { id: "krumpChoppa", name: "Choppa of Krumpin", cost: 3, faction: "greenskin", relic: true, text: "+1 attack die at range 1.", ability: "brutal" },
  phylactery: { id: "phylactery", name: "Phylactery", cost: 4, faction: "umbral", relic: true, text: "Start the battle with 2 Souls.", ability: "phylactery" },
  eyeOfRift: { id: "eyeOfRift", name: "Eye of the Rift", cost: 3, faction: "calamity", relic: true, text: "Taint rolls only hurt on a Rend.", ability: "riftEye" },
  dawnblade: { id: "dawnblade", name: "Dawnblade", cost: 3, faction: "concord", relic: true, text: "Gain Bane (+1 attack die vs undead and Calamity).", ability: "bane" },
};

export const ACTIONS = {
  steel: { name: "Steel", text: "Gain a Steel token. Spend it to turn every Omen into a Strike (attacking) or a Parry (defending)." },
  guard: { name: "Guard", text: "Gain a Guard token. Spend it while defending to add one Parry." },
  brace: { name: "Brace", text: "Gain a Brace token. Spend it after defence dice to cancel one Strike." },
  mark: { name: "Mark", text: "Mark an enemy at range 1 to 3. When attacking it, spend the Mark to reroll any attack dice." },
  surge: { name: "Surge", text: "Move again with a 1-straight or 1-bank. Fails if it would overlap a unit or rocks or leave the table; terrain entered still applies." },
  sidestep: { name: "Sidestep", text: "Slide sideways one base width plus 40. Same restrictions as Surge." },
  command: { name: "Command", text: "A friendly unit at range 1 to 2 takes one free white action." },
  mend: { name: "Mend", text: "Restore 1 ward to a friendly unit at range 1 (or yourself)." },
  rally: { name: "Rally", text: "Remove 1 strain." },
  channel: { name: "Channel", text: "Gain a Calamity charge (max 2). Spend one while attacking to change any die to a Rend." },
};

export const ABILITIES = {
  inspire: "Inspire: friendly units at range 1 may reroll 1 attack die.",
  shieldwall: "Shieldwall: +1 defence die while another friendly Shieldwall unit is at range 1.",
  wardRegen: "Rewarding: recover 1 ward in the End phase.",
  pierce: "Pierce: the defender rolls 1 fewer defence die.",
  ram: "Ram: when this unit bumps an enemy, that enemy suffers 1 damage.",
  swarm: "Swarm: +1 attack die if another friendly Swarm unit has the target in its front arc at range 1 to 2.",
  regenerate: "Regenerate: in the End phase, roll an attack die; on a Strike or Rend recover 1 wound.",
  master: "Master: takes 2 actions each activation, and may Command twice (two different units).",
  raise: "Raise: gains a Soul whenever a unit dies at range 1 to 2. In the End phase, spends Souls to heal 1 wound on thralls at range 2.",
  thrall: "Thrall: has no actions of its own. Can be Commanded to Steel, Guard, or Surge.",
  fear: "Fear: at the start of the Engagement phase, each enemy at range 1 gains 1 strain.",
  ethereal: "Ethereal: moves through units and obstacles without effect (it still cannot end on top of a unit).",
  unstable: "Unstable: when destroyed, every unit at range 1 suffers 1 damage.",
  elusive: "Elusive: +1 defence die at range 2 or more.",
  bane: "Bane: +1 attack die against undead and Calamity units.",
  brutal: "Brutal: +1 attack die at range 1.",
  stoneRune: "Rune of Stone: Brace may cancel a Rend.",
  phylactery: "Phylactery: starts with 2 Souls.",
  riftEye: "Eye of the Rift: Taint rolls only hurt on a Rend.",
  charge: "Charge: +1 attack die at range 1 after executing a maneuver of speed 3 or more this round.",
  sniper: "Sniper: targets do not gain the range 3 defence bonus.",
  armored: "Armored: an attack that would deal 2 or more damage deals 1 less.",
  flying: "Flying: ignores obstacles when moving.",
  healer: "Healer: in the End phase, heal 1 wound on the friendly unit at range 1 with the lowest share of its wounds left.",
  berserk: "Berserk: +1 attack die while wounded.",
  stealthy: "Stealthy: cannot be attacked from range 3 or more.",
  guardian: "Guardian: other friendly units at range 1 roll 1 extra defence die.",
  vampiric: "Vampiric: heals 1 wound whenever its attack deals damage.",
  poison: "Poison: an attack that deals damage also inflicts Bleeding.",
  blast: "Blast: an attack that deals damage also deals 1 damage to every other enemy at range 1 of the target.",
  fearless: "Fearless: immune to Fear and to the Shaken critical.",
  warcry: "Warcry: at the start of the Engagement phase, this unit and friendly units at range 1 to 2 each have at least one Steel token.",
};

export function unitDef(factionId, unitId) {
  const f = FACTIONS[factionId];
  const u = f && f.units.find((x) => x.id === unitId);
  if (!u) throw new Error(`unknown unit ${factionId}/${unitId}`);
  return u;
}

export function upgradesFor(factionId, unit) {
  return Object.values(UPGRADES).filter((g) => {
    if (g.faction && g.faction !== factionId) return false;
    if (g.notThrall && unit.abilities.includes("thrall")) return false;
    if (g.addAction && unit.actions.some((a) => a.replace(/^r:/, "").split(">")[0] === g.addAction)) return false;
    // Relics only where they do something for this unit.
    if (g.ability && unit.abilities.includes(g.ability)) return false;
    if (g.id === "phylactery" && !unit.abilities.includes("raise")) return false;
    if (g.id === "runeOfStone" && !unit.actions.some((a) => a.includes("brace"))) return false;
    return true;
  });
}

/** Validate a muster list. Returns { ok, cost, errors }. */
export function validateArmy(factionId, list, budget) {
  const errors = [];
  const f = typeof factionId === "string" && Object.hasOwn(FACTIONS, factionId) ? FACTIONS[factionId] : null;
  if (!f) return { ok: false, cost: 0, errors: ["Pick a faction first."] };
  if (!Array.isArray(list) || list.length === 0) errors.push("Muster at least one unit.");
  let cost = 0;
  let relics = 0;
  let champions = 0;
  let regulars = 0;
  const copies = {};
  for (const entry of Array.isArray(list) ? list : []) {
    if (!entry || typeof entry !== "object") { errors.push("Bad army entry."); continue; }
    const u = f.units.find((x) => x.id === entry.unit);
    if (!u) { errors.push(`Unknown unit ${entry.unit}.`); continue; }
    cost += u.cost;
    if (u.champion) champions++;
    else regulars++;
    copies[u.id] = (copies[u.id] || 0) + 1;
    if (!u.champion && copies[u.id] === MAX_COPIES + 1) errors.push(`At most ${MAX_COPIES} of ${u.name}.`);
    if (entry.upgrade) {
      const g = Object.hasOwn(UPGRADES, entry.upgrade) ? UPGRADES[entry.upgrade] : null;
      if (!g || !upgradesFor(factionId, u).includes(g)) { errors.push(`${u.name} cannot take that upgrade.`); continue; }
      cost += g.cost;
      if (g.relic) relics++;
    }
  }
  if (champions > 1) errors.push("Only one champion per army.");
  if (regulars > MAX_UNITS) errors.push(`No more than ${MAX_UNITS} units plus a champion.`);
  if (relics > 1) errors.push("Only one relic per army.");
  if (cost > budget) errors.push(`Over budget: ${cost} / ${budget}.`);
  return { ok: errors.length === 0, cost, errors };
}
