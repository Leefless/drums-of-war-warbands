// Army data for Drums of War: Warbands. Pure data: the engine reads it, the
// browser renders it. Every faction differs in three places:
//   1. its maneuver dial (speed range, which turns are easy or straining),
//   2. its action economy (how many actions, and on what terms),
//   3. its unit abilities.
//
// Action notation: "steel" white action, "r:sidestep" red action (gains strain),
// "steel>r:sidestep" linked: after Steel you may immediately take a red Sidestep.
// Dial notation: see shared/geometry.js parseManeuver ("2BL:w").

const dial = (s) => s.trim().split(/\s+/);

// ── Shared dials ─────────────────────────────────────────────────────────────
const HOLDS_DIAL = dial(`0X:w 1S:b 1BL:w 1BR:w 1TL:r 1TR:r 2S:b 2BL:w 2BR:w 2TL:r 2TR:r 3S:w`);
const SYLVAN_DIAL = dial(`1TL:w 1BL:b 1S:b 1BR:b 1TR:w 2TL:w 2BL:b 2S:b 2BR:b 2TR:w 3TL:w 3BL:w 3S:w 3BR:w 3TR:w 4S:w 3A:r`);
const GREEN_DIAL = dial(`1TL:w 1TR:w 2TL:r 2BL:w 2S:w 2BR:w 2TR:r 3TL:r 3BL:w 3S:b 3BR:w 3TR:r 4S:b 5S:b 4A:r`);
const UMBRAL_DIAL = dial(`1TL:w 1BL:w 1S:w 1BR:w 1TR:w 2TL:w 2BL:w 2S:w 2BR:w 2TR:w 3S:w 3A:r`);
const CALAMITY_DIAL = dial(`1TL:w 1S:w 1TR:w 2TL:w 2BL:w 2S:w 2BR:w 2TR:w 3S:w 4S:r 2RF:r 3RF:r 4RF:r`);
const CONCORD_DIAL = dial(`1TL:w 1BL:b 1S:b 1BR:b 1TR:w 2TL:w 2BL:w 2S:b 2BR:w 2TR:w 3TL:r 3BL:w 3S:w 3BR:w 3TR:r 4S:w 4A:r`);

