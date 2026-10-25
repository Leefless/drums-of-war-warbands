// Battlefields, matchups and the terrain shop.
//
// Battlefield: the player with the most points left unspent after the muster chooses it.
//   Each battlefield favours two armies and hinders two (each army is favoured on exactly
//   one battlefield and hindered on exactly one, so no army wins the map pick by default),
//   and it shapes which random terrain appears.
// Matchups: a rock-paper-scissors ring. Each army hunts the next one: +1 attack die against it.
//   (A version that also cost the prey a die swung those games to 86 to 98%; the hunter-only
//   edge moves them about 15 to 25 points.)
// Terrain shop: armies buy pieces in the muster and place them during deployment.

/** Small army effects a battlefield can apply. */
export const MAP_EFFECTS = {
  swift: { name: "Swift", text: "+1 initiative", init: 1 },
  sluggish: { name: "Sluggish", text: "-1 initiative", init: -1 },
  fury: { name: "Fury", text: "+1 attack die at range 1", melee: 1 },
  blunted: { name: "Blunted", text: "-1 attack die at range 1", melee: -1 },
  stalwart: { name: "Stalwart", text: "+1 defence die against attacks from range 2 or more", ranged: 1 },
  exposed: { name: "Exposed", text: "-1 defence die against attacks from range 2 or more", ranged: -1 },
};

export const MAPS = {
  meadow: {
    id: "meadow",
    name: "Greenmeadow",
    text: "Open rolling grassland with few places to hide. Hills dot the fields.",
    weights: { hill: 3, thicket: 1, ruins: 1, marsh: 1, lava: 0.5, rift: 0.5, block: 1.5 },
    effects: {
      concord: ["swift", "Open ground suits drilled ranks and cavalry."],
      greenskin: ["fury", "Room to build up a proper charge."],
      sylvan: ["exposed", "No cover to slip between."],
      holds: ["sluggish", "A long march across open fields."],
    },
  },
  moor: {
    id: "moor",
    name: "Grey Moor",
    text: "Mist, bog and bare stone. Marshes and rocks everywhere.",
    weights: { hill: 1, thicket: 1, ruins: 1.5, marsh: 3, lava: 0.3, rift: 0.7, block: 2.5 },
    effects: {
      umbral: ["stalwart", "The dead march unseen in the mist."],
      sylvan: ["swift", "Fog-walkers who know every path."],
      concord: ["sluggish", "Cartwheels and horses bog down."],
      calamity: ["blunted", "Rift-fire sputters in the wet."],
    },
  },
  scar: {
    id: "scar",
    name: "Riftscar Waste",
    text: "Blasted ground split by rifts and lava. Little grows here.",
    weights: { hill: 1, thicket: 0.5, ruins: 1.5, marsh: 0.5, lava: 2.5, rift: 2.5, block: 1.5 },
    effects: {
      calamity: ["fury", "The rift sings to its children."],
      holds: ["stalwart", "Forge-born, they stand firm in fire and stone."],
      umbral: ["blunted", "Rift-light unravels the bindings of the dead."],
      greenskin: ["sluggish", "Nothing to loot, nothing to eat, nothing to cheer about."],
    },
  },
};

/** The effect (from MAP_EFFECTS) a battlefield gives an army, or null. */
export function mapEffect(mapId, faction) {
  const e = MAPS[mapId]?.effects[faction];
  return e ? { key: e[0], why: e[1], ...MAP_EFFECTS[e[0]] } : null;
}

/** Who hunts whom: each army gains +1 attack die against the next one in the ring. */
// Ring order chosen from a measured army-against-army table so no hunter is already dominant
// against its prey (every hunter wins 59 to 72% there, instead of up to 88%).
export const HUNT_RING = ["holds", "sylvan", "calamity", "concord", "greenskin", "umbral"];
export const HUNT_REASON = {
  holds: "The oldest feud: dwarf axes against the old forests. The Iron Holds hunt the Sylvan Courts.",
  sylvan: "The living wood purges rift taint. The Sylvan Courts hunt the Calamity Host.",
  calamity: "The rift feeds on mortal fear and faith. The Calamity Host hunts the Dawnward Concord.",
  concord: "Disciplined pike lines break the horde. The Dawnward Concord hunts the Greenskin Warhorde.",
  greenskin: "Orcs do not fear the dead; they just smash the bones. The Greenskin Warhorde hunts the Umbral Covenant.",
  umbral: "The dead rise from the deep tombs of the Holds' own ancestors. The Umbral Covenant hunts the Iron Holds.",
};
export const preyOf = (f) => HUNT_RING[(HUNT_RING.indexOf(f) + 1) % HUNT_RING.length];
export const hunterOf = (f) => HUNT_RING[(HUNT_RING.indexOf(f) + HUNT_RING.length - 1) % HUNT_RING.length];
/** Attack dice from the matchup when an army of faction a attacks one of faction b. */
export function matchupDice(a, b) {
  if (a === b) return 0;
  return preyOf(a) === b ? 1 : 0;
}

/** Terrain an army can buy in the muster and place during deployment. */
export const TERRAIN_SHOP = { hill: 8, thicket: 5, ruins: 5, marsh: 4, lava: 5, rift: 5, block: 3 };
/** Pieces one player may buy: 3 at 100 points or less, more in bigger games. */
export const terrainLimit = (budget) => Math.round(3 * Math.max(1, Math.min(300, Number(budget) || 100) / 100));
export const terrainBuyCost = (buys) => (Array.isArray(buys) ? buys.reduce((a, k) => a + (TERRAIN_SHOP[k] ?? 0), 0) : 0);
