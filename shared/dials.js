// Maneuver dial library. Rosters pick a dial by key so each army keeps its
// movement identity (see factions.js dialNote) while units within an army still
// move differently. Notation: see geometry.js parseManeuver ("2BL:w").

const dial = (s) => s.trim().split(/\s+/);

export const DIALS = {
  // The Iron Holds: slow and steady; white stop, red turns.
  holds: dial(`0X:w 1S:b 1BL:w 1BR:w 1TL:r 1TR:r 2S:b 2BL:w 2BR:w 2TL:r 2TR:r 3S:w`),
  holdsSteady: dial(`0X:w 1S:b 1BL:b 1BR:b 2S:b 2BL:w 2BR:w`),
  holdsSlow: dial(`0X:w 1S:w 1BL:r 1BR:r 2S:r`),
  holdsGiant: dial(`1S:w 1BL:w 1BR:w 1TL:r 1TR:r 2S:w 2BL:w 2BR:w 3S:w`),
  holdsRam: dial(`1S:w 2S:b 2BL:w 2BR:w 2TL:r 2TR:r 3S:b 3BL:w 3BR:w 4S:w`),
  holdsGyro: dial(`1BL:w 1BR:w 2S:b 2BL:b 2BR:b 2TL:w 2TR:w 3S:b 3BL:w 3BR:w 4S:w 3A:r`),

  // The Sylvan Courts: fast and supple; blue banks, white turns.
  sylvan: dial(`1TL:w 1BL:b 1S:b 1BR:b 1TR:w 2TL:w 2BL:b 2S:b 2BR:b 2TR:w 3TL:w 3BL:w 3S:w 3BR:w 3TR:w 4S:w 3A:r`),
  sylvanCav: dial(`1TL:w 1BL:b 1S:b 1BR:b 1TR:w 2TL:w 2BL:b 2S:b 2BR:b 2TR:w 3TL:w 3BL:w 3S:w 3BR:w 3TR:w 4S:w 5S:w 3A:r`),
  sylvanSkirmish: dial(`1TL:b 1BL:b 1S:b 1BR:b 1TR:b 2TL:w 2BL:b 2S:b 2BR:b 2TR:w 3S:w 2A:r`),
  sylvanFlyer: dial(`1TL:w 1BL:b 1S:b 1BR:b 1TR:w 2TL:b 2BL:b 2S:b 2BR:b 2TR:b 3TL:w 3BL:b 3S:b 3BR:b 3TR:w 4S:b 5S:w 2A:w`),
  sylvanTree: dial(`0X:w 1S:b 1BL:w 1BR:w 1TL:w 1TR:w 2S:w 2BL:w 2BR:w`),

  // The Greenskin Warhorde: no stop; fast blue straights, red hard turns.
  green: dial(`1TL:w 1TR:w 2TL:r 2BL:w 2S:w 2BR:w 2TR:r 3TL:r 3BL:w 3S:b 3BR:w 3TR:r 4S:b 5S:b 4A:r`),
  greenTroll: dial(`1TL:w 1TR:w 2BL:w 2S:b 2BR:w 2TL:r 2TR:r 3S:b 3BL:w 3BR:w 4S:w`),
  greenGoblin: dial(`1TL:w 1BL:w 1S:w 1BR:w 1TR:w 2TL:w 2BL:w 2S:w 2BR:w 2TR:w 3S:b 4S:b 2A:r`),
  greenWolf: dial(`2TL:w 2BL:b 2S:b 2BR:b 2TR:w 3TL:w 3BL:w 3S:b 3BR:w 3TR:w 4S:b 5S:b 3A:r`),
  greenJunk: dial(`2S:b 3S:b 4S:b 5S:w 2BL:r 2BR:r 3BL:w 3BR:w`),

  // The Umbral Covenant: all white, never blue.
  umbral: dial(`1TL:w 1BL:w 1S:w 1BR:w 1TR:w 2TL:w 2BL:w 2S:w 2BR:w 2TR:w 3S:w 3A:r`),
  umbralHeavy: dial(`1TL:w 1BL:w 1S:w 1BR:w 1TR:w 2BL:w 2S:w 2BR:w 3S:w`),
  umbralShamble: dial(`1TL:w 1BL:w 1S:w 1BR:w 1TR:w 2S:w`),
  umbralSwift: dial(`1TL:w 1BL:w 1S:w 1BR:w 1TR:w 2TL:w 2BL:w 2S:w 2BR:w 2TR:w 3BL:w 3S:w 3BR:w 4S:w 2A:w`),
  umbralKnight: dial(`1S:w 2BL:w 2S:w 2BR:w 3BL:w 3S:w 3BR:w 4S:w 3TL:r 3TR:r 4A:r`),

  // The Calamity Host: plain at low speed, plus red Rift jumps.
  calamity: dial(`1TL:w 1S:w 1TR:w 2TL:w 2BL:w 2S:w 2BR:w 2TR:w 3S:w 4S:r 2RF:r 3RF:r 4RF:r`),
  calamityBrute: dial(`1TL:w 1S:w 1TR:w 2BL:w 2S:w 2BR:w 3S:w 2RF:r`),
  calamitySpawn: dial(`1TL:w 1BL:w 1S:w 1BR:w 1TR:w 2TL:w 2S:w 2TR:w 3S:r`),
  calamityFlyer: dial(`1TL:w 1BL:w 1S:w 1BR:w 1TR:w 2TL:w 2BL:w 2S:w 2BR:w 2TR:w 3BL:w 3S:w 3BR:w 4S:w 3RF:r 5RF:r`),
  calamityRifter: dial(`1S:w 2S:w 2BL:w 2BR:w 1RF:w 2RF:w 3RF:r 4RF:r 5RF:r`),

  // The Dawnward Concord: balanced 1 to 4, blue gentle moves.
  concord: dial(`1TL:w 1BL:b 1S:b 1BR:b 1TR:w 2TL:w 2BL:w 2S:b 2BR:w 2TR:w 3TL:r 3BL:w 3S:w 3BR:w 3TR:r 4S:w 4A:r`),
  concordHeavy: dial(`1TL:w 1BL:b 1S:b 1BR:b 1TR:w 2S:b 2BL:w 2BR:w 3S:w`),
  concordCav: dial(`1S:w 2TL:w 2BL:b 2S:b 2BR:b 2TR:w 3TL:r 3BL:w 3S:b 3BR:w 3TR:r 4S:b 5S:w 4A:r`),
  concordLight: dial(`1TL:b 1BL:b 1S:b 1BR:b 1TR:b 2TL:w 2BL:b 2S:b 2BR:b 2TR:w 3BL:w 3S:w 3BR:w 2A:r`),
  concordEngine: dial(`0X:w 1S:w 1BL:w 1BR:w 2S:w 2BL:r 2BR:r`),
};

/** Which dials each army may use (keeps each army's movement identity). */
export const FACTION_DIALS = {
  holds: ["holds", "holdsSteady", "holdsSlow", "holdsGiant", "holdsRam", "holdsGyro"],
  sylvan: ["sylvan", "sylvanCav", "sylvanSkirmish", "sylvanFlyer", "sylvanTree"],
  greenskin: ["green", "greenTroll", "greenGoblin", "greenWolf", "greenJunk"],
  umbral: ["umbral", "umbralHeavy", "umbralShamble", "umbralSwift", "umbralKnight"],
  calamity: ["calamity", "calamityBrute", "calamitySpawn", "calamityFlyer", "calamityRifter"],
  concord: ["concord", "concordHeavy", "concordCav", "concordLight", "concordEngine"],
};