export const FACTIONS = {
  holds: {
    id: "holds",
    name: "The Iron Holds",
    kin: "Dwarves, with Giant Kin sellswords",
    color: "#8FA9BC",
    tagline: "Slow, armoured, and never moved from ground they mean to keep.",
    economy: "Unyielding: a unit that executes a stop or a 1-straight may take a second action (Steel or Brace only). Brace tokens cancel a Strike after the defence roll.",
    dialNote: "Top speed 3. Stop is a white maneuver. Every turn is red.",
    rules: ["unyielding"],
    units: [
      { id: "thane", name: "Hold-Thane", role: "Commander", unique: true, cost: 22, base: "medium", init: 5,
        weapons: [{ name: "Rune Axe", dice: 3, arc: "front", range: [1, 1] }],
        def: 1, wounds: 6, ward: 2, actions: ["steel", "brace", "command"], abilities: ["inspire"], dial: HOLDS_DIAL,
        flavor: "Oath-bound lord of a mountain hold, last of a line that remembers the world before the Merging." },
      { id: "ironbreakers", name: "Ironbreaker Shieldline", role: "Line infantry", cost: 14, base: "medium", init: 2,
        weapons: [{ name: "Hammers", dice: 3, arc: "front", range: [1, 1] }],
        def: 1, wounds: 6, ward: 0, actions: ["steel", "brace"], abilities: ["shieldwall"], dial: HOLDS_DIAL,
        flavor: "Locked shields, rune-etched mail. They advance one step at a time and do not step back." },
      { id: "gunners", name: "Thunderbarge Gunners", role: "Ranged", cost: 13, base: "medium", init: 3,
        weapons: [{ name: "Handcannons", dice: 3, arc: "front", range: [2, 3] }],
        def: 0, wounds: 4, ward: 0, actions: ["steel", "mark"], abilities: [], dial: HOLDS_DIAL,
        flavor: "Blackpowder and grudges. Too close and the barrels are useless; at range they are murder." },
      { id: "runepriest", name: "Runepriest", role: "Support caster", cost: 14, base: "small", init: 4,
        weapons: [{ name: "Rune Bolt", dice: 2, arc: "full", range: [1, 2] }],
        def: 1, wounds: 3, ward: 2, actions: ["steel", "mend"], abilities: ["wardRegen"], dial: HOLDS_DIAL,
        flavor: "Carves wards into stone and steel; the runes knit closed as fast as the enemy breaks them." },
      { id: "grudgecannon", name: "Grudgebreaker Cannon", role: "Artillery", cost: 20, base: "large", init: 1,
        weapons: [{ name: "Grudgeshot", dice: 4, arc: "front", range: [2, 4], noRangeBonus: true }],
        def: 0, wounds: 6, ward: 0, actions: ["mark"], abilities: ["pierce"], dial: dial(`0X:w 1S:w 1BL:r 1BR:r 2S:r`),
        flavor: "Each shot carries a name chiselled into the ball. It reaches across the whole field." },
      { id: "hurlers", name: "Giant-Kin Hurlers", role: "Mercenary brute", cost: 18, base: "large", init: 2,
        weapons: [
          { name: "Boulders", dice: 3, arc: "front", range: [1, 3] },
          { name: "Fists", dice: 4, arc: "front", range: [1, 1] },
        ],
        def: 0, wounds: 8, ward: 0, actions: ["steel"], abilities: ["ram"], dial: dial(`1S:w 1BL:w 1BR:w 1TL:r 1TR:r 2S:w 2BL:w 2BR:w 3S:w`),
        flavor: "Giant Kin who trade the Holds their strength for ale and a share of the hoard." },
    ],
  },

  sylvan: {
    id: "sylvan",
    name: "The Sylvan Courts",
    kin: "Wood Elves and High Elves",
    color: "#5FAE8C",
    tagline: "Fast, fragile, and never where you aimed.",
    economy: "Fleetfoot: most Sylvan actions link into a red Sidestep or Surge, so a unit can move, act, and move again. Wildwood: Thickets never hinder Sylvan units.",
    dialNote: "Speeds 1 to 4, banks are blue, and every turn is white.",
    rules: ["wildwood"],
    units: [
      { id: "lady", name: "Lady of the Glade", role: "Commander", unique: true, cost: 24, base: "small", init: 6,
        weapons: [{ name: "Moonblade", dice: 3, arc: "front", range: [1, 2] }],
        def: 3, wounds: 4, ward: 2, actions: ["steel>r:sidestep", "guard", "sidestep", "command"], abilities: ["inspire"], dial: SYLVAN_DIAL,
        flavor: "A thousand years old and still the quickest blade in the wood." },
      { id: "wardens", name: "Glade Wardens", role: "Archers", cost: 11, base: "small", init: 4,
        weapons: [{ name: "Longbows", dice: 2, arc: "front", range: [1, 3] }],
        def: 2, wounds: 3, ward: 0, actions: ["steel>r:sidestep", "guard", "mark", "sidestep"], abilities: [], dial: SYLVAN_DIAL,
        flavor: "Wood Elf hunters. Loose, step aside, and loose again." },
      { id: "thornriders", name: "Thornriders", role: "Cavalry", cost: 16, base: "medium", init: 5,
        weapons: [{ name: "Thorn Lances", dice: 3, arc: "front", range: [1, 1] }],
        def: 2, wounds: 4, ward: 1, actions: ["steel>r:surge", "guard", "surge"], abilities: [],
        dial: [...SYLVAN_DIAL, "5S:w"],
        flavor: "Riders on great antlered elk that run through the trees without breaking stride." },
      { id: "starweaver", name: "Starweaver", role: "Battle mage", cost: 17, base: "small", init: 3,
        weapons: [{ name: "Starfire", dice: 3, arc: "full", range: [1, 2] }],
        def: 2, wounds: 2, ward: 3, actions: ["steel", "guard>r:sidestep"], abilities: ["wardRegen"], dial: SYLVAN_DIAL,
        flavor: "High Elf scholar-mage. Her wards are woven fresh with every breath." },
      { id: "bladesingers", name: "Bladesinger Court", role: "Elite infantry", cost: 18, base: "medium", init: 6,
        weapons: [{ name: "Singing Blades", dice: 3, arc: "front", range: [1, 1] }],
        def: 3, wounds: 3, ward: 1, actions: ["steel", "guard", "sidestep"], abilities: [], dial: SYLVAN_DIAL,
        flavor: "High Elf duellists who fight as a single dance. Almost impossible to land a blow on." },
    ],
  },

  greenskin: {
    id: "greenskin",
    name: "The Greenskin Warhorde",
    kin: "Orks, Goblins, and Trolls",
    color: "#A8B84A",
    tagline: "Cheap, loud, fast, and there are always more of them.",
    economy: "Mob Rule: a Greenskin is only Strained at 2 strain, so it can chain red maneuvers. No Guard action. Momentum: any maneuver of speed 4 or more grants a Frenzy token (reroll up to 2 attack dice).",
    dialNote: "No stop and few slow moves. Fast straights are blue; hard turns are red.",
    rules: ["mob", "momentum"],
    units: [
      { id: "warboss", name: "Warboss", role: "Commander", unique: true, cost: 22, base: "medium", init: 5,
        weapons: [{ name: "Big Choppa", dice: 4, arc: "front", range: [1, 1] }],
        def: 1, wounds: 7, ward: 1, actions: ["steel", "command"], abilities: ["inspire", "ram"], dial: GREEN_DIAL,
        flavor: "Biggest, meanest, loudest. The horde follows the noise he makes." },
      { id: "goblins", name: "Goblin Rabble", role: "Swarm", cost: 6, base: "small", init: 1,
        weapons: [{ name: "Shivs and Short Bows", dice: 2, arc: "front", range: [1, 2] }],
        def: 1, wounds: 2, ward: 0, actions: ["steel"], abilities: ["swarm"], dial: GREEN_DIAL,
        flavor: "Individually pathetic. Collectively, a problem." },
      { id: "boyz", name: "Ork Boyz", role: "Line infantry", cost: 12, base: "medium", init: 2,
        weapons: [{ name: "Choppas", dice: 3, arc: "front", range: [1, 1] }],
        def: 0, wounds: 6, ward: 0, actions: ["steel"], abilities: ["ram"], dial: GREEN_DIAL,
        flavor: "They do not dodge. They do not need to." },
      { id: "boarriders", name: "Boar Riders", role: "Cavalry", cost: 13, base: "medium", init: 3,
        weapons: [{ name: "Tusks and Spears", dice: 3, arc: "front", range: [1, 1] }],
        def: 1, wounds: 4, ward: 0, actions: ["steel", "surge"], abilities: ["ram"], dial: GREEN_DIAL,
        flavor: "War-boars with iron tusks, ridden by Orks who think brakes are for Goblins." },
      { id: "trolls", name: "Troll Smashas", role: "Monster", cost: 20, base: "large", init: 1,
        weapons: [{ name: "Clubs", dice: 4, arc: "front", range: [1, 1] }],
        def: 0, wounds: 9, ward: 0, actions: ["steel"], abilities: ["ram", "regenerate"],
        dial: dial(`1TL:w 1TR:w 2BL:w 2S:b 2BR:w 2TL:r 2TR:r 3S:b 3BL:w 3BR:w 4S:w`),
        flavor: "Cut one down and it gets back up, angrier." },
      { id: "shaman", name: "Weirdboy Shaman", role: "Caster", cost: 12, base: "small", init: 4,
        weapons: [{ name: "Green Bolt", dice: 3, arc: "full", range: [1, 2] }],
        def: 1, wounds: 3, ward: 1, actions: ["steel", "mark"], abilities: [], dial: GREEN_DIAL,
        flavor: "Soaks up the horde's noise and spits it back out as lightning." },
    ],
  },

  umbral: {
    id: "umbral",
    name: "The Umbral Covenant",
    kin: "Umbralis masters and their risen dead",
    color: "#9A86C9",
    tagline: "The dead do not tire. Their masters pull every string.",
    economy: "Puppet Strings: Thralls have no actions of their own. Masters take 2 actions each activation and spend them to Command thralls. Deathless: undead never gain strain; anything that would strain them deals 1 damage instead.",
    dialNote: "Speeds 1 to 3, every turn white, no blue moves (the dead cannot rest).",
    rules: ["deathless"],
    units: [
      { id: "shade", name: "Umbralis Shade", role: "Master", unique: true, cost: 18, base: "small", init: 6,
        weapons: [
          { name: "Shadowblade", dice: 3, arc: "front", range: [1, 1] },
          { name: "Soul Lance", dice: 2, arc: "full", range: [1, 2] },
        ],
        def: 2, wounds: 4, ward: 1, actions: ["steel", "mark", "command", "sidestep"], abilities: ["master"], dial: UMBRAL_DIAL,
        flavor: "Concentrated shadow and will, wearing a borrowed face." },
      { id: "necromancer", name: "Necromancer", role: "Master", cost: 18, base: "small", init: 4,
        weapons: [{ name: "Grave Bolt", dice: 3, arc: "full", range: [1, 2] }],
        def: 1, wounds: 3, ward: 2, actions: ["steel", "command"], abilities: ["master", "raise"], dial: UMBRAL_DIAL,
        flavor: "Harvests the dying. Every death nearby is fuel to mend the risen." },
      { id: "skeletons", name: "Skeleton Levy", role: "Thrall infantry", cost: 7, base: "medium", init: 1,
        weapons: [{ name: "Rusted Spears", dice: 2, arc: "front", range: [1, 1] }],
        def: 1, wounds: 4, ward: 0, actions: [], abilities: ["thrall"], dial: UMBRAL_DIAL,
        flavor: "Yesterday's dead, today's front line." },
      { id: "ghouls", name: "Ghoul Pack", role: "Thrall hunters", cost: 8, base: "small", init: 3,
        weapons: [{ name: "Claws", dice: 3, arc: "front", range: [1, 1] }],
        def: 1, wounds: 3, ward: 0, actions: [], abilities: ["thrall"], dial: UMBRAL_DIAL,
        flavor: "Fast, starving, and barely leashed." },
      { id: "wraiths", name: "Wraith Host", role: "Terror", cost: 14, base: "small", init: 5,
        weapons: [{ name: "Grave Touch", dice: 2, arc: "full", range: [1, 1] }],
        def: 2, wounds: 3, ward: 0, actions: ["guard"], abilities: ["fear", "ethereal"], dial: UMBRAL_DIAL,
        flavor: "They pass through walls and shields alike. The living break near them." },
      { id: "colossus", name: "Bone Colossus", role: "Thrall monster", cost: 22, base: "large", init: 2,
        weapons: [{ name: "Ossuary Fists", dice: 4, arc: "front", range: [1, 1] }],
        def: 0, wounds: 10, ward: 0, actions: [], abilities: ["thrall", "ram"],
        dial: dial(`1TL:w 1BL:w 1S:w 1BR:w 1TR:w 2BL:w 2S:w 2BR:w 3S:w`),
        flavor: "A cathedral of bones that walks." },
    ],
  },

  calamity: {
    id: "calamity",
    name: "The Calamity Host",
    kin: "Demons of Calamity, Calamity Mages, and the Mutant-touched",
    color: "#D0644B",
    tagline: "Raw power that bites the hand that wields it.",
    economy: "Overreach: every unit may take a second action, but then rolls a Taint die (Strike: 1 damage, Rend: 1 critical). Channel banks Calamity charges (max 2) that turn any die into a Rend. Rift maneuvers teleport straight ahead, ignoring everything in the way.",
    dialNote: "Plain and white at low speed, plus red Rift jumps of 2 to 4.",
    rules: ["overreach"],
    units: [
      { id: "demon", name: "Demon of Calamity", role: "Commander monster", unique: true, cost: 30, base: "large", init: 6,
        weapons: [
          { name: "Rending Talons", dice: 5, arc: "front", range: [1, 1] },
          { name: "Hellflame", dice: 3, arc: "full", range: [1, 2] },
        ],
        def: 1, wounds: 10, ward: 2, actions: ["steel", "channel", "command"], abilities: ["fear"], dial: CALAMITY_DIAL,
        flavor: "A thing from the Calamity Realm, wearing the shape of every nightmare at once." },
      { id: "spawn", name: "Spawn of Calamity", role: "Swarm", cost: 9, base: "small", init: 2,
        weapons: [{ name: "Maws", dice: 3, arc: "front", range: [1, 1] }],
        def: 1, wounds: 3, ward: 0, actions: ["channel"], abilities: ["unstable"], dial: CALAMITY_DIAL,
        flavor: "Unstable flesh that bursts when it dies." },
      { id: "mutants", name: "Tainted Mutants", role: "Line infantry", cost: 12, base: "medium", init: 3,
        weapons: [{ name: "Crude Blades", dice: 3, arc: "front", range: [1, 1] }],
        def: 1, wounds: 5, ward: 0, actions: ["steel", "channel"], abilities: [], dial: CALAMITY_DIAL,
        flavor: "Hunted by Witch Hunters for what they became. They have stopped running." },
      { id: "mage", name: "Calamity Mage", role: "Caster", cost: 16, base: "small", init: 4,
        weapons: [{ name: "Ruinfire", dice: 3, arc: "full", range: [1, 3] }],
        def: 1, wounds: 3, ward: 2, actions: ["steel", "channel", "mark"], abilities: [], dial: CALAMITY_DIAL,
        flavor: "Took the taint willingly. Power far beyond mortal limits, for now." },
      { id: "stalker", name: "Rift Stalker", role: "Hunter", cost: 17, base: "medium", init: 5,
        weapons: [{ name: "Phase Claws", dice: 3, arc: "front", range: [1, 1] }],
        def: 2, wounds: 5, ward: 1, actions: ["steel", "guard", "channel"], abilities: ["fear"], dial: CALAMITY_DIAL,
        flavor: "Steps through the seams of the world and out behind you." },
    ],
  },

  concord: {
    id: "concord",
    name: "The Dawnward Concord",
    kin: "Humans, Halflings, and Lumanari, led by the Witch Hunters",
    color: "#D8C27A",
    tagline: "Combined arms and discipline. Nobody fights alone.",
    economy: "Rally: Concord units may Rally (remove 1 strain) even while Strained. Commanders and Banners let one unit spend its action to give another a free action.",
    dialNote: "Balanced speeds 1 to 4, blue gentle moves, red hard turns at speed 3.",
    rules: ["rally"],
    units: [
      { id: "captain", name: "Knight-Captain", role: "Commander", unique: true, cost: 22, base: "medium", init: 5,
        weapons: [{ name: "Longsword", dice: 3, arc: "front", range: [1, 1] }],
        def: 2, wounds: 6, ward: 1, actions: ["steel", "guard", "command", "rally"], abilities: ["inspire"], dial: CONCORD_DIAL,
        flavor: "Holds a line of farmers, scholars, and halflings together by voice alone." },
      { id: "halberdiers", name: "Free Company Halberdiers", role: "Line infantry", cost: 11, base: "medium", init: 2,
        weapons: [{ name: "Halberds", dice: 3, arc: "front", range: [1, 1] }],
        def: 1, wounds: 5, ward: 0, actions: ["steel", "guard", "rally"], abilities: [], dial: CONCORD_DIAL,
        flavor: "Paid in coin, kept in line by drill." },
      { id: "crossbows", name: "Crossbow Line", role: "Ranged", cost: 12, base: "medium", init: 3,
        weapons: [{ name: "Heavy Crossbows", dice: 2, arc: "front", range: [1, 3] }],
        def: 1, wounds: 3, ward: 0, actions: ["steel", "mark", "rally"], abilities: ["pierce"], dial: CONCORD_DIAL,
        flavor: "Bolts that punch through mail and demon hide alike." },
      { id: "outriders", name: "Halfling Outriders", role: "Skirmishers", cost: 10, base: "small", init: 5,
        weapons: [{ name: "Slings", dice: 2, arc: "front", range: [1, 2] }],
        def: 3, wounds: 2, ward: 0, actions: ["guard", "sidestep", "steel>sidestep"], abilities: ["elusive"], dial: CONCORD_DIAL,
        flavor: "Easy to miss, quick of hand, and cheerfully lethal with a stone." },
      { id: "hunters", name: "Witch Hunter Cadre", role: "Specialists", cost: 13, base: "small", init: 4,
        weapons: [{ name: "Silvered Pistols", dice: 3, arc: "front", range: [1, 2] }],
        def: 2, wounds: 3, ward: 0, actions: ["steel", "mark", "rally"], abilities: ["bane"], dial: CONCORD_DIAL,
        flavor: "Grim hunters of Calamity corruption. Silvered steel and no mercy." },
      { id: "lightbearer", name: "Lumanari Lightbearer", role: "Support caster", cost: 14, base: "small", init: 3,
        weapons: [{ name: "Radiance", dice: 2, arc: "full", range: [1, 2] }],
        def: 1, wounds: 3, ward: 2, actions: ["steel", "mend"], abilities: ["bane", "wardRegen"], dial: CONCORD_DIAL,
        flavor: "Born of light, they sense the Calamity-touched and burn them." },
    ],
  },
};

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
  cloakOfLeaves: { id: "cloakOfLeaves", name: "Cloak of Leaves", cost: 3, faction: "sylvan", relic: true, text: "+1 defence die at range 2 and 3.", ability: "elusive" },
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
  surge: { name: "Surge", text: "Move again with a 1-straight or 1-bank." },
  sidestep: { name: "Sidestep", text: "Slide sideways one base width plus a speed-1 template." },
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
  swarm: "Swarm: +1 attack die if another friendly Swarm unit also has the target in arc.",
  regenerate: "Regenerate: in the End phase, roll an attack die; on a Strike or Rend recover 1 wound.",
  master: "Master: takes 2 actions each activation.",
  raise: "Raise: gains a Soul whenever a unit dies at range 1 to 2. In the End phase, spends Souls to heal 1 wound on thralls at range 2.",
  thrall: "Thrall: has no actions of its own. Can be Commanded to Steel, Guard, or Surge.",
  fear: "Fear: at the start of the Engagement phase, each enemy at range 1 gains 1 strain.",
  ethereal: "Ethereal: moves through units and obstacles without effect (it still cannot end on top of a unit).",
  unstable: "Unstable: when destroyed, every unit at range 1 suffers 1 damage.",
  elusive: "Elusive: +1 defence die at range 2 and 3.",
  bane: "Bane: +1 attack die against undead and Calamity units.",
  brutal: "Brutal: +1 attack die at range 1.",
  stoneRune: "Rune of Stone: Brace may cancel a Rend.",
  phylactery: "Phylactery: starts with 2 Souls.",
  riftEye: "Eye of the Rift: Taint rolls only hurt on a Rend.",
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
    return true;
  });
}

