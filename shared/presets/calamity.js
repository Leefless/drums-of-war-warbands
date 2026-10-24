// Prebuilt warbands for the Calamity Host. Schema: see shared/presets.js.
export const presets = [
  {
    id: "calamity-host-of-ruin",
    name: "The Host of Ruin",
    style: "All-rounder",
    blurb: "Two mutant lines hold the centre while a Mage Channels behind them and a Hulking Demon and Frenzied Mutants hit where the enemy bends. Hellhounds flank. A good first Calamity list.",
    list: [
      { unit: "mutants", upgrade: null },
      { unit: "mutants", upgrade: null },
      { unit: "mage", upgrade: null },
      { unit: "calBruteDemon", upgrade: null },
      { unit: "calHellhounds", upgrade: null },
      { unit: "calFrenziedMutants", upgrade: "veteran" },
    ],
  },
  {
    id: "calamity-burning-tide",
    name: "The Burning Tide",
    style: "Assault wave",
    blurb: "Fast, cheap bodies thrown at the enemy all at once. Hellhounds, twin Chargers and Winged Horrors strike first, Zealots, Frenzied Mutants and Bloodcallers follow to drain what is left. Close the distance before they can shoot you down.",
    list: [
      { unit: "calHellhounds", upgrade: null },
      { unit: "calRiftChargers", upgrade: null },
      { unit: "calRiftChargers", upgrade: null },
      { unit: "calFrenziedMutants", upgrade: null },
      { unit: "calZealots", upgrade: null },
      { unit: "calWingedHorrors", upgrade: null },
      { unit: "calBloodcallers", upgrade: null },
    ],
  },
  {
    id: "calamity-rift-choir",
    name: "The Rift Choir",
    style: "Caster battery",
    blurb: "A Calamity Mage and two Acolyte choirs Channel and blast from behind a Hulking Demon, Mutants and a Cultist screen. Keep the casters back, build Calamity charges, then turn the dice to Rends.",
    list: [
      { unit: "mage", upgrade: null },
      { unit: "calAcolytes", upgrade: null },
      { unit: "calAcolytes", upgrade: null },
      { unit: "calBruteDemon", upgrade: null },
      { unit: "mutants", upgrade: null },
      { unit: "calKoboldCultists", upgrade: null },
    ],
  },
  {
    id: "calamity-chosen-of-the-pit",
    name: "The Chosen of the Pit",
    style: "Elite few",
    blurb: "Demon Knights, a Hulking Demon and two mutant packs, with a Flesh-Hulk to screen. Few models, each one a threat the enemy must answer. Protect your big hitters and trade them for whole units.",
    list: [
      { unit: "calDemonKnights", upgrade: null },
      { unit: "calBruteDemon", upgrade: null },
      { unit: "mutants", upgrade: null },
      { unit: "calFleshHulk", upgrade: null },
      { unit: "calFrenziedMutants", upgrade: null },
    ],
  },
];
