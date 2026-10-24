// Points cost, derived from what a unit can do. No unit carries a hand-set
// cost: change a stat and the price follows.
//
//   power    = offense x durability: a unit that hits hard AND survives is worth
//              more than the sum of the two (Lanchester's square law), so they
//              multiply, then a 0.6 exponent keeps big monsters affordable.
//   utility  = movement + initiative + actions + abilities, added on top.
//   cost     = POWER_K x power^0.6 + utility, rounded, minimum 4.
import { parseManeuver } from "./geometry.js";

const POWER_K = 1.6;

// Firing arcs: an all-round arc can always find a target; a rear arc rarely does.
const ARC = { front: 1, rear: 0.55, full: 1.45 };

export const ACTION_VALUE = {
  steel: 1.2, guard: 1.2, brace: 1.1, mark: 0.9, surge: 1.1, sidestep: 1.3,
  command: 1.6, mend: 1.3, rally: 0.6, channel: 1.1,
};

export const ABILITY_VALUE = {
  inspire: 2, shieldwall: 1.2, wardRegen: 1.6, pierce: 1.4, ram: 0.8, swarm: 0.8, regenerate: 1.8,
  master: 3, raise: 2, thrall: -1.5, fear: 1.5, ethereal: 1.4, unstable: 0.3, elusive: 1.5, bane: 1,
  brutal: 1.2, charge: 1.3, sniper: 1.2, armored: 2, flying: 1, healer: 2, berserk: 1, stealthy: 1.4,
  guardian: 1.8, vampiric: 1.5, poison: 1.3, blast: 1.8, fearless: 0.6, warcry: 2.2,
  // Relic abilities are priced by the relic itself, not the unit.
  stoneRune: 0, phylactery: 0, riftEye: 0,
};

function weaponValue(w) {
  const [lo, hi] = w.range;
  const reach = 1 + 0.3 * (hi - 1) - 0.12 * (lo - 1);
  return w.dice * reach * ARC[w.arc] * (w.noRangeBonus ? 0.92 : 1);
}

function offense(u) {
  const vals = u.weapons.map(weaponValue).sort((a, b) => b - a);
  // The best weapon counts in full; extra weapons add options, not extra attacks.
  return (vals[0] || 0) + 0.3 * vals.slice(1).reduce((a, v) => a + v, 0);
}

function durability(u) {
  return (u.wounds + 1.25 * u.ward) * (1 + 0.3 * u.def);
}

function mobility(dialCodes) {
  const ms = dialCodes.map(parseManeuver);
  const max = Math.max(...ms.map((m) => m.speed));
  const blue = ms.filter((m) => m.color === "blue").length;
  const red = ms.filter((m) => m.color === "red").length;
  const rift = ms.some((m) => m.type === "RF") ? 0.8 : 0;
  return 0.5 * max + 0.1 * ms.length + 0.15 * blue - 0.1 * red + rift;
}

function actionsValue(actions) {
  let total = 0;
  for (const entry of actions) {
    const [head, tail] = entry.split(">");
    const one = (s) => ACTION_VALUE[s.replace(/^r:/, "")] * (s.startsWith("r:") ? 0.55 : 1);
    total += one(head) + (tail ? 0.6 * one(tail) : 0);
  }
  return total;
}

/** Itemised cost, for the builder's tooltip and for tests. */
export function costBreakdown(u, dialCodes) {
  const power = offense(u) * durability(u);
  const parts = {
    power: POWER_K * power ** 0.6,
    movement: 0.4 * mobility(dialCodes),
    initiative: 0.3 * u.init,
    actions: 0.5 * actionsValue(u.actions),
    abilities: 0.8 * u.abilities.reduce((a, k) => a + (ABILITY_VALUE[k] ?? 0), 0),
  };
  const total = Math.max(4, Math.round(Object.values(parts).reduce((a, v) => a + v, 0)));
  return { ...parts, total };
}

export function unitCost(u, dialCodes) {
  return costBreakdown(u, dialCodes).total;
}