/** Validate a muster list. Returns { ok, cost, errors }. */
export function validateArmy(factionId, list, budget) {
  const errors = [];
  const f = FACTIONS[factionId];
  if (!f) return { ok: false, cost: 0, errors: ["Pick a faction first."] };
  if (!Array.isArray(list) || list.length === 0) errors.push("Muster at least one unit.");
  if (Array.isArray(list) && list.length > 10) errors.push("No more than 10 units.");
  let cost = 0;
  let relics = 0;
  const uniques = new Set();
  for (const entry of list || []) {
    const u = f.units.find((x) => x.id === entry.unit);
    if (!u) { errors.push(`Unknown unit ${entry.unit}.`); continue; }
    cost += u.cost;
    if (u.unique) {
      if (uniques.has(u.id)) errors.push(`${u.name} is unique.`);
      uniques.add(u.id);
    }
    if (entry.upgrade) {
      const g = UPGRADES[entry.upgrade];
      if (!g || !upgradesFor(factionId, u).includes(g)) { errors.push(`${u.name} cannot take that upgrade.`); continue; }
      cost += g.cost;
      if (g.relic) relics++;
    }
  }
  if (relics > 1) errors.push("Only one relic per army.");
  if (cost > budget) errors.push(`Over budget: ${cost} / ${budget}.`);
  return { ok: errors.length === 0, cost, errors };
}
