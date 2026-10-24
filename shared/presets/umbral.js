// Prebuilt warbands for the Umbral Covenant. Schema: see shared/presets.js.
export const presets = [
  {
    id: "umbral-endless-march",
    gear: 1.5, // share of DP on magic items, tuned for balance (1 = default)
    name: "The Endless March",
    style: "Thrall tide",
    blurb: "A necromancer and a grave witch pull the strings on a wall of cheap, stubborn dead. Command the front rank forward, keep your masters behind it, and let sheer numbers grind the enemy down.",
    items: ["umbral-plague-hide", "umbral-pall-banner", "umbral-soul-grimoire", "umbral-grave-iron-plate", "umbral-ossuary-staff"],
    terrain: ["ruins", "marsh"],
    list: [
      { unit: "necromancer", upgrade: null },
      { unit: "umbGraveWitch", upgrade: null },
      { unit: "skeletons", upgrade: null },
      { unit: "skeletons", upgrade: null },
      { unit: "umbZombieHorde", upgrade: null },
      { unit: "umbZombieHorde", upgrade: null },
      { unit: "ghouls", upgrade: null },
      { unit: "ghouls", upgrade: null },
      { unit: "umbBoneGuard", upgrade: null },
    ],
  },
  {
    id: "umbral-grave-guard",
    gear: 0.01, // share of DP on magic items, tuned for balance (1 = default)
    name: "The Grave Guard",
    style: "All-rounder",
    blurb: "A solid first army: a shield line to hold, archers behind it, riders and knights to strike the flank, and a necromancer to direct the lot. Command the line, shoot what approaches, then charge.",
    items: ["umbral-widowmaker-bolts", "umbral-ossuary-shield", "umbral-pall-banner", "umbral-barrow-spears", "umbral-ossuary-staff"],
    terrain: ["hill", "ruins"],
    list: [
      { unit: "necromancer", upgrade: "hardened" },
      { unit: "umbBoneGuard", upgrade: null },
      { unit: "umbBoneGuard", upgrade: null },
      { unit: "umbSkeletonArchers", upgrade: null },
      { unit: "umbSkeletonArchers", upgrade: null },
      { unit: "umbHollowRiders", upgrade: null },
      { unit: "umbDeathKnights", upgrade: null },
      { unit: "ghouls", upgrade: null },
    ],
  },
  {
    id: "umbral-pale-chorus",
    name: "The Pale Chorus",
    style: "Terror and ethereal",
    blurb: "Ysolde leads a Wraith Host, the Banshee Choir and a Soul Reaver, spirits that ignore steel and make the living flinch. Fast and fragile: pick fights where fear breaks units for you, and fade back before the enemy can answer.",
    items: ["umbral-wailing-regalia", "umbral-soul-scythe", "umbral-ossuary-staff", "umbral-grave-locket", "umbral-bone-charm"],
    terrain: ["marsh", "ruins"],
    list: [
      { unit: "umbYsolde", upgrade: null },
      { unit: "wraiths", upgrade: null },
      { unit: "umbBanshees", upgrade: null },
      { unit: "umbSoulReaver", upgrade: null },
      { unit: "umbCultists", upgrade: null },
    ],
  },
  {
    id: "umbral-crimson-court",
    gear: 0.01, // share of DP on magic items, tuned for balance (1 = default)
    name: "The Crimson Court",
    style: "Vampiric elite",
    blurb: "Lord Malachar and his noble blood hit hard and heal on every wound. Few bodies, high quality: strike together, use Surge to stay on target, and never let the court get bogged down.",
    items: ["umbral-bloodletting-fang", "umbral-blood-chalice", "umbral-nightmare-barding", "umbral-nightshade-edge", "umbral-bone-charm"],
    terrain: ["ruins", "thicket"],
    list: [
      { unit: "umbMalachar", upgrade: null },
      { unit: "umbNightmareRiders", upgrade: null },
      { unit: "umbDeathKnights", upgrade: null },
      { unit: "umbVampireSpawn", upgrade: null },
      { unit: "umbCultists", upgrade: null },
    ],
  },
];
